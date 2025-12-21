import { tool, streamText, stepCountIs } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { shell } from "./shell";
import { webSearch } from "./web-search";
import { loadSkill } from "./load-skill";
import { readFile } from "./read";
import { globFiles } from "./glob";
import { grep } from "./grep";
import { buildSubAgentSystemPrompt } from "../src/prompts";
import { loadSkills } from "../src/skills";
import { subAgentProgress } from "./subagent-progress";

// Sub-agent tools - can use the same tools as the main agent
const subAgentTools = {
  shell,
  webSearch,
  loadSkill,
  readFile,
  globFiles,
  grep,
};

export const subAgent = tool({
  description:
    "Spin up a focused sub-agent that can take multiple actions to tackle a specific objective. The sub-agent can use tools like shell commands and web search to accomplish tasks autonomously.",
  inputSchema: z.object({
    objective: z
      .string()
      .min(1)
      .describe(
        "Goal for the sub-agent (e.g., 'analyze the codebase for security vulnerabilities')."
      ),
    context: z
      .array(z.string())
      .optional()
      .describe(
        "Extra details, constraints, or snippets the sub-agent should use."
      ),
  }),
  execute: async ({ objective, context = [] }) => {
    const skills = loadSkills();
    const system = buildSubAgentSystemPrompt(skills);

    // Create a unique session ID for this subagent run
    const sessionId = `subagent-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    subAgentProgress.createSession(sessionId, objective);

    const contextBlock =
      context.length > 0
        ? `Additional Context:\n${context
            .map((item) => `- ${item}`)
            .join("\n")}\n\n`
        : "";

    const messages = [
      {
        role: "user" as const,
        content: `${contextBlock}Objective: ${objective}\n\nPlease work on this objective using the available tools. When complete, provide a summary of what you accomplished.`,
      },
    ];

    const maxToolRounds = 30; // internal safety cap; sub-agent gets one more step to summarize

    try {
      const result = streamText({
        model: openai("gpt-5.1"),
        system,
        messages,
        tools: subAgentTools,
        // Stop when either: we reach the tool limit + final step, OR we already have a text answer.
        stopWhen: [
          stepCountIs(maxToolRounds + 1), // allow tool calls + 1 final response
          ({ steps }) => steps.some((step) => (step.text?.length ?? 0) > 0), // stop once text is produced
        ],
        // Enforce a summary/answer step by turning off tools after maxSteps tool rounds.
        prepareStep: async ({ stepNumber }) => {
          if (stepNumber >= maxToolRounds) {
            return {
              activeTools: [], // disable further tool use; force model to answer
            };
          }
          return {};
        },
      });

      // Collect all text and tool calls from the stream
      let toolCalls = 0;
      let finalText = "";
      const actionIds: Map<string, string> = new Map(); // Map tool call ID to action ID

      for await (const delta of result.fullStream) {
        if (delta.type === "text-delta") {
          finalText += delta.text;
        } else if (delta.type === "tool-call") {
          toolCalls++;
          // Track the tool call in progress store
          const actionId = subAgentProgress.addAction(
            sessionId,
            delta.toolName,
            "input" in delta
              ? (delta.input as Record<string, unknown>)
              : undefined
          );
          actionIds.set(delta.toolCallId, actionId);
        } else if (delta.type === "tool-result") {
          // Mark the action as completed
          const actionId = actionIds.get(delta.toolCallId);
          if (actionId) {
            subAgentProgress.completeAction(sessionId, actionId);
          }
        }
      }

      // Mark session as complete
      subAgentProgress.completeSession(sessionId);

      return {
        result: finalText.trim() || "(no output generated)",
        toolCalls,
        completed: true,
        sessionId,
      };
    } catch (error: any) {
      console.error("Sub-agent error:", error);
      subAgentProgress.completeSession(sessionId, error.message);
      return {
        result: `Error during sub-agent execution: ${error.message}`,
        toolCalls: 0,
        completed: false,
        error: error.message,
        sessionId,
      };
    }
  },
});
