import { describe, it, expect } from "bun:test";
import { formatSkillsSection } from "../skills";

describe("formatSkillsSection", () => {
  it("should return empty string for empty skills array", () => {
    const section = formatSkillsSection([]);
    expect(section).toBe("");
  });

  it("should format skills section correctly", () => {
    const skills = [
      {
        name: "Test Skill",
        description: "A test skill",
        filePath: "/path/to/SKILL.md",
        body: "Skill content",
      },
    ];
    const section = formatSkillsSection(skills);

    expect(section).toContain("<skills_system");
    expect(section).toContain("## Available Skills");
    expect(section).toContain("<available_skills>");
    expect(section).toContain("<skill>");
    expect(section).toContain("<name>Test Skill</name>");
    expect(section).toContain("<description>A test skill</description>");
    expect(section).toContain("</available_skills>");
    expect(section).toContain("</skills_system>");
  });

  it("should format skills section with multiple skills", () => {
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
    const section = formatSkillsSection(skills);

    expect(section).toContain("Skill One");
    expect(section).toContain("Description one");
    expect(section).toContain("Skill Two");
    expect(section).toContain("Description two");
  });

  it("should escape XML special characters in skill names and descriptions", () => {
    const skills = [
      {
        name: "Test <script>alert('xss')</script>",
        description: "Test & description",
        filePath: "/path/to/SKILL.md",
        body: "Body",
      },
    ];
    const section = formatSkillsSection(skills);

    expect(section).toContain("&lt;script&gt;");
    expect(section).toContain("&amp;");
  });

  it("should not include body field in formatted output", () => {
    const skills = [
      {
        name: "Test Skill",
        description: "Description",
        filePath: "/path.md",
        body: "This should not appear",
      },
    ];
    const section = formatSkillsSection(skills);

    expect(section).not.toContain("This should not appear");
  });

  it("should include location element for each skill", () => {
    const skills = [
      {
        name: "Test Skill",
        description: "Description",
        filePath: "/path.md",
        body: "Body",
      },
    ];
    const section = formatSkillsSection(skills);

    expect(section).toContain("<location>project</location>");
  });
});
