import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";

export const writeFile = tool({
  description: `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`,
  inputSchema: z.object({
    content: z.string().describe("The content to write to the file"),
    filePath: z
      .string()
      .describe("The path to the file to write (can be relative or absolute)"),
  }),
  execute: async ({ content, filePath }) => {
    try {
      // Resolve the file path
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      // Ensure the directory exists
      const dir = path.dirname(resolvedPath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Check if file exists before writing
      const exists = fs.existsSync(resolvedPath);

      // Write the file
      await Bun.write(resolvedPath, content);

      const stats = await fs.promises.stat(resolvedPath);

      return {
        filePath: resolvedPath,
        existed: exists,
        size: stats.size,
        message: exists
          ? `File overwritten: ${resolvedPath}`
          : `File created: ${resolvedPath}`,
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }
  },
});
