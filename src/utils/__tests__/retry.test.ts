import { describe, it, expect } from "bun:test";
import { withRetry, createExponentialBackoff, isTransientError } from "../retry";

describe("retry utility", () => {
  describe("withRetry", () => {
    it("succeeds after transient failures", async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error("network timeout");
          }
          return "ok";
        },
        {
          maxRetries: 4,
          initialDelayMs: 5,
          maxDelayMs: 5,
          retryOn: isTransientError,
        }
      );

      expect(result).toBe("ok");
      expect(attempts).toBe(3);
    });

    it("stops retrying when predicate returns false", async () => {
      let attempts = 0;
      await expect(
        withRetry(
          async () => {
            attempts += 1;
            throw new Error("fatal");
          },
          {
            maxRetries: 5,
            retryOn: () => false,
          }
        )
      ).rejects.toThrow("fatal");

      expect(attempts).toBe(1);
    });
  });

  describe("createExponentialBackoff", () => {
    it("caps the delay at maxDelay", () => {
      const backoff = createExponentialBackoff(10, 2, 40);
      expect(backoff(0)).toBe(10);
      expect(backoff(1)).toBe(20);
      expect(backoff(2)).toBe(40);
      expect(backoff(3)).toBe(40);
    });
  });

  describe("isTransientError", () => {
    it("detects known transient patterns", () => {
      expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
      expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
      expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
      expect(isTransientError(new Error("socket hang up"))).toBe(true);
      expect(isTransientError(new Error("network error"))).toBe(true);
    });

    it("returns false for other errors and primitives", () => {
      expect(isTransientError(new Error("file not found"))).toBe(false);
      expect(isTransientError("plain string" as unknown)).toBe(false);
    });
  });
});
