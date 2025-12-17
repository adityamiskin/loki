import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const local_shell = tool({
  description:
    "Execute a shell command locally. Use this to run commands, check files, list directories, write files, apply patches, find etc.",
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The shell command to execute (e.g., 'ls -la', 'cat file.txt', 'pwd')"
      ),
  }),
  execute: async ({ command }) => {
    const TIMEOUT_MS = 10000; // 10 second timeout

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Command timed out after ${TIMEOUT_MS}ms`));
        }, TIMEOUT_MS);
      });

      const execPromise = execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: TIMEOUT_MS,
      });

      const { stdout, stderr } = await Promise.race([
        execPromise,
        timeoutPromise,
      ]);

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
