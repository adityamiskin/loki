import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { grep } from "../grep";
import { writeFileSync, rmSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;

beforeAll(() => {
  testDir = join(tmpdir(), "loki-grep-tests");
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function createTestFile(relativePath: string, content: string): void {
  const fullPath = join(testDir, relativePath);
  const dir = fullPath.split("/").slice(0, -1).join("/");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fullPath, content);
}

function removeTestFile(relativePath: string): void {
  const fullPath = join(testDir, relativePath);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }
}

describe("grep tool", () => {
  describe("basic pattern matching", () => {
    it("should find a simple text match", async () => {
      createTestFile("simple.txt", "Hello World\nTest line\n");
      const result = await grep.execute({ pattern: "Hello", path: testDir });
      expect(result.matches).toBeGreaterThan(0);
      expect(result.results).toContain("simple.txt");
      removeTestFile("simple.txt");
    });

    it("should find multiple matches in a file", async () => {
      createTestFile("multi.txt", "error: something failed\ninfo: starting up\nerror: retrying\n");
      const result = await grep.execute({ pattern: "error", path: testDir });
      expect(result.matches).toBe(2);
      removeTestFile("multi.txt");
    });

    it("should handle no matches (exit code 1)", async () => {
      createTestFile("nomatch.txt", "some content\n");
      const result = await grep.execute({ pattern: "nonexistent", path: testDir });
      expect(result.matches).toBe(0);
      expect(result.results).toBe("No matches found");
      removeTestFile("nomatch.txt");
    });
  });

  describe("regex patterns", () => {
    it("should support regex patterns", async () => {
      createTestFile("regex.txt", "log_error_123\nlog_warn_456\nlog_info_789\n");
      const result = await grep.execute({ pattern: "log_(error|warn)", path: testDir });
      expect(result.matches).toBe(2);
      removeTestFile("regex.txt");
    });

    it("should support regex character classes", async () => {
      createTestFile("chars.txt", "item1\nitem2\nitem3\nitemA\nitemB\n");
      const result = await grep.execute({ pattern: "item[0-9]", path: testDir });
      expect(result.matches).toBe(3);
      removeTestFile("chars.txt");
    });

    it("should support regex quantifiers", async () => {
      createTestFile("quant.txt", "aa\naaa\naaaa\na\n");
      const result = await grep.execute({ pattern: "a{2,3}", path: testDir });
      expect(result.matches).toBeGreaterThanOrEqual(2);
      removeTestFile("quant.txt");
    });
  });

  describe("caseInsensitive option", () => {
    it("should find matches with caseInsensitive=true", async () => {
      createTestFile("case.txt", "Hello\nHELLO\nhello\nHeLLo\n");
      const result = await grep.execute({ pattern: "hello", path: testDir, caseInsensitive: true });
      expect(result.matches).toBe(4);
      removeTestFile("case.txt");
    });

    it("should not match case with caseInsensitive=false", async () => {
      createTestFile("case2.txt", "Hello\nHELLO\nhello\n");
      const result = await grep.execute({ pattern: "hello", path: testDir, caseInsensitive: false });
      expect(result.matches).toBe(1);
      removeTestFile("case2.txt");
    });
  });

  describe("glob filtering", () => {
    it("should filter by glob pattern", async () => {
      createTestFile("test.ts", "export function test() { return 1; }\n");
      createTestFile("test.js", "export function test() { return 2; }\n");
      createTestFile("data.json", '{"test": 1}');

      const result = await grep.execute({ pattern: "test", path: testDir, glob: "*.ts" });
      expect(result.results).toContain("test.ts");
      expect(result.results).not.toContain("test.js");
      expect(result.results).not.toContain("data.json");
      removeTestFile("test.ts");
      removeTestFile("test.js");
      removeTestFile("data.json");
    });

    it("should support multiple extensions in glob", async () => {
      createTestFile("file.ts", "const x = 1;\n");
      createTestFile("file.js", "const x = 2;\n");
      createTestFile("file.py", "x = 3\n");

      const result = await grep.execute({ pattern: "const", path: testDir, glob: "*.{ts,js}" });
      expect(result.results).toContain("file.ts");
      expect(result.results).toContain("file.js");
      expect(result.results).not.toContain("file.py");
      removeTestFile("file.ts");
      removeTestFile("file.js");
      removeTestFile("file.py");
    });
  });

  describe("path specification", () => {
    it("should search in specified directory", async () => {
      createTestFile("subdir/target.txt", "found me\n");
      const result = await grep.execute({ pattern: "found", path: join(testDir, "subdir") });
      expect(result.matches).toBe(1);
      removeTestFile("subdir/target.txt");
    });

    it("should handle non-existent path gracefully", async () => {
      try {
        const result = await grep.execute({ pattern: "test", path: "/nonexistent/path" });
        expect(result.matches).toBeGreaterThanOrEqual(0);
      } catch (e) {
        expect((e as Error).message).toContain("No such file");
      }
    });
  });

  describe("line number parsing", () => {
    it("should correctly parse line numbers", async () => {
      createTestFile(
        "lines.txt",
        "line1\nline2\nline3\nline4\nline5\n"
      );
      const result = await grep.execute({ pattern: "line3", path: testDir });
      expect(result.results).toContain("3:");
      removeTestFile("lines.txt");
    });

    it("should show correct line numbers for multiple matches", async () => {
      createTestFile("multilines.txt", "match\nno\nmatch\nno\nmatch\n");
      const result = await grep.execute({ pattern: "match", path: testDir });
      expect(result.results).toContain("1:");
      expect(result.results).toContain("3:");
      expect(result.results).toContain("5:");
      removeTestFile("multilines.txt");
    });
  });

  describe("edge cases", () => {
    it("should handle empty files", async () => {
      createTestFile("empty.txt", "");
      const result = await grep.execute({ pattern: "anything", path: testDir });
      expect(result.matches).toBe(0);
      removeTestFile("empty.txt");
    });

    it("should handle files with special regex characters", async () => {
      createTestFile("special.txt", "file.txt\npath/to/file\ntest[1]\nprice: $10\n");
      const result = await grep.execute({ pattern: "\\[1\\]", path: testDir });
      expect(result.matches).toBe(1);
      removeTestFile("special.txt");
    });

    it("should find individual lines with patterns", async () => {
      createTestFile(
        "multiline.txt",
        "start\nmiddle\nend\nstart\nmiddle\nend\n"
      );
      const result = await grep.execute({ pattern: "start", path: testDir });
      expect(result.results).toContain("start");
      expect(result.matches).toBe(2);
      removeTestFile("multiline.txt");
    });

    it("should find multiple matches", async () => {
      let content = "";
      for (let i = 0; i < 50; i++) {
        content += `unique${i} pattern\n`;
      }
      createTestFile("many.txt", content);
      const result = await grep.execute({ pattern: "unique", path: testDir });
      expect(result.matches).toBe(50);
      removeTestFile("many.txt");
    });
  });

  describe("output format", () => {
    it("should include file path in results", async () => {
      createTestFile("output.txt", "search term here\n");
      const result = await grep.execute({ pattern: "search", path: testDir });
      expect(result.results).toContain("output.txt");
      removeTestFile("output.txt");
    });

    it("should show match count", async () => {
      createTestFile("count.txt", "one\ntwo\none\none\n");
      const result = await grep.execute({ pattern: "one", path: testDir });
      expect(result.results).toContain("Found 3 matches");
      removeTestFile("count.txt");
    });
  });
});
