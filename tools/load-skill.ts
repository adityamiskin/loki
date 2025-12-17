import { tool } from "ai";
import { z } from "zod";
import { loadSkills, type SkillDefinition } from "../src/skills";
import { readFileSync } from "fs";

function findSkill(name: string): SkillDefinition | null {
  const skills = loadSkills();
  const normalized = name.toLowerCase().trim();

  for (const skill of skills) {
    if (skill.name.toLowerCase() === normalized) {
      return skill;
    }
  }

  return null;
}

export const loadSkill = tool({
  description:
    "Load a skill's full instructions. Use this when you need detailed guidance for a specific task. " +
    "Skills are specialized workflows with bundled resources (scripts, templates, references). " +
    "Check the available skills list in your system prompt first, then load the relevant skill when needed.",
  inputSchema: z.object({
    skillName: z
      .string()
      .describe(
        "The name of the skill to load. Use the exact name from the available skills list."
      ),
  }),
  execute: async ({ skillName }) => {
    const skill = findSkill(skillName);

    if (!skill) {
      const skills = loadSkills();
      const availableNames = skills.map((s) => s.name).join(", ");
      return {
        error: `Skill "${skillName}" not found. Available skills: ${
          availableNames || "none"
        }`,
        skillName: null,
        baseDirectory: null,
        instructions: null,
      };
    }

    const instructions = readFileSync(skill.filePath, "utf8");
    const baseDirectory = skill.filePath.replace(/\/SKILL\.md$/, "");

    return {
      skillName: skill.name,
      description: skill.description,
      baseDirectory,
      instructions,
    };
  },
});
