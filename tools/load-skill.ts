import { tool } from "ai";
import { z } from "zod";
import { loadSkills, findSkill, formatLoadedSkill } from "../src/skills";

export const loadSkill = tool({
  description: `Execute a skill within the main conversation. Use this when you need detailed guidance for a specific task. 
    Skills are specialized workflows with bundled resources (scripts, templates, references). 
    Check the available skills list in your system prompt first, then load the relevant skill when needed.`,
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
      return `Skill "${skillName}" not found. Available skills: ${availableNames}`;
    }

    return formatLoadedSkill(skill);
  },
});
