import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, rmSync, mkdirSync, existsSync, chmodSync } from "fs";
import { join } from "path";

let testDir: string;

beforeAll(() => {
  testDir = join(process.cwd(), ".test-glob");
  mkdirSync(testDir, { recursive: true });

  writeFileSync(join(testDir, "file1.ts"), "export function hello() { return 'hello'; }");
  writeFileSync(join(testDir, "file2.ts"), "export function world() { return 'world'; }");
  writeFileSync(join(testDir, "file3.tsx"), "import React from 'react'; export const Component = () => null;");
  writeFileSync(join(testDir, "file4.js"), "export function greeting() { return 'greeting'; }");
  writeFileSync(join(testDir, "data.json"), '{"name": "test", "value": 123}');
  writeFileSync(join(testDir, "package.json"), '{"name": "test", "version": "1.0.0"}');
  writeFileSync(join(testDir, "README.md"), "# Test Project");
  writeFileSync(join(testDir, ".hidden"), "hidden file");
  writeFileSync(join(testDir, ".env"), "API_KEY=secret");

  mkdirSync(join(testDir, "src"), { recursive: true });
  writeFileSync(join(testDir, "src", "index.ts"), "export const index = 1;");
  writeFileSync(join(testDir, "src", "util.ts"), "export function util() {}");

  mkdirSync(join(testDir, "src", "components"), { recursive: true });
  writeFileSync(join(testDir, "src", "components", "Button.tsx"), "import React from 'react';");
  writeFileSync(join(testDir, "src", "components", "Button.css"), ".button { color: red; }");

  mkdirSync(join(testDir, "tests"), { recursive: true });
  writeFileSync(join(testDir, "tests", "example.test.ts"), "import { expect, test } from 'bun:test';");

  mkdirSync(join(testDir, "nested", "deep", "very"), { recursive: true });
  writeFileSync(join(testDir, "nested", "deep", "very", "deep.ts"), "export function deep() {}");
  writeFileSync(join(testDir, "nested", "file.ts"), "export function nested() {}");
});

afterAll(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("glob integration tests", () => {
  it("should find TypeScript files with *.ts pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "*.ts", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("file1.ts");
    expect(output).toContain("file2.ts");
    expect(output).toContain("src/index.ts");
    expect(output).toContain("src/util.ts");
  });

  it("should find TypeScript React files with *.tsx pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "*.tsx", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("file3.tsx");
    expect(output).toContain("src/components/Button.tsx");
  });

  it("should find all TypeScript files with **/*.ts pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "**/*.ts", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("file1.ts");
    expect(output).toContain("file2.ts");
    expect(output).toContain("src/index.ts");
    expect(output).toContain("src/util.ts");
    expect(output).toContain("nested/file.ts");
  });

  it("should find files in nested directories with **/*.tsx pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "**/*.tsx", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("file3.tsx");
    expect(output).toContain("src/components/Button.tsx");
  });

  it("should find JavaScript files with *.js pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "*.js", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("file4.js");
  });

  it("should find JSON files with *.json pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "*.json", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("data.json");
    expect(output).toContain("package.json");
  });

  it("should find files in src directory with src/**/*.ts pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "src/**/*.ts"], {
      cwd: testDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("src/index.ts");
    expect(output).toContain("src/util.ts");
    expect(output).not.toContain("file1.ts");
  });

  it("should find test files with **/*.test.ts pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "**/*.test.ts", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("tests/example.test.ts");
  });

  it("should return exit code 1 when no files match pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "*.nonexistent12345", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(output.trim()).toBe("");
  });

  it("should find files with special characters in pattern", async () => {
    writeFileSync(join(testDir, "test.file.ts"), "export function test() {}");
    writeFileSync(join(testDir, "another-file.ts"), "export function another() {}");

    const proc = Bun.spawn(["rg", "--files", "--glob", "*.ts", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    expect(output).toContain("test.file.ts");
    expect(output).toContain("another-file.ts");
  });

  it("should find files in deeply nested directories", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "**/very/**/*.ts"], {
      cwd: testDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("nested/deep/very/deep.ts");
  });

  it("should exclude non-matching extensions", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "*.ts", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    expect(output).not.toContain("file4.js");
    expect(output).not.toContain("data.json");
    expect(output).not.toContain("README.md");
  });

  it("should find CSS files with **/*.css pattern", async () => {
    const proc = Bun.spawn(["rg", "--files", "--glob", "**/*.css", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("src/components/Button.css");
  });

  it("should handle patterns with character classes", async () => {
    writeFileSync(join(testDir, "test1.ts"), "export function test1() {}");
    writeFileSync(join(testDir, "test2.ts"), "export function test2() {}");
    writeFileSync(join(testDir, "sample.ts"), "export function sample() {}");

    const proc = Bun.spawn(["rg", "--files", "--glob", "test[0-9].ts", testDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("test1.ts");
    expect(output).toContain("test2.ts");
    expect(output).not.toContain("sample.ts");
  });
});
