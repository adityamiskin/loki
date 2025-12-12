import {
  createCliRenderer,
  RGBA,
  SyntaxStyle,
  type KeyBinding,
} from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  stepCountIs,
  streamText,
  convertToModelMessages,
  type UIMessage,
  type InferUITool,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { google, type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import * as dotenv from "dotenv";
import { local_shell } from "../tools/local-shell";
import { openai } from "@ai-sdk/openai";
import { systemPrompt } from "./prompts";
import { webSearch } from "../tools/web-search";
import { subAgent } from "../tools/sub-agent";

dotenv.config();

// Define custom shell tool
const tools = {
  local_shell,
  webSearch,
  subAgent,
};

type WebSearchTool = InferUITool<typeof tools.webSearch>;
type LocalShellTool = InferUITool<typeof tools.local_shell>;
type SubAgentTool = InferUITool<typeof tools.subAgent>;

type ChatMessage = UIMessage<WebSearchTool | LocalShellTool | SubAgentTool>;

// Start local HTTP server for chat API
const PORT = 3001;
Bun.serve({
  port: PORT,
  idleTimeout: 60, // 60 second idle timeout for long-running tool executions
  async fetch(req) {
    if (req.method === "POST" && req.url.endsWith("/api/chat")) {
      const body = (await req.json()) as { messages?: ChatMessage[] };
      const messages = body.messages || [];

      const result = streamText({
        model: openai("gpt-5.1"),
        system: systemPrompt,
        messages: convertToModelMessages(messages),
        temperature: 0.7,
        tools,
        stopWhen: stepCountIs(10),
        abortSignal: req.signal,
        onAbort: ({ steps }) => {
          console.log("Stream aborted after", steps.length, "steps");
        },
        providerOptions: {
          openai: {
            reasoningSummary: "auto",
          },
        },
        onError: (error) => {
          console.error("Error:", JSON.stringify(error, null, 2));
        },
      });

      return result.toUIMessageStreamResponse({
        sendReasoning: true,
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Chat API server running on http://localhost:${PORT}`);

function App() {
  const inputRef = useRef<any>(null);
  const [logs, setLogs] = useState<
    Array<{ type: "log" | "error"; message: string; timestamp: number }>
  >([]);
  const [showLogs, setShowLogs] = useState(false);
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  const { messages, sendMessage, stop, status } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: `http://localhost:${PORT}/api/chat`,
    }),
  });

  const spinnerFrames = useMemo(
    () => ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    []
  );
  const markdownSyntaxStyle = useMemo(
    () =>
      SyntaxStyle.fromStyles({
        keyword: { fg: RGBA.fromHex("#8be9fd") },
        string: { fg: RGBA.fromHex("#f1fa8c") },
        comment: { fg: RGBA.fromHex("#6272a4"), italic: true },
        number: { fg: RGBA.fromHex("#bd93f9") },
        default: { fg: RGBA.fromHex("#e0e0e0") },
      }),
    []
  );
  const subAgentTheme = useMemo(
    () => ({
      background: "#171717", // Muted backdrop for sub-agent blocks
      completedBackground: "#141414", // Background for completed sub-agent blocks
      text: "#999999", // Muted text color for sub-agent messages
    }),
    []
  );
  const isLoading = status === "submitted" || status === "streaming";

  // Animate a simple spinner while the agent is working
  useEffect(() => {
    if (!isLoading) {
      setSpinnerIndex(0);
      return;
    }
    const id = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % spinnerFrames.length);
    }, 90);
    return () => clearInterval(id);
  }, [isLoading, spinnerFrames.length]);

  // Capture console logs
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      originalLog(...args);
      setLogs(
        (
          prev: Array<{
            type: "log" | "error";
            message: string;
            timestamp: number;
          }>
        ) => [
          ...prev.slice(-49), // Keep last 50 logs
          {
            type: "log" as const,
            message: args.map(String).join(" "),
            timestamp: Date.now(),
          },
        ]
      );
    };

    console.error = (...args: any[]) => {
      originalError(...args);
      setLogs(
        (
          prev: Array<{
            type: "log" | "error";
            message: string;
            timestamp: number;
          }>
        ) => [
          ...prev.slice(-49), // Keep last 50 logs
          {
            type: "error" as const,
            message: args.map(String).join(" "),
            timestamp: Date.now(),
          },
        ]
      );
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
    };
  }, []);

  // Handle keyboard events
  useKeyboard((key) => {
    if (key.name === "escape") {
      // Try to abort active stream first if one is running
      if (status === "submitted" || status === "streaming") {
        stop();
        return; // Don't exit, just abort the stream
      }
      // If no active stream, exit the application
      process.exit(0);
    }
    if (key.ctrl && key.name === "c") {
      process.exit(0);
    }
    if (key.name === "`" || key.name === "backtick") {
      setShowLogs((prev: boolean) => !prev);
    }
    // Enter/Shift+Enter handling is done by textarea keyBindings
    // Don't handle Enter here to avoid interfering with textarea's keyBindings
  });

  // Handle input submission
  const handleSubmit = useCallback(() => {
    if (inputRef.current) {
      const value = inputRef.current.plainText?.trim() || "";
      if (value) {
        sendMessage({ text: value });
        inputRef.current.setText?.("");
      }
    }
  }, [sendMessage]);

  // Configure keyBindings: Shift+Enter for newline, Enter for submit
  // This overrides the default behavior where Enter inserts newline
  // Order matters: more specific bindings (with modifiers) should come first
  const customKeyBindings: KeyBinding[] = useMemo(
    () => [
      // Shift+Enter: insert newline (more specific, comes first)
      { name: "return", shift: true, action: "newline" },
      // Plain Enter: submit (overrides default newline behavior)
      { name: "return", action: "submit" },
    ],
    []
  );

  // Focus input on mount and ensure keyBindings are set
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus?.();
      // Also set keyBindings via ref as fallback (in case props don't work)
      inputRef.current.keyBindings = customKeyBindings;
      inputRef.current.onSubmit = handleSubmit;
    }
  }, [customKeyBindings, handleSubmit]);

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor="#000000"
    >
      {/* Output panel - scrollable message area */}
      <scrollbox
        flexGrow={1}
        stickyScroll={true}
        stickyStart="bottom"
        rootOptions={{
          flexGrow: 1,
          backgroundColor: "#000000",
        }}
        wrapperOptions={{
          backgroundColor: "#000000",
        }}
        viewportOptions={{
          backgroundColor: "#000000",
        }}
        contentOptions={{
          flexDirection: "column",
          gap: 1,
          padding: 1,
          backgroundColor: "#000000",
        }}
        scrollbarOptions={{
          showArrows: false,
          trackOptions: {
            foregroundColor: "#333333",
            backgroundColor: "#1a1a1a",
          },
        }}
      >
        {messages.map((message) => {
          const isUser = message.role === "user";
          const hasSubAgent = message.parts?.some(
            (part) => part.type === "tool-subAgent"
          );
          const hasText = message.parts?.some((part) => part.type === "text");
          // Only apply sub-agent background if message has sub-agent parts but no text parts
          const isSubAgentOnly = hasSubAgent && !hasText;
          return (
            <box key={message.id} flexDirection="column" width="100%">
              <box flexDirection="row" width="100%">
                {/* Add colored left border for user messages */}
                {isUser && <box width={0.5} backgroundColor="#1d64ff" />}
                <box
                  flexGrow={1}
                  backgroundColor={
                    isUser
                      ? "#1a1a1a"
                      : isSubAgentOnly
                      ? subAgentTheme.background
                      : "#0a0a0a"
                  }
                  padding={1}
                  flexDirection="column"
                  gap={0.5}
                >
                  {message.parts?.map((part, partIndex) => {
                    // Check if there are sub-agent parts before this text part
                    const hasSubAgentBefore =
                      !isUser &&
                      part.type === "text" &&
                      message.parts
                        ?.slice(0, partIndex)
                        .some((p) => p.type === "tool-subAgent");
                    switch (part.type) {
                      case "reasoning":
                        return (
                          <text key={partIndex} fg="#8888ff">
                            💭 {part.text}
                          </text>
                        );

                      case "text":
                        // Render assistant text as Markdown using OpenTUI's code renderer.
                        if (!isUser) {
                          return (
                            <box
                              key={partIndex}
                              marginTop={hasSubAgentBefore ? 0.5 : 0}
                              width="100%"
                            >
                              <code
                                content={part.text || ""}
                                streaming={true}
                                filetype="markdown"
                                conceal={true}
                                syntaxStyle={markdownSyntaxStyle}
                                width="100%"
                              />
                            </box>
                          );
                        }
                        return (
                          <text key={partIndex} fg="#ffffff">
                            {part.text}
                          </text>
                        );

                      case "tool-local_shell": {
                        const callId = part.toolCallId;
                        switch (part.state) {
                          case "input-streaming":
                            return (
                              <text key={callId} fg="#888888">
                                Preparing shell command...
                              </text>
                            );
                          case "input-available":
                            return (
                              <text key={callId} fg="#00ff88">
                                [local_shell]{" "}
                                {(part.input as { command: string }).command}
                              </text>
                            );
                          case "output-available":
                            return (
                              <text key={callId} fg="#00ff88">
                                [local_shell]{" "}
                                {(part.input as { command: string }).command}
                              </text>
                            );
                          case "output-error":
                            return (
                              <text key={callId} fg="#ff4444">
                                [local_shell] Error: {part.errorText}
                              </text>
                            );
                        }
                        break;
                      }
                      case "tool-subAgent": {
                        const callId = part.toolCallId;
                        const input = part.input as {
                          objective?: string;
                        };
                        const output = part.output as
                          | {
                              result?: string;
                              toolCalls?: number;
                              completed?: boolean;
                            }
                          | undefined;
                        switch (part.state) {
                          case "input-streaming":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#ffd700" flexShrink={0}>
                                  [subAgent]
                                </text>
                                <text fg={subAgentTheme.text} flexGrow={1}>
                                  Spawning sub-agent...
                                </text>
                              </box>
                            );
                          case "input-available":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#ffd700" flexShrink={0}>
                                  [subAgent]
                                </text>
                                <text fg={subAgentTheme.text} flexGrow={1}>
                                  {input?.objective || "(none)"}
                                </text>
                              </box>
                            );
                          case "output-available":
                            const toolCalls = output?.toolCalls || 0;
                            return (
                              <box
                                key={callId}
                                flexDirection="column"
                                gap={0.25}
                              >
                                <box flexDirection="row" gap={1}>
                                  <text fg="#00ff88" flexShrink={0}>
                                    [subAgent]
                                  </text>
                                  <box flexDirection="column" gap={0.25}>
                                    <text fg={subAgentTheme.text} flexGrow={1}>
                                      {input?.objective || "(none)"}
                                    </text>
                                    {toolCalls > 0 && (
                                      <text fg={subAgentTheme.text}>
                                        {toolCalls} tool
                                        {toolCalls !== 1 ? "s" : ""} used
                                      </text>
                                    )}
                                  </box>
                                </box>
                              </box>
                            );
                          case "output-error":
                            return (
                              <text key={callId} fg={subAgentTheme.text}>
                                [subAgent] Error: {part.errorText}
                              </text>
                            );
                        }
                        break;
                      }
                    }
                  })}
                </box>
              </box>
            </box>
          );
        })}
      </scrollbox>

      {/* Log viewer - toggle with ` (backtick) */}
      {showLogs && (
        <box
          flexGrow={0}
          flexShrink={0}
          height={10}
          backgroundColor="#1a1a1a"
          borderStyle="single"
          borderColor="#333333"
          padding={1}
          flexDirection="column"
          gap={0.5}
        >
          <box flexDirection="row" justifyContent="space-between">
            <text fg="#888888">Console Logs (` to toggle)</text>
            <text fg="#888888">{logs.length} logs</text>
          </box>
          <scrollbox
            flexGrow={1}
            stickyScroll={true}
            stickyStart="bottom"
            rootOptions={{
              flexGrow: 1,
              backgroundColor: "#0a0a0a",
            }}
            wrapperOptions={{
              backgroundColor: "#0a0a0a",
            }}
            viewportOptions={{
              backgroundColor: "#0a0a0a",
            }}
            contentOptions={{
              flexDirection: "column",
              gap: 0.5,
              padding: 0.5,
              backgroundColor: "#0a0a0a",
            }}
            scrollbarOptions={{
              showArrows: false,
              trackOptions: {
                foregroundColor: "#333333",
                backgroundColor: "#1a1a1a",
              },
            }}
          >
            {logs.length === 0 ? (
              <text fg="#666666">No logs yet...</text>
            ) : (
              logs.map(
                (
                  log: {
                    type: "log" | "error";
                    message: string;
                    timestamp: number;
                  },
                  index: number
                ) => (
                  <text
                    key={index}
                    fg={log.type === "error" ? "#ff4444" : "#8888ff"}
                  >
                    [{new Date(log.timestamp).toLocaleTimeString()}]{" "}
                    {log.message}
                  </text>
                )
              )
            )}
          </scrollbox>
        </box>
      )}

      {/* Input container */}
      <box
        height={6}
        flexGrow={0}
        flexShrink={0}
        padding={1}
        margin={1}
        backgroundColor="#0a0a0a"
      >
        <textarea
          ref={inputRef}
          width="100%"
          height={5}
          placeholder=""
          backgroundColor="#000000"
          focusedBackgroundColor="#000000"
          textColor="#ffffff"
          focusedTextColor="#ffffff"
          keyBindings={customKeyBindings}
          onSubmit={handleSubmit}
        />
      </box>

      {/* Instructions */}
      <box
        flexGrow={0}
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={1}
        flexDirection="row"
        gap={1}
        justifyContent="space-between"
      >
        <box flexDirection="row" gap={1}>
          {isLoading && (
            <>
              <text fg="#00ccff">
                {spinnerFrames[spinnerIndex % spinnerFrames.length]}
              </text>
              <text fg="#666666">|</text>
              <text fg="#00ccff">esc</text>
              <text fg="#666666">interrupt</text>
            </>
          )}
        </box>
        <box flexDirection="row" gap={1}>
          <text fg="#00ccff">`</text>
          <text fg="#666666">logs</text>
        </box>
      </box>
    </box>
  );
}

async function main() {
  // Create the CLI renderer
  const renderer = await createCliRenderer({
    consoleOptions: {
      startInDebugMode: false,
    },
  });

  // Render the React app
  createRoot(renderer).render(<App />);
}

main().catch(console.error);
