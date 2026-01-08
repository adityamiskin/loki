import { editFile } from "../edit";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, afterAll, beforeAll } from "bun:test";

const testDir = path.join(process.cwd(), "tools", "__tests__", "test-files");

beforeAll(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
});

afterAll(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

const edit = editFile.execute.bind(editFile);

describe("editFile", () => {
  describe("single replacement", () => {
    it("should replace a single string in a file", async () => {
      const testFile = path.join(testDir, "single-replace.txt");
      fs.writeFileSync(testFile, "Hello World", "utf-8");

      const result = await edit({
        filePath: testFile,
        oldString: "World",
        newString: "Bun",
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("Hello Bun");
      expect(result.replacements).toBe(1);
    });

    it("should replace text at the beginning of file", async () => {
      const testFile = path.join(testDir, "replace-beginning.txt");
      fs.writeFileSync(testFile, "Start middle end", "utf-8");

      await edit({
        filePath: testFile,
        oldString: "Start",
        newString: "Beginning",
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("Beginning middle end");
    });

    it("should replace text at the end of file", async () => {
      const testFile = path.join(testDir, "replace-end.txt");
      fs.writeFileSync(testFile, "first second last", "utf-8");

      await edit({
        filePath: testFile,
        oldString: "last",
        newString: "final",
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("first second final");
    });
  });

  describe("multiple replacements", () => {
    it("should replace all occurrences when replaceAll is true", async () => {
      const testFile = path.join(testDir, "replace-all.txt");
      fs.writeFileSync(testFile, "foo foo foo", "utf-8");

      const result = await edit({
        filePath: testFile,
        oldString: "foo",
        newString: "bar",
        replaceAll: true,
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("bar bar bar");
      expect(result.replacements).toBe(3);
    });

    it("should replace only first occurrence by default", async () => {
      const testFile = path.join(testDir, "first-only.txt");
      fs.writeFileSync(testFile, "test test test", "utf-8");

      await edit({
        filePath: testFile,
        oldString: "test",
        newString: "passed",
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("passed test test");
    });

    it("should handle multi-line replacement with replaceAll", async () => {
      const testFile = path.join(testDir, "multiline.txt");
      fs.writeFileSync(testFile, "line1\nline2\nline1\nline3", "utf-8");

      await edit({
        filePath: testFile,
        oldString: "line1",
        newString: "replaced",
        replaceAll: true,
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("replaced\nline2\nreplaced\nline3");
    });
  });

  describe("no match found", () => {
    it("should throw error when oldString is not found", async () => {
      const testFile = path.join(testDir, "no-match.txt");
      fs.writeFileSync(testFile, "some content", "utf-8");

      await expect(
        edit({
          filePath: testFile,
          oldString: "nonexistent",
          newString: "replacement",
        })
      ).rejects.toThrow('Text "nonexistent" not found in file');
    });

    it("should throw error when file is empty", async () => {
      const testFile = path.join(testDir, "empty.txt");
      fs.writeFileSync(testFile, "", "utf-8");

      await expect(
        edit({
          filePath: testFile,
          oldString: "anything",
          newString: "replacement",
        })
      ).rejects.toThrow('Text "anything" not found in file');
    });
  });

  describe("same content error", () => {
    it("should throw error when oldString equals newString", async () => {
      const testFile = path.join(testDir, "same-content.txt");
      fs.writeFileSync(testFile, "unchanged content", "utf-8");

      await expect(
        edit({
          filePath: testFile,
          oldString: "unchanged",
          newString: "unchanged",
        })
      ).rejects.toThrow("oldString and newString must be different");
    });
  });

  describe("file not found", () => {
    it("should throw error when file does not exist", async () => {
      const nonexistentFile = path.join(testDir, "does-not-exist.txt");

      await expect(
        edit({
          filePath: nonexistentFile,
          oldString: "old",
          newString: "new",
        })
      ).rejects.toThrow(`File not found: ${nonexistentFile}`);
    });
  });

  describe("path resolution", () => {
    it("should handle relative paths", async () => {
      const testFile = path.join(testDir, "relative-path.txt");
      fs.writeFileSync(testFile, "relative test", "utf-8");

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        await edit({
          filePath: "relative-path.txt",
          oldString: "relative",
          newString: "absolute",
        });

        const content = fs.readFileSync(testFile, "utf-8");
        expect(content).toBe("absolute test");
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should handle absolute paths", async () => {
      const testFile = path.join(testDir, "absolute-path.txt");
      fs.writeFileSync(testFile, "absolute test", "utf-8");

      await edit({
        filePath: testFile,
        oldString: "absolute",
        newString: "resolved",
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("resolved test");
    });
  });

  describe("multi-line content", () => {
    it("should replace multi-line strings", async () => {
      const testFile = path.join(testDir, "multiline-replace.txt");
      fs.writeFileSync(testFile, "line1\nline2\nline3", "utf-8");

      await edit({
        filePath: testFile,
        oldString: "line1\nline2",
        newString: "replaced",
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("replaced\nline3");
    });

    it("should preserve file encoding", async () => {
      const testFile = path.join(testDir, "encoding.txt");
      fs.writeFileSync(testFile, "Special chars: ñ á é ü", "utf-8");

      await edit({
        filePath: testFile,
        oldString: "Special chars:",
        newString: "Caracteres especiales:",
      });

      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("Caracteres especiales: ñ á é ü");
    });
  });

  describe("with Bun.file().write()", () => {
    it("should work with files created via Bun.file().write()", async () => {
      const testFile = path.join(testDir, "bun-file.txt");
      const BunFile = Bun.file(testFile);
      await BunFile.write("Bun created this file");

      await edit({
        filePath: testFile,
        oldString: "Bun created",
        newString: "Test modified",
      });

      const content = await BunFile.text();
      expect(content).toBe("Test modified this file");
    });
  });
});
