import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import { createTypedError, ErrorCategory, ErrorCode } from "../src/utils/errors";
import { withRetry, isTransientError } from "../src/utils/retry";

const MAX_LINE_LENGTH = 2000;

function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

export const grep = tool({
  description: `Fast content search tool that works with any codebase size.

Usage:
- Searches file contents using regular expressions
- Supports full regex syntax (eg. \`log.*Error\`, \`function\\s+\\w+\`, etc.)
- Filter files by pattern with the include parameter (eg. \`*.js\`, \`*.{ts,tsx}\`)
- Returns file paths and line numbers with at least one match sorted by modification time
- Use this tool when you need to find files containing specific patterns
- If you need to identify/count the number of matches within files, use the shell tool with \`rg\` (ripgrep) directly. Do NOT use \`grep\`.
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the subAgent tool instead`,
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("The regex pattern to search for in file contents"),
    path: z
      .string()
      .optional()
      .describe(
        "The directory to search in. Defaults to current working directory."
      ),
    glob: z
      .string()
      .optional()
      .describe('File pattern to include (e.g. "*.js", "*.{ts,tsx}")'),
    caseInsensitive: z.boolean().optional().describe("Case insensitive search"),
  }),
  execute: async ({
    pattern,
    path: searchPath = ".",
    glob,
    caseInsensitive = false,
  }) => {
    const patternValidation = validateRegexPattern(pattern);
    if (!patternValidation.valid) {
      throw createTypedError(
        `Invalid regex pattern: ${patternValidation.error}`,
        ErrorCategory.VALIDATION,
        ErrorCode.REGEX_ERROR,
        {
          recoverable: false,
          suggestions: [
            "Check regex syntax for missing closing brackets or escapes",
            "Use a simpler pattern to test",
            "Test the pattern in a regex tester first",
          ],
        }
      );
    }

    const searchWithRetry = async () => {
      const args = ["--line-number", "--with-filename"];

      if (caseInsensitive) {
        args.push("--ignore-case");
      }

      if (glob) {
        args.push("--glob", glob);
      }

      args.push("--regexp", pattern);
      args.push(searchPath);

      const proc = Bun.spawn(["rg", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      const errorOutput = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0 && exitCode !== 1) {
        throw new Error(`Search failed: ${errorOutput}`);
      }

      return { output, errorOutput, exitCode };
    };

    try {
      const { output, exitCode } = await withRetry(searchWithRetry, {
        maxRetries: 2,
        retryOn: isTransientError,
      });

      if (!output.trim()) {
        return {
          matches: 0,
          results: "No matches found",
        };
      }

      const lines = output.trim().split("\n");
      const matches = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const secondColonIndex = line.indexOf(":", colonIndex + 1);
        if (secondColonIndex === -1) continue;

        const filePath = line.substring(0, colonIndex);
        const lineNum = parseInt(
          line.substring(colonIndex + 1, secondColonIndex),
          10
        );
        const lineText = line.substring(secondColonIndex + 1);

        if (isNaN(lineNum)) continue;

        matches.push({
          file: filePath,
          line: lineNum,
          text:
            lineText.length > MAX_LINE_LENGTH
              ? lineText.substring(0, MAX_LINE_LENGTH) + "..."
              : lineText,
        });
      }

      const limit = 50;
      const truncated = matches.length > limit;
      const finalMatches = truncated ? matches.slice(0, limit) : matches;

      let result = `Found ${matches.length} matches`;
      if (truncated) {
        result += ` (showing first ${limit})`;
      }
      result += ":\n\n";

      let currentFile = "";
      for (const match of finalMatches) {
        if (currentFile !== match.file) {
          if (currentFile !== "") {
            result += "\n";
          }
          currentFile = match.file;
          result += `${match.file}:\n`;
        }
        result += `  ${match.line}: ${match.text}\n`;
      }

      if (truncated) {
        result +=
          "\n(Results truncated. Use a more specific pattern or path for complete results.)\n";
      }

      return {
        matches: matches.length,
        results: result.trim(),
        truncated,
      };
    } catch (error) {
      throw createTypedError(
        `Grep search failed: ${(error as Error).message}`,
        ErrorCategory.RUNTIME,
        ErrorCode.INTERNAL_ERROR,
        {
          recoverable: isTransientError(error),
          suggestions: [
            "Try a simpler pattern",
            "Verify the search path exists",
            "Check if ripgrep is installed",
          ],
        }
      );
    }
  },
});
