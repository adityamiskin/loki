import { subAgent as subAgentTool } from "../tools/sub-agent";

export type SubAgentInput = {
  objective: string;
  hookToken: string;
  context?: string[];
};

export type SubAgentResult = {
  result: string;
  toolCalls: number;
  completed: boolean;
  objective: string;
};

const CALLBACK_BASE =
  process.env.SUBAGENT_CALLBACK_BASE_URL ?? "http://localhost:3001/api/subagent-callback";

async function runSubAgent(objective: string, context: string[] = []): Promise<SubAgentResult> {
  "use step";

  const execution = await subAgentTool.execute({ objective, context });
  return {
    result: execution.result ?? "(no output)",
    toolCalls: execution.toolCalls ?? 0,
    completed: execution.completed !== false,
    objective,
  };
}

async function notifyParent(hookToken: string, payload: SubAgentResult): Promise<void> {
  "use step";

  const url = `${CALLBACK_BASE}?token=${encodeURIComponent(hookToken)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to notify parent: ${response.status} ${text}`);
  }
}

export async function subAgentWorkflow(input: SubAgentInput): Promise<SubAgentResult> {
  "use workflow";

  const result = await runSubAgent(input.objective, input.context ?? []);
  await notifyParent(input.hookToken, result);
  return result;
}

