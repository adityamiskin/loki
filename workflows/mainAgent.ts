import { createHook, sleep } from "workflow";
import { start } from "workflow/api";
import { subAgentWorkflow, type SubAgentResult } from "./subAgent";

export type MainAgentInput = {
  objective: string;
  subtasks?: string[];
  timeoutSeconds?: number;
};

export type MainAgentResult = {
  objective: string;
  subagents: Array<{
    task: string;
    result: SubAgentResult;
  }>;
};

export async function mainAgentWorkflow(input: MainAgentInput): Promise<MainAgentResult> {
  "use workflow";

  const tasks = (input.subtasks?.length ? input.subtasks : [input.objective]).map((t) =>
    t.trim()
  );

  // Create hooks per subagent so the workflow can suspend until each returns.
  const hooks = tasks.map(() => createHook<SubAgentResult>());

  // Kick off each subagent workflow run with its callback token.
  await Promise.all(
    tasks.map((task, index) =>
      start(subAgentWorkflow, {
        objective: task,
        hookToken: hooks[index].token,
      })
    )
  );

  const waitForAll = Promise.all(hooks);

  // Optional timeout: if provided, race against sleep to prevent indefinite waits.
  const results =
    input.timeoutSeconds && input.timeoutSeconds > 0
      ? await Promise.race([
          waitForAll,
          sleep(`${input.timeoutSeconds}s`).then(() => {
            throw new Error(`Timed out waiting for subagents after ${input.timeoutSeconds}s`);
          }),
        ])
      : await waitForAll;

  return {
    objective: input.objective,
    subagents: tasks.map((task, idx) => ({
      task,
      result: results[idx],
    })),
  };
}


