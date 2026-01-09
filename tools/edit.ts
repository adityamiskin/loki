import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";

export const editFile = tool({
  description: `Performs exact string replacements in files. 

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. 
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
    try {
      if (oldString === newString) {
        throw new Error("oldString and newString must be different");
      }

      // Resolve the file path
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      // Read the current content
      const content = await fs.promises.readFile(resolvedPath, "utf-8");

      // Perform the replacement
      let newContent: string;
      if (replaceAll) {
        newContent = content.replaceAll(oldString, newString);
      } else {
        newContent = content.replace(oldString, newString);
      }

      // Check if any replacement was made
      if (newContent === content) {
        throw new Error(`Text "${oldString}" not found in file`);
      }

      // Write the new content
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
      throw error;
    }
  },
});
