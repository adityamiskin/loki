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
import { logger } from "../src/utils/logger";
import { createTypedError, ErrorCategory, ErrorCode } from "../src/utils/errors";
import { withRetry, isTransientError } from "../src/utils/retry";

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
    logger.setModule("subagent");
    logger.info("Starting sub-agent session", { objective, contextLength: context.length });

    const skills = loadSkills();
    const system = buildSubAgentSystemPrompt(skills);

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

    const maxToolRounds = 30;

    try {
      const streamResult = async () => {
        return streamText({
          model: openai("gpt-5.1"),
          system,
          messages,
          tools: subAgentTools,
          stopWhen: [
            stepCountIs(maxToolRounds + 1),
            ({ steps }) => steps.some((step) => (step.text?.length ?? 0) > 0),
          ],
          prepareStep: async ({ stepNumber }) => {
            if (stepNumber >= maxToolRounds) {
              return {
                activeTools: [],
              };
            }
            return {};
          },
        });
      };

      const result = await withRetry(streamResult, {
        maxRetries: 2,
        retryOn: isTransientError,
      });

      let toolCalls = 0;
      let finalText = "";
      const actionIds: Map<string, string> = new Map();

      for await (const delta of result.fullStream) {
        if (delta.type === "text-delta") {
          finalText += delta.text;
        } else if (delta.type === "tool-call") {
          toolCalls++;
          const actionId = subAgentProgress.addAction(
            sessionId,
            delta.toolName,
            "input" in delta
              ? (delta.input as Record<string, unknown>)
              : undefined
          );
          actionIds.set(delta.toolCallId, actionId);
        } else if (delta.type === "tool-result") {
          const actionId = actionIds.get(delta.toolCallId);
          if (actionId) {
            subAgentProgress.completeAction(sessionId, actionId);
          }
        }
      }

      subAgentProgress.completeSession(sessionId);
      logger.info("Sub-agent session completed", { sessionId, toolCalls });

      return {
        result: finalText.trim() || "(no output generated)",
        toolCalls,
        completed: true,
        sessionId,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error("Sub-agent session error", { sessionId, error: errorMessage });
      
      subAgentProgress.completeSession(sessionId, errorMessage);
      
      const typedError = createTypedError(
        errorMessage,
        ErrorCategory.RUNTIME,
        ErrorCode.INTERNAL_ERROR,
        {
          recoverable: isTransientError(error),
          suggestions: [
            "Try simplifying the objective",
            "Break the task into smaller steps",
            "Check if required resources are available",
          ],
        }
      );

      return {
        result: `Error during sub-agent execution: ${errorMessage}`,
        toolCalls: 0,
        completed: false,
        error: errorMessage,
        sessionId,
        errorCategory: ErrorCategory.RUNTIME,
        errorCode: ErrorCode.INTERNAL_ERROR,
      };
    }
  },
});
