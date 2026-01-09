import { describe, it, expect } from "bun:test";
import {
  categorizeError,
  createTypedError,
  isRecoverable,
  ErrorCategory,
  ErrorCode,
} from "../errors";

describe("errors utility", () => {
  describe("categorizeError", () => {
    it("detects validation errors", () => {
      const error = new Error("Validation failed due to invalid input");
      expect(categorizeError(error)).toBe(ErrorCategory.VALIDATION);
    });

    it("detects permission errors", () => {
      const error = new Error("Permission denied: EACCES");
      expect(categorizeError(error)).toBe(ErrorCategory.PERMISSION);
    });

    it("detects filesystem errors", () => {
      const error = new Error("ENOENT: file not found");
      expect(categorizeError(error)).toBe(ErrorCategory.FILESYSTEM);
    });

    it("falls back to unknown", () => {
      expect(categorizeError(new Error("unexpected"))).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe("createTypedError", () => {
    it("builds typed error with metadata", () => {
      const error = createTypedError(
        "network failure",
        ErrorCategory.NETWORK,
        ErrorCode.NETWORK_ERROR,
        {
          recoverable: true,
          suggestions: ["check connection"],
        }
      );

      expect(error.message).toBe("network failure");
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.recoverable).toBe(true);
      expect(error.suggestions).toEqual(["check connection"]);
    });

    it("defaults recoverable to false", () => {
      const error = createTypedError(
        "invalid input",
        ErrorCategory.VALIDATION,
        ErrorCode.INVALID_INPUT
      );
      expect(error.recoverable).toBe(false);
    });
  });

  describe("isRecoverable", () => {
    it("returns true for typed recoverable errors", () => {
      const error = createTypedError(
        "temporary network glitch",
        ErrorCategory.NETWORK,
        ErrorCode.NETWORK_ERROR,
        { recoverable: true }
      );
      expect(isRecoverable(error)).toBe(true);
    });

    it("returns true for inferred transient categories", () => {
      const error = new Error("ETIMEDOUT waiting for response");
      expect(isRecoverable(error)).toBe(true);
    });

    it("returns false for non-recoverable errors", () => {
      const error = createTypedError(
        "bad input",
        ErrorCategory.VALIDATION,
        ErrorCode.INVALID_INPUT
      );
      expect(isRecoverable(error)).toBe(false);
    });
  });
});
