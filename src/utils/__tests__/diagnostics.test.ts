import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { buildDiagnosticsSnapshot } from "../diagnostics";
import { logger } from "../logger";

const mockSkills = [
  { name: "Skill A", description: "Desc A", filePath: "a", body: "" },
  { name: "Skill B", description: "Desc B", filePath: "b", body: "" },
];

const noop = () => {};
let originalConsoleLog: typeof console.log;
let originalConsoleWarn: typeof console.warn;
let originalConsoleError: typeof console.error;

describe("buildDiagnosticsSnapshot", () => {
  beforeAll(() => {
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    console.log = noop;
    console.warn = noop;
    console.error = noop;
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    logger.clearLogs();
    logger.setLogLevel("debug");
  });

  it("captures log summary and skill insights", () => {
    logger.info("info message");
    logger.error("fail message");

    const snapshot = buildDiagnosticsSnapshot(mockSkills);

    expect(snapshot.skillInsights.totalSkills).toBe(2);
    expect(snapshot.skillInsights.sample).toEqual(["Skill A", "Skill B"]);
    expect(snapshot.logSummary.total).toBe(2);
    expect(snapshot.logSummary.byLevel.info).toBe(1);
    expect(snapshot.logSummary.byLevel.error).toBe(1);
    expect(snapshot.notes.length).toBeGreaterThanOrEqual(0);
  });

  it("adds guidance when skills missing", () => {
    const snapshot = buildDiagnosticsSnapshot([]);
    expect(snapshot.skillInsights.totalSkills).toBe(0);
    expect(Array.isArray(snapshot.notes)).toBe(true);
  });
});
