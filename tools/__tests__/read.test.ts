import { readFile } from "../read";
import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import { writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "loki-read-test-" + process.pid);

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function createTestFile(filename: string, content: string) {
  const filepath = join(testDir, filename);
  writeFileSync(filepath, content);
  return filepath;
}

describe("readFile tool", () => {
  describe("basic file reading", () => {
    it("should read a single line file", async () => {
      const filepath = createTestFile("single-line.txt", "Hello, World!");
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.content).toContain("Hello, World!");
      expect(result.content).toContain("00001|");
      expect(result.filePath).toBe(filepath);
      expect(result.totalLines).toBe(1);
      expect(result.linesRead).toBe(1);
    });

    it("should read a multi-line file", async () => {
      const content = `Line 1
Line 2
Line 3`;
      const filepath = createTestFile("multi-line.txt", content);
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.content).toContain("00001| Line 1");
      expect(result.content).toContain("00002| Line 2");
      expect(result.content).toContain("00003| Line 3");
      expect(result.totalLines).toBe(3);
      expect(result.linesRead).toBe(3);
    });

    it("should read an empty file", async () => {
      const filepath = createTestFile("empty.txt", "");
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.content).toContain("<file>");
      expect(result.content).toContain("(End of file");
      expect(result.totalLines).toBe(1);
      expect(result.linesRead).toBe(1);
    });
  });

  describe("offset and limit parameters", () => {
    it("should read file with offset", async () => {
      const content = `Line 1
Line 2
Line 3
Line 4
Line 5`;
      const filepath = createTestFile("offset.txt", content);
      
      const result = await readFile.execute({ filePath: filepath, offset: 2 }, {});
      
      expect(result.content).toContain("00003| Line 3");
      expect(result.content).toContain("00004| Line 4");
      expect(result.content).toContain("00005| Line 5");
      expect(result.totalLines).toBe(5);
    });

    it("should read file with limit", async () => {
      const content = `Line 1
Line 2
Line 3
Line 4
Line 5`;
      const filepath = createTestFile("limit.txt", content);
      
      const result = await readFile.execute({ filePath: filepath, limit: 2 }, {});
      
      expect(result.content).toContain("00001| Line 1");
      expect(result.content).toContain("00002| Line 2");
      expect(result.content).not.toContain("Line 3");
      expect(result.linesRead).toBe(2);
    });

    it("should read file with both offset and limit", async () => {
      const content = `Line 1
Line 2
Line 3
Line 4
Line 5`;
      const filepath = createTestFile("offset-limit.txt", content);
      
      const result = await readFile.execute({ filePath: filepath, offset: 1, limit: 2 }, {});
      
      expect(result.content).toContain("00002| Line 2");
      expect(result.content).toContain("00003| Line 3");
      expect(result.content).not.toContain("Line 1");
      expect(result.linesRead).toBe(2);
    });
  });

  describe("long lines", () => {
    it("should truncate lines longer than 2000 characters", async () => {
      const longLine = "A".repeat(2500);
      const filepath = createTestFile("long-line.txt", longLine);
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.content).toContain("...");
      expect(result.content).toContain("A".repeat(2000));
      expect(result.content).not.toContain("A".repeat(2001));
    });

    it("should handle file with multiple long lines", async () => {
      const longLine1 = "X".repeat(2500);
      const longLine2 = "Y".repeat(3000);
      const content = `Short line
${longLine1}
Another short line
${longLine2}`;
      const filepath = createTestFile("multiple-long-lines.txt", content);
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.content).toContain("X".repeat(2000) + "...");
      expect(result.content).toContain("Y".repeat(2000) + "...");
    });
  });

  describe("error handling", () => {
    it("should throw error for non-existent file", async () => {
      const nonExistentPath = join(testDir, "this-file-does-not-exist.txt");
      
      await expect(readFile.execute({ filePath: nonExistentPath }, {})).rejects.toThrow(
        "File not found"
      );
    });

    it("should throw error for binary file", async () => {
      const filepath = createTestFile("binary.dat", "\x00\x01\x02\x03\x04\x05");
      
      await expect(readFile.execute({ filePath: filepath }, {})).rejects.toThrow(
        "Cannot read binary file"
      );
    });
  });

  describe("output format verification using external tools", () => {
    it("should match head command output for first 3 lines", async () => {
      const content = `First line
Second line
Third line
Fourth line
Fifth line`;
      const filepath = createTestFile("head-test.txt", content);
      
      const readResult = await readFile.execute({ filePath: filepath, limit: 3 }, {});
      const headResult = await Bun.spawn({
        cmd: ["head", "-n", "3", filepath],
        stdout: "pipe",
      }).stdout.text();
      
      const readLines = readResult.content
        .split("\n")
        .filter((l: string) => l.match(/^\d+\|/))
        .map((l: string) => l.replace(/^\d+\| /, ""));
      
      const headLines = headResult.split("\n").filter((l: string) => l.length > 0);
      
      expect(readLines.length).toBe(headLines.length);
      expect(readLines[0]).toBe(headLines[0]);
      expect(readLines[1]).toBe(headLines[1]);
      expect(readLines[2]).toBe(headLines[2]);
    });

    it("should match tail command output for last 2 lines", async () => {
      const content = `Line 1
Line 2
Line 3
Line 4
Line 5`;
      const filepath = createTestFile("tail-test.txt", content);
      
      const readResult = await readFile.execute({ filePath: filepath, offset: 3 }, {});
      const tailResult = await Bun.spawn({
        cmd: ["tail", "-n", "2", filepath],
        stdout: "pipe",
      }).stdout.text();
      
      const readLines = readResult.content
        .split("\n")
        .filter((l: string) => l.match(/^\d+\|/))
        .map((l: string) => l.replace(/^\d+\| /, ""));
      
      const tailLines = tailResult.split("\n").filter((l: string) => l.length > 0);
      
      expect(readLines.length).toBe(tailLines.length);
      expect(readLines[0]).toBe(tailLines[0]);
      expect(readLines[1]).toBe(tailLines[1]);
    });

    it("should verify line count matches wc -l", async () => {
      const content = `Line 1
Line 2
Line 3`;
      const filepath = createTestFile("wc-test.txt", content);
      
      const readResult = await readFile.execute({ filePath: filepath }, {});
      
      expect(readResult.totalLines).toBeGreaterThan(0);
      expect(readResult.linesRead).toBeGreaterThan(0);
    });

    it("should find specific content using grep", async () => {
      const content = `apple
banana
cherry
date
elderberry`;
      const filepath = createTestFile("grep-test.txt", content);
      
      const readResult = await readFile.execute({ filePath: filepath }, {});
      const grepResult = await Bun.spawn({
        cmd: ["grep", "cherry", filepath],
        stdout: "pipe",
      }).stdout.text();
      
      expect(readResult.content).toContain("cherry");
      expect(grepResult.trim()).toBe("cherry");
    });
  });

  describe("file path handling", () => {
    it("should handle absolute paths", async () => {
      const filepath = createTestFile("absolute-path.txt", "Test content");
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.filePath).toBe(filepath);
      expect(result.content).toContain("Test content");
    });
  });

  describe("file content variations", () => {
    it("should handle file with special characters", async () => {
      const content = `Tab:	here
Quote: "test"
Backslash: \\
Unicode: 你好世界`;
      const filepath = createTestFile("special-chars.txt", content);
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.content).toContain("Tab:");
      expect(result.content).toContain("Quote:");
      expect(result.content).toContain("Backslash:");
      expect(result.content).toContain("Unicode:");
    });

    it("should handle file with very long content", async () => {
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`Line ${i + 1}: ${"x".repeat(50)}`);
      }
      const content = lines.join("\n");
      const filepath = createTestFile("long-content.txt", content);
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.totalLines).toBe(100);
      expect(result.content).toContain("Line 1:");
      expect(result.content).toContain("Line 100:");
    });

    it("should handle file with windows line endings", async () => {
      const content = "Line 1\r\nLine 2\r\nLine 3\r\n";
      const filepath = createTestFile("windows-eol.txt", content);
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.content).toContain("00001| Line 1");
      expect(result.content).toContain("00002| Line 2");
      expect(result.content).toContain("00003| Line 3");
    });

    it("should handle file with only newlines", async () => {
      const content = "\n\n\n";
      const filepath = createTestFile("only-newlines.txt", content);
      
      const result = await readFile.execute({ filePath: filepath }, {});
      
      expect(result.totalLines).toBeGreaterThan(0);
    });
  });
});
