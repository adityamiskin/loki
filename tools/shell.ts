import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { categorizeError, ErrorCategory, ErrorCode, createTypedError } from "../src/utils/errors";
import { isTransientError } from "../src/utils/retry";

const execAsync = promisify(exec);

const DANGEROUS_PATTERNS = [
  /\|\s*\s*$/,
  /\>\s*\/dev\/null/,
  /\>\s*2>&1/,
  /\$\(/,
  /`[^`]+`/,
  /\$\{/,
  /\;.*\;/,
  /\|\s*\(.*\)/,
];

function containsDangerousPatterns(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

function sanitizeCommand(command: string): { sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  let sanitized = command;

  const trimmed = command.trim();
  if (!trimmed) {
    return { sanitized: "", warnings: ["Empty command provided"] };
  }

  if (trimmed.length > 10000) {
    warnings.push("Command exceeds recommended length of 10000 characters");
    sanitized = trimmed.substring(0, 10000);
  }

  if (containsDangerousPatterns(command)) {
    warnings.push("Command contains potentially dangerous patterns");
  }

  return { sanitized: sanitized.trim(), warnings };
}

function categorizeExecError(error: unknown, command: string): {
  category: ErrorCategory;
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  suggestions: string[];
} {
  const err = error as { code?: string; errno?: string; message?: string };

  if (err.code === "ENOENT" || err.message?.includes("not found")) {
    return {
      category: ErrorCategory.RUNTIME,
      code: ErrorCode.COMMAND_NOT_FOUND,
      message: `Command not found: ${command.split(" ")[0]}`,
      recoverable: false,
      suggestions: [
        "Check if the command is installed",
        "Verify the command path is correct",
        "Use the full path to the executable",
      ],
    };
  }

  if (err.code === "EACCES" || err.code === "EPERM") {
    return {
      category: ErrorCategory.PERMISSION,
      code: ErrorCode.PERMISSION_DENIED,
      message: "Permission denied executing command",
      recoverable: false,
      suggestions: [
        "Check file permissions",
        "Verify you have execution rights",
        "Try running with appropriate privileges",
      ],
    };
  }

  if (err.message?.includes("timed out") || err.code === "ETIMEDOUT") {
    return {
      category: ErrorCategory.TIMEOUT,
      code: ErrorCode.TIMEOUT_EXCEEDED,
      message: "Command execution timed out",
      recoverable: true,
      suggestions: [
        "Try a shorter timeout value for long-running commands",
        "Break down the command into smaller steps",
        "Use background execution for tasks that take longer",
      ],
    };
  }

  if (err.code === "ENOBUFS" || err.message?.includes("maxBuffer")) {
    return {
      category: ErrorCategory.RUNTIME,
      code: ErrorCode.QUOTA_EXCEEDED,
      message: "Command output exceeded buffer limit",
      recoverable: false,
      suggestions: [
        "Redirect output to a file instead of capturing it",
        "Use grep/filter to reduce output before capture",
        "Increase maxBuffer if appropriate",
      ],
    };
  }

  const category = categorizeError(error);
  return {
    category,
    code: ErrorCode.INTERNAL_ERROR,
    message: `Command failed: ${err.message || String(error)}`,
    recoverable: isTransientError(error),
    suggestions: ["Check the command syntax", "Verify all required resources are available"],
  };
}

export const shell = tool({
  description: `Execute a shell command. Use this to run commands, check files, list directories, write files, apply patches, find etc. for python related stuff, first \`source .venv/bin/activate.fish\` and then you can use any python stuff. use uv instead of pip. Ex. \`uv pip install <package_name>\` or \`uv run <script.py>\`.

  Usage:
  - Use this to run commands, check files, list directories, write files, apply patches, find etc.
  - For python related stuff, first \`source .venv/bin/activate.fish\` and then you can use any python stuff.
  - use uv instead of pip. Ex. \`uv pip install <package_name>\` or \`uv run <script.py>\`.
  Full network access is available.`,
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The shell command to execute (e.g., 'ls -la', 'cat file.txt', 'pwd')"
      ),
  }),
  execute: async ({ command }) => {
    const TIMEOUT_MS = 300000;

    const { sanitized, warnings } = sanitizeCommand(command);
    if (!sanitized) {
      return {
        output: "Error: Empty or invalid command provided",
        exitCode: 1,
        warnings,
      };
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Command timed out after ${TIMEOUT_MS}ms`));
        }, TIMEOUT_MS);
      });

      const execPromise = execAsync(sanitized, {
        maxBuffer: 10 * 1024 * 1024,
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
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      const { category, code, message, recoverable, suggestions } =
        categorizeExecError(error, sanitized);

      const typedError = createTypedError(message, category, code, {
        recoverable,
        suggestions,
        cause: error as Error,
      });

      return {
        output: `Error: ${message}`,
        exitCode: (error as { code?: number }).code || 1,
        errorCategory: category,
        errorCode: code,
        recoverable,
        suggestions,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  },
});
