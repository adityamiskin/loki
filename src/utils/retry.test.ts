import { describe, it, expect } from "bun:test";
import { withRetry, isTransientError, createExponentialBackoff } from "./retry";

describe("Retry Utility", () => {
  describe("withRetry", () => {
    it("should return result on first successful attempt", async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return "success";
      };
      const result = await withRetry(fn);
      expect(result).toBe("success");
      expect(callCount).toBe(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("transient");
        }
        return "success";
      };
      
      const result = await withRetry(fn, {
        maxRetries: 5,
        retryOn: isTransientError,
      });
      
      expect(result).toBe("success");
      expect(callCount).toBe(3);
    });

    it("should throw after max retries exceeded", async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        throw new Error("persistent");
      };
      
      await expect(
        withRetry(fn, { maxRetries: 2, retryOn: () => true })
      ).rejects.toThrow("persistent");
      
      expect(callCount).toBe(3);
    });

    it("should not retry if retryOn returns false", async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        throw new Error("non-transient");
      };
      
      await expect(
        withRetry(fn, { maxRetries: 3, retryOn: () => false })
      ).rejects.toThrow("non-transient");
      
      expect(callCount).toBe(1);
    });
  });

  describe("isTransientError", () => {
    it("should return true for connection reset errors", () => {
      expect(isTransientError({ message: "econnreset" })).toBe(true);
    });

    it("should return true for connection refused errors", () => {
      expect(isTransientError({ message: "econnrefused" })).toBe(true);
    });

    it("should return true for timeout errors", () => {
      expect(isTransientError({ message: "etimedout" })).toBe(true);
    });

    it("should return true for socket hang up errors", () => {
      expect(isTransientError({ message: "socket hang up" })).toBe(true);
    });

    it("should return true for network errors", () => {
      expect(isTransientError({ message: "network" })).toBe(true);
    });

    it("should return false for non-transient errors", () => {
      expect(isTransientError({ message: "file not found" })).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isTransientError("string error")).toBe(false);
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });
  });

  describe("createExponentialBackoff", () => {
    it("should calculate correct delays", () => {
      const backoff = createExponentialBackoff(1000, 2, 30000);
      expect(backoff(0)).toBe(1000);
      expect(backoff(1)).toBe(2000);
      expect(backoff(2)).toBe(4000);
      expect(backoff(3)).toBe(8000);
    });

    it("should cap at max delay", () => {
      const backoff = createExponentialBackoff(1000, 2, 5000);
      expect(backoff(0)).toBe(1000);
      expect(backoff(1)).toBe(2000);
      expect(backoff(2)).toBe(4000);
      expect(backoff(3)).toBe(5000);
      expect(backoff(10)).toBe(5000);
    });
  });
});
