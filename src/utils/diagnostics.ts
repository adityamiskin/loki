import type { SkillDefinition } from "../skills";
import { SKILLS_ENABLED } from "../skills";
import { logger, type LogSummary } from "./logger";

export interface SkillInsights {
  enabled: boolean;
  totalSkills: number;
  sample: string[];
  missingDirectory: boolean;
}

export interface DiagnosticsSnapshot {
  timestamp: string;
  logSummary: LogSummary;
  skillInsights: SkillInsights;
  notes: string[];
}

const SAMPLE_LIMIT = 5;

function buildSkillInsights(skills: SkillDefinition[]): SkillInsights {
  return {
    enabled: SKILLS_ENABLED,
    totalSkills: skills.length,
    sample: skills.slice(0, SAMPLE_LIMIT).map((skill) => skill.name),
    missingDirectory: SKILLS_ENABLED && skills.length === 0,
  };
}

export function buildDiagnosticsSnapshot(
  skills: SkillDefinition[]
): DiagnosticsSnapshot {
  const skillInsights = buildSkillInsights(skills);
  const logSummary = logger.getSummary();
  const notes: string[] = [];

  if (!SKILLS_ENABLED) {
    notes.push("Skill loading disabled. Set LOKI_SKILLS=true to enable skills.");
  } else if (!skillInsights.totalSkills) {
    notes.push("Skills enabled but none were discovered in the skills directory.");
  }

  if (!logSummary.total) {
    notes.push("No logs captured yet for this session.");
  }

  return {
    timestamp: new Date().toISOString(),
    logSummary,
    skillInsights,
    notes,
  };
}
