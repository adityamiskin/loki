import { tool } from "ai";
import { z } from "zod";
import * as path from "path";

export const globFiles = tool({
  description: `Fast file pattern matching tool that works with any codebase size.

Usage:
- Supports glob patterns like \`**/*.js\` or \`src/**/*.ts\`
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the subAgent tool instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful`,
  inputSchema: z.object({
    pattern: z
      .string()
      .describe(
        "The glob pattern to match files against (e.g. `*.ts`, `src/**/*.js`)"
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        "The directory to search in. Defaults to current working directory."
      ),
  }),
  execute: async ({ pattern, cwd = "." }) => {
    try {
      const searchPath = path.isAbsolute(cwd)
        ? cwd
        : path.resolve(process.cwd(), cwd);

      // Use ripgrep to find files matching the glob pattern
      const proc = Bun.spawn(["rg", "--files", "--glob", pattern], {
        cwd: searchPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      const errorOutput = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // ripgrep exits with 1 when no files found, which is not an error
      if (exitCode !== 0 && exitCode !== 1) {
        throw new Error(`File search failed: ${errorOutput}`);
      }

      if (!output.trim()) {
        return {
          files: [],
          count: 0,
          results: "No files found matching the pattern",
        };
      }

      const files = output
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);

      // Get file stats and sort by modification time (most recent first)
      const filesWithStats = await Promise.all(
        files.map(async (filePath) => {
          try {
            const fullPath = path.resolve(searchPath, filePath);
            const stat = await Bun.file(fullPath).stat();
            return {
              path: fullPath,
              mtime: stat.mtime.getTime(),
            };
          } catch {
            return {
              path: path.resolve(searchPath, filePath),
              mtime: 0,
            };
          }
        })
      );

      filesWithStats.sort((a, b) => b.mtime - a.mtime);

      // Limit results to prevent overwhelming output
      const limit = 50;
      const truncated = filesWithStats.length > limit;
      const finalFiles = truncated
        ? filesWithStats.slice(0, limit)
        : filesWithStats;

      let result = `Found ${files.length} files`;
      if (truncated) {
        result += ` (showing ${limit} most recent)`;
      }
      result += ":\n\n";

      result += finalFiles.map((file) => file.path).join("\n");

      if (truncated) {
        result +=
          "\n\n(Results truncated. Consider using a more specific pattern for complete results.)";
      }

      return {
        files: finalFiles.map((file) => file.path),
        count: files.length,
        results: result,
        truncated,
      };
    } catch (error) {
      throw new Error(`Glob search failed: ${error}`);
    }
  },
});
