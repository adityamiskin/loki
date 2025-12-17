import { tool, streamText, stepCountIs } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { local_shell } from "./local-shell";
import { webSearch } from "./web-search";
import { loadSkill } from "./load-skill";
import { buildSubAgentSystemPrompt } from "../src/prompts";
import { loadSkills, summarizeSkills } from "../src/skills";

// Sub-agent tools - can use the same tools as the main agent
const subAgentTools = {
  local_shell,
  webSearch,
  loadSkill,
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
    const skillSummaries = summarizeSkills(skills);
    const system = buildSubAgentSystemPrompt(skillSummaries);

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

    console.log("Sub-agent starting with:", {
      objective,
      context,
      maxToolRounds,
    });

    try {
      const result = streamText({
        model: openai("gpt-4.1"),
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

      for await (const delta of result.fullStream) {
        if (delta.type === "text-delta") {
          finalText += delta.text;
        } else if (delta.type === "tool-call") {
          toolCalls++;
          console.log(`Tool call #${toolCalls}:`, delta.toolName);
        }
      }

      console.log("Final result:", finalText);

      return {
        result: finalText.trim() || "(no output generated)",
        toolCalls,
        completed: true,
      };
    } catch (error: any) {
      console.error("Sub-agent error:", error);
      return {
        result: `Error during sub-agent execution: ${error.message}`,
        toolCalls: 0,
        completed: false,
        error: error.message,
      };
    }
  },
});
