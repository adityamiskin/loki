import { describe, it, expect } from "bun:test";
import * as tools from "../index";

describe("tools index exports", () => {
  describe("individual tool exports", () => {
    it("should export editFile", () => {
      expect(tools.editFile).toBeDefined();
      expect(tools.editFile).not.toBeNull();
    });

    it("should export globFiles", () => {
      expect(tools.globFiles).toBeDefined();
      expect(tools.globFiles).not.toBeNull();
    });

    it("should export grep", () => {
      expect(tools.grep).toBeDefined();
      expect(tools.grep).not.toBeNull();
    });

    it("should export loadSkill", () => {
      expect(tools.loadSkill).toBeDefined();
      expect(tools.loadSkill).not.toBeNull();
    });

    it("should export readFile", () => {
      expect(tools.readFile).toBeDefined();
      expect(tools.readFile).not.toBeNull();
    });

    it("should export shell", () => {
      expect(tools.shell).toBeDefined();
      expect(tools.shell).not.toBeNull();
    });

    it("should export subAgent", () => {
      expect(tools.subAgent).toBeDefined();
      expect(tools.subAgent).not.toBeNull();
    });

    it("should export webSearch", () => {
      expect(tools.webSearch).toBeDefined();
      expect(tools.webSearch).not.toBeNull();
    });

    it("should export writeFile", () => {
      expect(tools.writeFile).toBeDefined();
      expect(tools.writeFile).not.toBeNull();
    });

    it("should export subAgentProgress", () => {
      expect(tools.subAgentProgress).toBeDefined();
      expect(tools.subAgentProgress).not.toBeNull();
    });
  });

  describe("combined tools object", () => {
    it("should have all tools in the tools object", () => {
      expect(tools.tools).toBeDefined();
      expect(Object.keys(tools.tools)).toEqual([
        "editFile",
        "globFiles",
        "grep",
        "loadSkill",
        "readFile",
        "shell",
        "subAgent",
        "webSearch",
        "writeFile",
      ]);
    });

    it("should have correct tool references in tools object", () => {
      expect(tools.tools.editFile).toBeDefined();
      expect(tools.tools.globFiles).toBeDefined();
      expect(tools.tools.grep).toBeDefined();
      expect(tools.tools.loadSkill).toBeDefined();
      expect(tools.tools.readFile).toBeDefined();
      expect(tools.tools.shell).toBeDefined();
      expect(tools.tools.subAgent).toBeDefined();
      expect(tools.tools.webSearch).toBeDefined();
      expect(tools.tools.writeFile).toBeDefined();
    });

    it("tools object should have exactly 9 tools", () => {
      expect(Object.keys(tools.tools).length).toBe(9);
    });
  });

  describe("tool properties", () => {
    it("editFile tool should have required properties", () => {
      const tool = tools.editFile;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });

    it("globFiles tool should have required properties", () => {
      const tool = tools.globFiles;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });

    it("grep tool should have required properties", () => {
      const tool = tools.grep;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });

    it("loadSkill tool should have required properties", () => {
      const tool = tools.loadSkill;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });

    it("readFile tool should have required properties", () => {
      const tool = tools.readFile;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });

    it("shell tool should have required properties", () => {
      const tool = tools.shell;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });

    it("subAgent tool should have required properties", () => {
      const tool = tools.subAgent;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });

    it("writeFile tool should have required properties", () => {
      const tool = tools.writeFile;
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });
  });

  describe("tool descriptions", () => {
    it("editFile tool should have a description containing 'edit'", () => {
      const desc = tools.editFile.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("edit");
    });

    it("globFiles tool should have a description containing 'glob'", () => {
      const desc = tools.globFiles.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("glob");
    });

    it("grep tool should have a description containing 'grep'", () => {
      const desc = tools.grep.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("grep");
    });

    it("readFile tool should have a description containing 'read'", () => {
      const desc = tools.readFile.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("read");
    });

    it("shell tool should have a description containing 'shell'", () => {
      const desc = tools.shell.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("shell");
    });

    it("writeFile tool should have a description containing 'write'", () => {
      const desc = tools.writeFile.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("write");
    });

    it("loadSkill tool should have a description containing 'skill'", () => {
      const desc = tools.loadSkill.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("skill");
    });

    it("subAgent tool should have a description containing 'agent'", () => {
      const desc = tools.subAgent.description;
      expect(typeof desc).toBe("string");
      expect(desc.toLowerCase()).toContain("agent");
    });
  });

  describe("module structure", () => {
    it("should export all expected named exports", () => {
      expect(tools.editFile).toBeDefined();
      expect(tools.globFiles).toBeDefined();
      expect(tools.grep).toBeDefined();
      expect(tools.loadSkill).toBeDefined();
      expect(tools.readFile).toBeDefined();
      expect(tools.shell).toBeDefined();
      expect(tools.subAgent).toBeDefined();
      expect(tools.webSearch).toBeDefined();
      expect(tools.writeFile).toBeDefined();
      expect(tools.subAgentProgress).toBeDefined();
      expect(tools.tools).toBeDefined();
    });

    it("should export tools object alongside individual tools", () => {
      expect(tools).toHaveProperty("tools");
      expect(tools.tools).toBeDefined();
      expect(typeof tools.tools).toBe("object");
      expect(tools.tools).not.toBeNull();
    });

    it("should have correct structure in tools object", () => {
      expect(tools.tools.editFile).toBeDefined();
      expect(tools.tools.globFiles).toBeDefined();
      expect(tools.tools.grep).toBeDefined();
      expect(tools.tools.loadSkill).toBeDefined();
      expect(tools.tools.readFile).toBeDefined();
      expect(tools.tools.shell).toBeDefined();
      expect(tools.tools.subAgent).toBeDefined();
      expect(tools.tools.webSearch).toBeDefined();
      expect(tools.tools.writeFile).toBeDefined();
    });
  });
});
