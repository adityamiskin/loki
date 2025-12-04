import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const local_shell = tool({
  description:
    "Execute a shell command locally. Use this to run commands, check files, list directories, etc.",
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The shell command to execute (e.g., 'ls -la', 'cat file.txt', 'pwd')"
      ),
  }),
  execute: async ({ command }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 30000, // 30 second timeout
      });

      let output = stdout || "";
      if (stderr) {
        output += (output ? "\n" : "") + `STDERR: ${stderr}`;
      }

      return {
        output: output || "(no output)",
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        output: `Error: ${error.message || String(error)}`,
        exitCode: error.code || 1,
      };
    }
  },
});
