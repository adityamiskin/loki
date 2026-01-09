import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { logger } from "../logger";

const noop = () => {};
let originalConsoleLog: typeof console.log;
let originalConsoleWarn: typeof console.warn;
let originalConsoleError: typeof console.error;
let originalConsoleDebug: typeof console.debug;

describe("logger", () => {
  beforeAll(() => {
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleDebug = console.debug;
    console.log = noop;
    console.warn = noop;
    console.error = noop;
    console.debug = noop;
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
  });

  beforeEach(() => {
    logger.clearLogs();
    logger.setLogLevel("info");
    logger.setModule("test-module");
  });

  it("respects log level thresholds", () => {
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    const logs = logger.getLogs();
    expect(logs).toHaveLength(3);
    expect(logs[0]!.level).toBe("info");
    expect(logs[1]!.level).toBe("warn");
    expect(logs[2]!.level).toBe("error");
  });

  it("captures metadata and errors", () => {
    const testError = new Error("boom");
    logger.info("info", { key: "value" });
    logger.error("fail", undefined, testError);

    const logs = logger.getLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0]!.metadata).toEqual({ key: "value" });
    expect(logs[1]!.error).toBeDefined();
    expect(logs[1]!.error?.message).toBe("boom");
  });

  it("honors max log retention", () => {
    for (let i = 0; i < 1100; i++) {
      logger.info(`entry-${i}`);
    }

    expect(logger.getLogs()).toHaveLength(1000);
  });

  it("exports and clears logs", () => {
    logger.warn("warning");
    const exportPayload = logger.exportLogs();
    const parsed = JSON.parse(exportPayload);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    logger.clearLogs();
    expect(logger.getLogs()).toHaveLength(0);
  });

  it("summarizes log levels and recency", () => {
    logger.setLogLevel("debug");
    logger.debug("debug entry");
    logger.info("info entry");
    logger.warn("warn entry");

    const summary = logger.getSummary(2);
    expect(summary.total).toBe(3);
    expect(summary.byLevel.debug).toBe(1);
    expect(summary.byLevel.info).toBe(1);
    expect(summary.byLevel.warn).toBe(1);
    expect(summary.recent).toHaveLength(2);
    expect(summary.recent[0]?.message).toBe("info entry");
    expect(summary.recent[1]?.message).toBe("warn entry");
    expect(summary.lastTimestamp).toBeDefined();
  });
});
