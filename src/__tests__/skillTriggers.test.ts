import { describe, it, expect } from "bun:test";
import {
  buildSkillTriggers,
  deriveLookupKeys,
  matchSkillsInText,
} from "../skill-triggers";

const sampleSkills = [
  {
    name: "PDF Parser",
    description: "Parse and summarize PDF documents",
    filePath: "/skills/pdf/SKILL.md",
    body: "",
  },
  {
    name: "Recon Wizard",
    description: "Perform reconnaissance",
    filePath: "/skills/recon/SKILL.md",
    body: "",
  },
];

describe("skill triggers", () => {
  it("derives multiple lookup keys", () => {
    const keys = deriveLookupKeys("PDF Parser");
    expect(keys).toContain("pdfparser");
    expect(keys).toContain("pdf-parser");
    expect(keys).toContain("pdf_parser");
  });

  it("matches explicit and implicit mentions", () => {
    const triggers = buildSkillTriggers(sampleSkills);
    const explicit = matchSkillsInText("Use $pdf-parser now", triggers, sampleSkills);
    expect(explicit).toHaveLength(1);
    expect(explicit[0]?.name).toBe("PDF Parser");

    const implicit = matchSkillsInText(
      "Can you run the recon wizard step?",
      triggers,
      sampleSkills
    );
    expect(implicit).toHaveLength(1);
    expect(implicit[0]?.name).toBe("Recon Wizard");
  });
});
