import { describe, it, expect } from "bun:test";
import {
  buildSystemPrompt,
  buildSubAgentSystemPrompt,
  baseSystemPrompt,
  baseSubAgentSystemPrompt,
} from "../prompts";

describe("buildSystemPrompt", () => {
  it("should return trimmed base prompt when no skills provided", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toBe(baseSystemPrompt.trim());
  });

  it("should append skills section to base prompt", () => {
    const skills = [
      {
        name: "Test Skill",
        description: "A test skill",
        filePath: "/path/to/skill.md",
        body: "Skill content",
      },
    ];
    const prompt = buildSystemPrompt(skills);

    expect(prompt).toContain("Loki, the God of Mischief");
    expect(prompt).toContain("## Available Skills");
    expect(prompt).toContain("Test Skill");
    expect(prompt).toContain("A test skill");
  });

  it("should format multiple skills correctly", () => {
    const skills = [
      {
        name: "Skill One",
        description: "Description one",
        filePath: "/skill1.md",
        body: "Content one",
      },
      {
        name: "Skill Two",
        description: "Description two",
        filePath: "/skill2.md",
        body: "Content two",
      },
    ];
    const prompt = buildSystemPrompt(skills);

    expect(prompt).toContain("Skill One");
    expect(prompt).toContain("Description one");
    expect(prompt).toContain("Skill Two");
    expect(prompt).toContain("Description two");
  });
});

describe("buildSubAgentSystemPrompt", () => {
  it("should return base sub-agent prompt when no skills provided", () => {
    const prompt = buildSubAgentSystemPrompt([]);
    expect(prompt).toBe(baseSubAgentSystemPrompt);
  });

  it("should append skills section to sub-agent prompt", () => {
    const skills = [
      {
        name: "Agent Skill",
        description: "For agents",
        filePath: "/agent.md",
        body: "Agent content",
      },
    ];
    const prompt = buildSubAgentSystemPrompt(skills);

    expect(prompt).toContain("expert sub-agent");
    expect(prompt).toContain("## Available Skills");
    expect(prompt).toContain("Agent Skill");
    expect(prompt).toContain("For agents");
  });

  it("should maintain sub-agent specific instructions", () => {
    const skills = [
      {
        name: "Test",
        description: "Test",
        filePath: "/test.md",
        body: "Test content",
      },
    ];
    const prompt = buildSubAgentSystemPrompt(skills);

    expect(prompt).toContain("Goal: finish the objective");
    expect(prompt).toContain("fewest effective steps");
    expect(prompt).toContain("information-dense answer");
  });
});

describe("baseSystemPrompt", () => {
  it("should contain key Loki characteristics", () => {
    expect(baseSystemPrompt).toContain("Loki, the God of Mischief");
    expect(baseSystemPrompt).toContain("security analyst");
    expect(baseSystemPrompt).toContain("software engineer");
  });

  it("should mention available tools", () => {
    expect(baseSystemPrompt).toContain("shell");
    expect(baseSystemPrompt).toContain("webSearch");
    expect(baseSystemPrompt).toContain("subAgent");
  });

  it("should include safety constraints", () => {
    expect(baseSystemPrompt).toContain("SAFETY & AUTHORIZATION");
    expect(baseSystemPrompt).toContain("authorized security testing");
  });

  it("should include communication style guidelines", () => {
    expect(baseSystemPrompt).toContain("No emojis");
    expect(baseSystemPrompt).toContain("concise");
    expect(baseSystemPrompt).toContain("CLI display");
  });
});

describe("baseSubAgentSystemPrompt", () => {
  it("should contain sub-agent role", () => {
    expect(baseSubAgentSystemPrompt).toContain("expert sub-agent");
  });

  it("should include strategy guidelines", () => {
    expect(baseSubAgentSystemPrompt).toContain("WORK STRATEGY");
    expect(baseSubAgentSystemPrompt).toContain("avoid redundant exploration");
  });

  it("should include output requirements", () => {
    expect(baseSubAgentSystemPrompt).toContain("OUTPUT REQUIREMENTS");
    expect(baseSubAgentSystemPrompt).toContain("information-dense");
  });
});
