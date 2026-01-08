import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";
import { createTypedError, ErrorCategory, ErrorCode } from "../src/utils/errors";

interface FileLock {
  path: string;
  timestamp: number;
  owner: string;
}

const fileLocks = new Map<string, FileLock>();
const LOCK_TIMEOUT_MS = 30000;

function acquireLock(filePath: string): boolean {
  const now = Date.now();
  const existing = fileLocks.get(filePath);

  if (existing) {
    if (now - existing.timestamp > LOCK_TIMEOUT_MS) {
      fileLocks.delete(filePath);
    } else {
      return false;
    }
  }

  fileLocks.set(filePath, {
    path: filePath,
    timestamp: now,
    owner: `process-${process.pid}`,
  });

  return true;
}

function releaseLock(filePath: string): void {
  fileLocks.delete(filePath);
}

export const editFile = tool({
  description: `Performs exact string replacements in files. 

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt to edit without reading the file. 
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the oldString or newString.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`oldString\` is not found in the file with an error "oldString not found in content".
- The edit will FAIL if \`oldString\` is found multiple times in the file with an error "oldString found multiple times and requires more code context to uniquely identify the intended match". Either provide a larger string with more surrounding context to make it unique or use \`replaceAll\` to change every instance of \`oldString\`. 
- Use \`replaceAll\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
  inputSchema: z.object({
    filePath: z
      .string()
      .describe("The path to the file to edit (can be relative or absolute)"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The text to replace it with"),
    replaceAll: z
      .boolean()
      .optional()
      .describe("Replace all occurrences (default: false)"),
  }),
  execute: async ({ filePath, oldString, newString, replaceAll = false }) => {
    if (oldString === newString) {
      throw createTypedError(
        "oldString and newString must be different",
        ErrorCategory.VALIDATION,
        ErrorCode.INVALID_INPUT,
        { recoverable: false }
      );
    }

    if (!oldString.trim()) {
      throw createTypedError(
        "oldString cannot be empty or whitespace only",
        ErrorCategory.VALIDATION,
        ErrorCode.INVALID_INPUT,
        { recoverable: false }
      );
    }

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw createTypedError(
        `File not found: ${resolvedPath}`,
        ErrorCategory.FILESYSTEM,
        ErrorCode.FILE_NOT_FOUND,
        {
          recoverable: false,
          suggestions: [
            "Check if the file path is correct",
            "Verify the file exists",
            "Use an absolute path if needed",
          ],
        }
      );
    }

    if (!acquireLock(resolvedPath)) {
      throw createTypedError(
        `File is currently being edited by another process: ${resolvedPath}`,
        ErrorCategory.RUNTIME,
        ErrorCode.CONCURRENT_MODIFICATION,
        {
          recoverable: true,
          suggestions: [
            "Wait for the current edit to complete",
            "Try again in a few moments",
            "Use a different approach if this persists",
          ],
        }
      );
    }

    try {
      const content = await fs.promises.readFile(resolvedPath, "utf-8");

      const occurrenceCount = replaceAll
        ? (content.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
        : 1;

      let newContent: string;
      if (replaceAll) {
        newContent = content.replaceAll(oldString, newString);
      } else {
        newContent = content.replace(oldString, newString);
      }

      if (newContent === content) {
        const matchCount = (content.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        if (matchCount === 0) {
          throw createTypedError(
            `Text "${oldString}" not found in file`,
            ErrorCategory.VALIDATION,
            ErrorCode.INVALID_INPUT,
            { recoverable: false }
          );
        }
      }

      await fs.promises.writeFile(resolvedPath, newContent, "utf-8");

      const replacements = replaceAll
        ? newContent.split(newString).length -
          1 -
          (content.split(newString).length - 1)
        : 1;

      return {
        filePath: resolvedPath,
        replacements,
        message: `Replaced ${replacements} occurrence(s) in ${resolvedPath}`,
      };
    } catch (error) {
      if (error instanceof Error && "category" in error) {
        throw error;
      }
      throw createTypedError(
        `Failed to edit file: ${(error as Error).message}`,
        ErrorCategory.FILESYSTEM,
        ErrorCode.INTERNAL_ERROR,
        { recoverable: false }
      );
    } finally {
      releaseLock(resolvedPath);
    }
  },
});
