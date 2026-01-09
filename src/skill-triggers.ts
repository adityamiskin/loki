import type { SkillDefinition } from "./skills";

export const SKILL_REFERENCE_REGEX = /(?:\$|#skill:)([A-Za-z0-9_-]+)/gi;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, " ")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export function deriveLookupKeys(name: string): string[] {
  const lower = name.toLowerCase();
  const cleaned = lower.replace(/[^a-z0-9\s_-]+/g, " ").trim();
  const set = new Set<string>();
  const compact = cleaned.replace(/[\s_-]+/g, "");
  if (compact) {
    set.add(compact);
  }
  const dashy = cleaned.replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  if (dashy) {
    set.add(dashy);
  }
  const underscored = cleaned.replace(/[\s-]+/g, "_").replace(/_+/g, "_");
  if (underscored) {
    set.add(underscored);
  }
  if (cleaned) {
    set.add(cleaned.replace(/\s+/g, "-"));
    set.add(cleaned.replace(/\s+/g, "_"));
  }
  if (!set.size) {
    const fallback = lower.replace(/[^a-z0-9]+/g, "");
    if (fallback) {
      set.add(fallback);
    }
  }
  const initials = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0])
    .join("");
  if (initials.length > 1) {
    set.add(initials);
  }
  return Array.from(set).filter(Boolean);
}

export function buildSkillTriggers(
  skills: SkillDefinition[]
): Map<string, SkillDefinition> {
  const map = new Map<string, SkillDefinition>();
  for (const skill of skills) {
    for (const key of deriveLookupKeys(skill.name)) {
      if (!map.has(key)) {
        map.set(key, skill);
      }
    }
  }
  return map;
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReferencedTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(SKILL_REFERENCE_REGEX)) {
    const token = match[1]?.toLowerCase();
    if (token) {
      tokens.push(token);
    }
  }
  return tokens;
}

export function matchSkillsInText(
  text: string,
  triggers: Map<string, SkillDefinition>,
  skills: SkillDefinition[]
): SkillDefinition[] {
  const matches = new Map<string, SkillDefinition>();
  for (const token of extractReferencedTokens(text)) {
    const skill = triggers.get(token);
    if (skill) {
      matches.set(skill.filePath, skill);
    }
  }

  const normalized = normalizeForSearch(text);
  if (normalized) {
    for (const skill of skills) {
      const nameTokens = normalize(skill.name).split(" ");
      if (
        nameTokens.length &&
        nameTokens.every((token) => normalized.includes(token))
      ) {
        matches.set(skill.filePath, skill);
        continue;
      }
      const alias = skill.description ? normalize(skill.description) : "";
      if (alias) {
        const aliasTokens = alias.split(" ").filter(Boolean).slice(0, 2);
        if (
          aliasTokens.length &&
          aliasTokens.every((token) => normalized.includes(token))
        ) {
          matches.set(skill.filePath, skill);
        }
      }
    }
  }

  return Array.from(matches.values());
}
