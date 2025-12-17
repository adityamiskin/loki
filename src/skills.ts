import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FRONT_MATTER_BOUNDARY = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const NAME_LIMIT = 100;
const DESCRIPTION_LIMIT = 500;

const FLAG_VALUE = process.env.LOKI_SKILLS?.toLowerCase();
export const SKILLS_ENABLED = FLAG_VALUE === "true";

const DEFAULT_SKILLS_DIR = resolve(join(process.cwd(), "skills"));
export const SKILLS_DIR = process.env.LOKI_SKILLS_DIR
  ? resolve(process.env.LOKI_SKILLS_DIR)
  : process.env.SKILLS_DIR
  ? resolve(process.env.SKILLS_DIR)
  : DEFAULT_SKILLS_DIR;

export interface SkillDefinition {
  name: string;
  description: string;
  filePath: string;
  body: string;
}

export interface SkillSummary extends Omit<SkillDefinition, "body"> {}

function sanitizeLine(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function parseFrontMatter(
  frontMatter: string
): Record<string, string | undefined> {
  const parsed: Record<string, string | undefined> = {};
  for (const line of frontMatter.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || !rest.length) {
      continue;
    }
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    const value = rest.join(":").trim();
    parsed[key] = value;
  }
  return parsed;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function discoverSkills(
  directory: string,
  collected: SkillDefinition[],
  errors: string[]
): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      continue;
    }
    const resolved = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      discoverSkills(resolved, collected, errors);
      continue;
    }
    if (!entry.isFile() || entry.name !== "SKILL.md") {
      continue;
    }
    try {
      const skill = loadSkillFile(resolved);
      collected.push(skill);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error parsing skill";
      errors.push(`${resolved}: ${message}`);
    }
  }
}

function sortSkills(skills: SkillDefinition[]): SkillDefinition[] {
  return skills.sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.filePath.localeCompare(b.filePath);
  });
}

export function loadSkills(): SkillDefinition[] {
  if (!SKILLS_ENABLED) {
    return [];
  }
  if (!existsSync(SKILLS_DIR)) {
    return [];
  }
  const collected: SkillDefinition[] = [];
  const errors: string[] = [];
  discoverSkills(SKILLS_DIR, collected, errors);
  if (errors.length) {
    console.warn(
      `Skill loader ignored ${errors.length} file(s); check SKILL.md contents.`
    );
    for (const entry of errors) {
      console.warn(`  • ${entry}`);
    }
  }
  return sortSkills(collected);
}

export function findSkill(name: string): SkillDefinition | null {
  const skills = loadSkills();
  const normalized = name.toLowerCase().trim();

  for (const skill of skills) {
    if (skill.name.toLowerCase() === normalized) {
      return skill;
    }
  }

  return null;
}

function loadSkillFile(filePath: string): SkillDefinition {
  const text = readFileSync(filePath, "utf8");
  const match = text.match(FRONT_MATTER_BOUNDARY);
  if (!match || !match[1]) {
    throw new Error("Missing YAML front matter");
  }
  const metadata = parseFrontMatter(match[1]);
  const name = sanitizeLine(metadata.name);
  const description = sanitizeLine(metadata.description);
  if (!name) {
    throw new Error("`name` is required");
  }
  if (!description) {
    throw new Error("`description` is required");
  }
  if (name.length > NAME_LIMIT) {
    throw new Error(`name longer than ${NAME_LIMIT} characters`);
  }
  if (description.length > DESCRIPTION_LIMIT) {
    throw new Error(`description longer than ${DESCRIPTION_LIMIT} characters`);
  }
  const body = text.slice(match[0].length).trim();
  return {
    name,
    description,
    filePath,
    body,
  };
}

export function formatSkillsSection(skills: SkillSummary[]): string {
  if (!skills.length) {
    return "";
  }
  const lines = [
    '<skills_system priority="1">',
    "",
    "## Available Skills",
    "",
    "<!-- SKILLS_TABLE_START -->",
    "<usage>",
    "When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.",
    "",
    "How to use skills:",
    '- Invoke: loadSkill({ skillName: "<skill-name>" })',
    "- The skill content will load with detailed instructions",
    "- Base directory provided in output for resolving bundled resources",
    "",
    "Usage notes:",
    "- Only use skills listed in <available_skills> below",
    "- Do not invoke a skill that is already loaded in your context",
    "- Load skills proactively based on the user's task (e.g., if they ask about PDFs, load the 'pdf' skill)",
    "- Users can also explicitly mention skills with $<skill-name> in their message, but you should load skills automatically when relevant",
    "</usage>",
    "",
    "<available_skills>",
    "",
  ];

  for (const skill of skills) {
    lines.push("<skill>");
    lines.push(`<name>${escapeXml(skill.name)}</name>`);
    lines.push(`<description>${escapeXml(skill.description)}</description>`);
    lines.push("<location>project</location>");
    lines.push("</skill>");
    lines.push("");
  }

  lines.push("</available_skills>");
  lines.push("<!-- SKILLS_TABLE_END -->");
  lines.push("");
  lines.push("</skills_system>");

  return lines.join("\n");
}

export function formatLoadedSkill(skill: SkillDefinition): string {
  const skillPath = skill.filePath.replace(/\/SKILL\.md$/, "");
  const sections: string[] = [];
  sections.push(`Base directory for this skill: ${skillPath}`);
  sections.push("");
  sections.push(skill.body.trim());

  sections.push(`\n---\n**Launched skill**: ${escapeXml(skill.name)}`);
  return sections.join("\n");
}
