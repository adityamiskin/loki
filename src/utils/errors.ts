export enum ErrorCategory {
  VALIDATION = "validation",
  RUNTIME = "runtime",
  NETWORK = "network",
  SECURITY = "security",
  FILESYSTEM = "filesystem",
  TIMEOUT = "timeout",
  PERMISSION = "permission",
  UNKNOWN = "unknown",
}

export enum ErrorCode {
  INVALID_INPUT = "INVALID_INPUT",
  COMMAND_NOT_FOUND = "COMMAND_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  TIMEOUT_EXCEEDED = "TIMEOUT_EXCEEDED",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  NETWORK_ERROR = "NETWORK_ERROR",
  REGEX_ERROR = "REGEX_ERROR",
  CONCURRENT_MODIFICATION = "CONCURRENT_MODIFICATION",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export interface TypedError extends Error {
  category: ErrorCategory;
  code: ErrorCode;
  recoverable: boolean;
  suggestions?: string[];
}

export function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (
      name.includes("validation") ||
      message.includes("invalid") ||
      message.includes("validation")
    ) {
      return ErrorCategory.VALIDATION;
    }

    if (
      name.includes("permission") ||
      message.includes("permission denied") ||
      message.includes("eacces")
    ) {
      return ErrorCategory.PERMISSION;
    }

    if (
      name.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("etimedout")
    ) {
      return ErrorCategory.TIMEOUT;
    }

    if (
      name.includes("enoent") ||
      message.includes("not found") ||
      message.includes("file not found")
    ) {
      return ErrorCategory.FILESYSTEM;
    }

    if (
      name.includes("network") ||
      message.includes("connection") ||
      message.includes("econn")
    ) {
      return ErrorCategory.NETWORK;
    }

    if (
      name.includes("security") ||
      message.includes("forbidden") ||
      message.includes("access denied")
    ) {
      return ErrorCategory.SECURITY;
    }
  }

  return ErrorCategory.UNKNOWN;
}

export function createTypedError(
  message: string,
  category: ErrorCategory,
  code: ErrorCode,
  options?: {
    recoverable?: boolean;
    suggestions?: string[];
    cause?: Error;
  }
): TypedError {
  const error = new Error(message) as TypedError;
  error.category = category;
  error.code = code;
  error.recoverable = options?.recoverable ?? false;
  error.suggestions = options?.suggestions;
  error.cause = options?.cause;
  return error;
}

export function isRecoverable(error: unknown): boolean {
  if (error instanceof Error && "recoverable" in error) {
    return (error as TypedError).recoverable;
  }
  const category = categorizeError(error);
  return category === ErrorCategory.NETWORK || category === ErrorCategory.TIMEOUT;
}
