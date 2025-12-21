import { type InferUITool } from "ai";
import { editFile } from "./edit";
import { globFiles } from "./glob";
import { grep } from "./grep";
import { loadSkill } from "./load-skill";
import { readFile } from "./read";
import { shell } from "./shell";
import { subAgent } from "./sub-agent";
import { webSearch } from "./web-search";
import { writeFile } from "./write";

// Individual tool exports
export { editFile } from "./edit";
export { globFiles } from "./glob";
export { grep } from "./grep";
export { loadSkill } from "./load-skill";
export { readFile } from "./read";
export { shell } from "./shell";
export { subAgent } from "./sub-agent";
export { webSearch } from "./web-search";
export { writeFile } from "./write";
export { subAgentProgress } from "./subagent-progress";
export type { SubAgentSession, SubAgentAction } from "./subagent-progress";

// Combined tools object
export const tools = {
  editFile,
  globFiles,
  grep,
  loadSkill,
  readFile,
  shell,
  subAgent,
  webSearch,
  writeFile,
} as const;

// Type for individual tools
export type ToolName = keyof typeof tools;

// Type for the tools object
export type Tools = typeof tools;

// Type for individual tool types using InferUITool
export type EditFileTool = InferUITool<typeof editFile>;
export type GlobFilesTool = InferUITool<typeof globFiles>;
export type GrepTool = InferUITool<typeof grep>;
export type LoadSkillTool = InferUITool<typeof loadSkill>;
export type ReadFileTool = InferUITool<typeof readFile>;
export type ShellTool = InferUITool<typeof shell>;
export type SubAgentTool = InferUITool<typeof subAgent>;
export type WebSearchTool = InferUITool<typeof webSearch>;
export type WriteFileTool = InferUITool<typeof writeFile>;

// Union type of all tools
export type AllTools =
  | EditFileTool
  | GlobFilesTool
  | GrepTool
  | LoadSkillTool
  | ReadFileTool
  | ShellTool
  | SubAgentTool
  | WebSearchTool
  | WriteFileTool;
