import { EventEmitter } from "events";

export interface SubAgentAction {
  id: string;
  type: "tool-call" | "tool-result";
  toolName: string;
  displayText: string;
  timestamp: number;
  status: "pending" | "running" | "completed" | "error";
}

export interface SubAgentSession {
  id: string;
  objective: string;
  actions: SubAgentAction[];
  status: "running" | "completed" | "error";
  startTime: number;
}

class SubAgentProgressStore extends EventEmitter {
  private sessions: Map<string, SubAgentSession> = new Map();

  createSession(id: string, objective: string): SubAgentSession {
    const session: SubAgentSession = {
      id,
      objective,
      actions: [],
      status: "running",
      startTime: Date.now(),
    };
    this.sessions.set(id, session);
    this.emit("session-created", session);
    this.emit("update", id);
    return session;
  }

  addAction(
    sessionId: string,
    toolName: string,
    args?: Record<string, unknown>
  ): string {
    const session = this.sessions.get(sessionId);
    if (!session) return "";

    const actionId = `${sessionId}-${session.actions.length}`;
    const displayText = formatToolAction(toolName, args);

    const action: SubAgentAction = {
      id: actionId,
      type: "tool-call",
      toolName,
      displayText,
      timestamp: Date.now(),
      status: "running",
    };

    session.actions.push(action);
    this.emit("action-added", { sessionId, action });
    this.emit("update", sessionId);
    return actionId;
  }

  completeAction(sessionId: string, actionId: string, error?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const action = session.actions.find((a) => a.id === actionId);
    if (action) {
      action.status = error ? "error" : "completed";
      this.emit("action-completed", { sessionId, actionId, error });
      this.emit("update", sessionId);
    }
  }

  completeSession(sessionId: string, error?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = error ? "error" : "completed";
    this.emit("session-completed", { sessionId, error });
    this.emit("update", sessionId);
  }

  getSession(id: string): SubAgentSession | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): SubAgentSession[] {
    return Array.from(this.sessions.values());
  }

  clearSession(id: string): void {
    this.sessions.delete(id);
    this.emit("session-cleared", id);
  }
}

function formatToolAction(
  toolName: string,
  args?: Record<string, unknown>
): string {
  switch (toolName) {
    case "shell":
      const cmd = args?.command as string | undefined;
      if (cmd) {
        const trimmed = cmd.trim();
        return trimmed.length > 50 ? trimmed.substring(0, 47) + "..." : trimmed;
      }
      return "Shell command";

    case "readFile":
      const filePath = args?.filePath as string | undefined;
      if (filePath) {
        // Extract just the filename
        const fileName = filePath.split("/").pop() || filePath;
        return `Read ${fileName}`;
      }
      return "Read file";

    case "writeFile":
      const writePath = args?.filePath as string | undefined;
      if (writePath) {
        const fileName = writePath.split("/").pop() || writePath;
        return `Write ${fileName}`;
      }
      return "Write file";

    case "editFile":
      const editPath = args?.filePath as string | undefined;
      if (editPath) {
        const fileName = editPath.split("/").pop() || editPath;
        return `Edit ${fileName}`;
      }
      return "Edit file";

    case "globFiles":
      const pattern = args?.pattern as string | undefined;
      return pattern ? `Glob ${pattern}` : "Glob files";

    case "grep":
      const grepPattern = args?.pattern as string | undefined;
      return grepPattern ? `Grep "${grepPattern}"` : "Grep";

    case "webSearch":
      const query = args?.query as string | undefined;
      return query ? `Search "${query}"` : "Web search";

    case "loadSkill":
      const skillName = args?.skillName as string | undefined;
      return skillName ? `Load skill ${skillName}` : "Load skill";

    case "listDir":
      const dir = args?.path as string | undefined;
      if (dir) {
        const dirName = dir.split("/").pop() || dir;
        return `List ${dirName}`;
      }
      return "List directory";

    default:
      return toolName.replace(/([A-Z])/g, " $1").trim();
  }
}

// Export singleton instance
export const subAgentProgress = new SubAgentProgressStore();
