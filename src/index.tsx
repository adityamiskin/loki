import {
  createCliRenderer,
  RGBA,
  SyntaxStyle,
  type KeyBinding,
} from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
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
import { shell } from "../tools/local-shell";
import { openai } from "@ai-sdk/openai";
import { buildSystemPrompt } from "./prompts";
import { webSearch } from "../tools/web-search";
import { subAgent } from "../tools/sub-agent";
import { loadSkill } from "../tools/load-skill";
import { loadSkills, type SkillDefinition } from "./skills";
import clipboardy from "clipboardy";

dotenv.config();

// Define custom shell tool
const tools = {
  shell,
  webSearch,
  subAgent,
  loadSkill,
};

type WebSearchTool = InferUITool<typeof tools.webSearch>;
type LocalShellTool = InferUITool<typeof tools.shell>;
type SubAgentTool = InferUITool<typeof tools.subAgent>;
type LoadSkillTool = InferUITool<typeof tools.loadSkill>;

type ChatMessage = UIMessage<
  WebSearchTool | LocalShellTool | SubAgentTool | LoadSkillTool
>;

const skills = loadSkills();
const defaultSystemPrompt = buildSystemPrompt(skills);
const skillTriggers = buildSkillTriggers(skills);

// Match $skill-name tokens to trigger the corresponding skill guidance.
const SKILL_REFERENCE_REGEX = /\$([A-Za-z0-9_-]+)/g;

function buildSkillTriggers(
  skills: SkillDefinition[]
): Map<string, SkillDefinition> {
  const map = new Map<string, SkillDefinition>();
  for (const skill of skills) {
    for (const key of deriveLookupKeys(skill.name)) {
      if (!map.has(key)) {
        map.set(key, skill);
      }
    }
  }
  return map;
}

function deriveLookupKeys(name: string): string[] {
  const lower = name.toLowerCase();
  const cleaned = lower.replace(/[^a-z0-9\s_-]+/g, " ").trim();
  const set = new Set<string>();
  const compact = cleaned.replace(/[\s_-]+/g, "");
  if (compact) {
    set.add(compact);
  }
  const dashy = cleaned.replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  if (dashy) {
    set.add(dashy);
  }
  const underscored = cleaned.replace(/[\s-]+/g, "_").replace(/_+/g, "_");
  if (underscored) {
    set.add(underscored);
  }
  if (cleaned) {
    set.add(cleaned.replace(/\s+/g, "-"));
    set.add(cleaned.replace(/\s+/g, "_"));
  }
  if (!set.size) {
    const fallback = lower.replace(/[^a-z0-9]+/g, "");
    if (fallback) {
      set.add(fallback);
    }
  }
  return Array.from(set).filter(Boolean);
}

function flattenMessageText(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function collectTriggeredSkills(
  messages: ChatMessage[],
  triggers: Map<string, SkillDefinition>
): SkillDefinition[] {
  const seen = new Set<SkillDefinition>();
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const text = flattenMessageText(message);
    if (!text) {
      continue;
    }
    for (const match of text.matchAll(SKILL_REFERENCE_REGEX)) {
      const token = match[1]?.toLowerCase();
      if (!token) {
        continue;
      }
      const skill = triggers.get(token);
      if (skill) {
        seen.add(skill);
      }
    }
  }
  return Array.from(seen);
}

function buildRuntimeSystemPrompt(
  messages: ChatMessage[],
  basePrompt: string,
  triggers: Map<string, SkillDefinition>
): string {
  if (!triggers.size) {
    return basePrompt;
  }
  const triggeredSkills = collectTriggeredSkills(messages, triggers);
  if (!triggeredSkills.length) {
    return basePrompt;
  }
  const bodySections = triggeredSkills
    .map((skill) => {
      const guidance = skill.body || "(skill body unavailable)";
      return `### Skill: ${skill.name}\nFile: ${skill.filePath}\n${guidance}`;
    })
    .join("\n\n");
  return `${basePrompt}\n\n## Skill Guidance\n${bodySections}`;
}

// Start local HTTP server for chat API
const PORT = 3001;
Bun.serve({
  port: PORT,
  idleTimeout: 255, // 10 minutes idle timeout for long-running tool executions
  async fetch(req) {
    if (req.method === "POST" && req.url.endsWith("/api/chat")) {
      const body = (await req.json()) as { messages?: ChatMessage[] };
      const messages = body.messages || [];

      const runtimeSystemPrompt = buildRuntimeSystemPrompt(
        messages,
        defaultSystemPrompt,
        skillTriggers
      );

      const result = streamText({
        model: openai("gpt-5.1"),
        system: runtimeSystemPrompt,
        messages: convertToModelMessages(messages),
        tools,
        stopWhen: stepCountIs(20),
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
const copyToClipboard = async (text: string) => {
  try {
    // Try clipboardy first (cross-platform clipboard library)
    await clipboardy.write(text);
  } catch (err) {
    // Fallback to OSC 52 escape sequence (works in terminals that support it)
    try {
      const base64 = Buffer.from(text).toString("base64");
      process.stdout.write(`\x1b]52;c;${base64}\x07`);
    } catch (oscErr) {
      console.error("Failed to copy to clipboard:", err || oscErr);
    }
  }
};

function Spinner({ frames }: { frames: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % frames.length);
    }, 90);
    return () => clearInterval(id);
  }, [frames.length]);

  return <text fg="#3b82f6">{frames[index]}</text>;
}

function App() {
  const inputRef = useRef<any>(null);
  const renderer = useRenderer();
  const [showCopied, setShowCopied] = useState(false);
  const copiedTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!renderer) return;

    const handleSelection = async (selection: any) => {
      const text = selection.getSelectedText();
      if (text) {
        await copyToClipboard(text);
        setShowCopied(true);
        if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = setTimeout(() => {
          setShowCopied(false);
        }, 2000);
      }
    };

    renderer.on("selection", handleSelection);
    return () => {
      renderer.off("selection", handleSelection);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, [renderer]);

  const [logs, setLogs] = useState<
    Array<{ type: "log" | "error"; message: string; timestamp: number }>
  >([]);
  const [showLogs, setShowLogs] = useState(false);

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
        // Text formatting
        bold: { fg: RGBA.fromHex("#e0cc00"), bold: true }, // golden yellow
        italic: { fg: RGBA.fromHex("#00ccaa"), italic: true }, // teal
        underline: { fg: RGBA.fromHex("#cc33cc"), underline: true }, // purple
        dim: { fg: RGBA.fromHex("#555555"), dim: true }, // gray
        "markup.strong": { fg: RGBA.fromHex("#e0cc00"), bold: true }, // strong emphasis (bold)
        "markup.italic": { fg: RGBA.fromHex("#00ccaa"), italic: true }, // emphasis (italic)
        "markup.strikethrough": { fg: RGBA.fromHex("#888888"), dim: true }, // strikethrough (dimmed gray)

        // Headings
        "markup.heading.1": { fg: RGBA.fromHex("#ff6b6b"), bold: true }, // red, bold
        "markup.heading.2": { fg: RGBA.fromHex("#ff8e53"), bold: true }, // orange, bold
        "markup.heading.3": { fg: RGBA.fromHex("#ffa94d"), bold: true }, // light orange, bold
        "markup.heading.4": { fg: RGBA.fromHex("#ffd43b"), bold: true }, // yellow, bold
        "markup.heading.5": { fg: RGBA.fromHex("#e0cc00"), bold: true }, // golden yellow, bold
        "markup.heading.6": { fg: RGBA.fromHex("#d4d4d4"), bold: true }, // light gray, bold

        // Lists
        "markup.list": { fg: RGBA.fromHex("#51cf66") }, // green for list markers
        "markup.list.checked": { fg: RGBA.fromHex("#51cf66") }, // green for checked items
        "markup.list.unchecked": { fg: RGBA.fromHex("#868e96") }, // gray for unchecked items

        // Code blocks and inline code
        "markup.raw.block": {
          fg: RGBA.fromHex("#a5d8ff"),
          bg: RGBA.fromHex("#1a1a1a"),
        }, // light blue for code blocks
        "markup.raw": {
          fg: RGBA.fromHex("#a5d8ff"),
          bg: RGBA.fromHex("#1a1a1a"),
        }, // light blue for inline code

        // Links
        "markup.link": { fg: RGBA.fromHex("#4dabf7"), underline: true }, // blue for links
        "markup.link.url": { fg: RGBA.fromHex("#74c0fc"), underline: true }, // lighter blue for URLs
        "markup.link.label": { fg: RGBA.fromHex("#339af0") }, // medium blue for link labels

        // Block quotes
        "markup.quote": { fg: RGBA.fromHex("#868e96"), italic: true }, // gray, italic for quotes

        // Labels (like language tags in code blocks)
        label: { fg: RGBA.fromHex("#868e96") }, // gray for labels
      }),
    []
  );
  const isLoading = status === "submitted" || status === "streaming";

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
    if (key.ctrl && key.name === "q") {
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
      backgroundColor="#0d0d0d"
    >
      {showCopied && (
        <box
          position="absolute"
          top={2}
          right={3}
          width={24}
          height={3}
          backgroundColor="#1a1a1a"
          zIndex={1000}
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
        >
          <text fg="#9ca3af">Copied to clipboard</text>
        </box>
      )}
      {/* Output panel - scrollable message area */}
      <scrollbox
        flexGrow={1}
        stickyScroll={true}
        stickyStart="bottom"
        rootOptions={{
          flexGrow: 1,
          backgroundColor: "#0d0d0d",
        }}
        wrapperOptions={{
          backgroundColor: "#0d0d0d",
        }}
        viewportOptions={{
          backgroundColor: "#0d0d0d",
        }}
        contentOptions={{
          flexDirection: "column",
          gap: 0,
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 1,
          paddingBottom: 1,
          backgroundColor: "#0d0d0d",
        }}
        scrollbarOptions={{
          showArrows: false,
          trackOptions: {
            foregroundColor: "#2a2a2a",
            backgroundColor: "#0d0d0d",
          },
        }}
      >
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <box key={message.id} flexDirection="column" width="100%">
              <box flexDirection="row" width="100%">
                {/* Left accent border */}
                <box
                  width={1}
                  backgroundColor={isUser ? "#3b82f6" : "transparent"}
                  marginRight={0.25}
                />
                <box
                  flexGrow={1}
                  backgroundColor={isUser ? "#1a1a1a" : "transparent"}
                  flexDirection="column"
                  padding={1}
                  paddingLeft={2}
                  paddingRight={2}
                  gap={0.25}
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
                          <code
                            key={partIndex}
                            syntaxStyle={markdownSyntaxStyle}
                            content={part.text}
                            streaming={true}
                            filetype="markdown"
                            drawUnstyledText={false}
                            width="100%"
                          />
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
                                drawUnstyledText={false}
                                syntaxStyle={markdownSyntaxStyle}
                                width="100%"
                              />
                            </box>
                          );
                        }
                        return (
                          <text key={partIndex} fg="#e5e5e5">
                            {part.text}
                          </text>
                        );

                      case "tool-shell": {
                        const callId = part.toolCallId;
                        switch (part.state) {
                          case "input-streaming":
                            return (
                              <text key={callId} fg="#6b7280">
                                Preparing shell command...
                              </text>
                            );
                          case "input-available":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#10b981">◉</text>
                                <text fg="#9ca3af">
                                  {(part.input as { command: string }).command}
                                </text>
                              </box>
                            );
                          case "output-available":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#22c55e">✓</text>
                                <text fg="#6b7280">
                                  {(part.input as { command: string }).command}
                                </text>
                              </box>
                            );
                          case "output-error":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#ef4444">✗</text>
                                <text fg="#6b7280">
                                  Error: {part.errorText}
                                </text>
                              </box>
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
                                <text fg="#f59e0b">◐</text>
                                <text fg="#6b7280">Spawning sub-agent...</text>
                              </box>
                            );
                          case "input-available":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#f59e0b">◉</text>
                                <text fg="#9ca3af">
                                  {input?.objective || "(none)"}
                                </text>
                              </box>
                            );
                          case "output-available":
                            const toolCalls = output?.toolCalls || 0;
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#22c55e">✓</text>
                                <text fg="#6b7280">
                                  {input?.objective || "(none)"}
                                </text>
                                {toolCalls > 0 && (
                                  <text fg="#4b5563">
                                    · {toolCalls} tool
                                    {toolCalls !== 1 ? "s" : ""}
                                  </text>
                                )}
                              </box>
                            );
                          case "output-error":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#ef4444">✗</text>
                                <text fg="#6b7280">
                                  Error: {part.errorText}
                                </text>
                              </box>
                            );
                        }
                        break;
                      }
                      case "tool-loadSkill": {
                        const callId = part.toolCallId;
                        const input = part.input as { skillName?: string };
                        const output = part.output as
                          | {
                              skillName?: string | null;
                              description?: string;
                              baseDirectory?: string | null;
                              instructions?: string | null;
                              error?: string;
                            }
                          | undefined;
                        switch (part.state) {
                          case "input-streaming":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#a855f7">◐</text>
                                <text fg="#6b7280">Loading skill...</text>
                              </box>
                            );
                          case "input-available":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#a855f7">◉</text>
                                <text fg="#9ca3af">
                                  {input?.skillName || "(unknown)"}
                                </text>
                              </box>
                            );
                          case "output-available":
                            if (output?.error) {
                              return (
                                <box key={callId} flexDirection="row" gap={1}>
                                  <text fg="#ef4444">✗</text>
                                  <text fg="#6b7280">{output.error}</text>
                                </box>
                              );
                            }
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#22c55e">✓</text>
                                <text fg="#6b7280">
                                  {output?.skillName ||
                                    input?.skillName ||
                                    "(unknown)"}
                                </text>
                                {output?.baseDirectory && (
                                  <text fg="#4b5563">
                                    · {output.baseDirectory}
                                  </text>
                                )}
                              </box>
                            );
                          case "output-error":
                            return (
                              <box key={callId} flexDirection="row" gap={1}>
                                <text fg="#ef4444">✗</text>
                                <text fg="#6b7280">{part.errorText}</text>
                              </box>
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
          backgroundColor="#111111"
          borderStyle="single"
          borderColor="#2a2a2a"
          padding={1}
          flexDirection="column"
          gap={0.5}
        >
          <box flexDirection="row" justifyContent="space-between">
            <text fg="#6b7280">Console Logs (` to toggle)</text>
            <text fg="#4b5563">{logs.length} logs</text>
          </box>
          <scrollbox
            flexGrow={1}
            stickyScroll={true}
            stickyStart="bottom"
            rootOptions={{
              flexGrow: 1,
              backgroundColor: "#0d0d0d",
            }}
            wrapperOptions={{
              backgroundColor: "#0d0d0d",
            }}
            viewportOptions={{
              backgroundColor: "#0d0d0d",
            }}
            contentOptions={{
              flexDirection: "column",
              gap: 0.5,
              padding: 0.5,
              backgroundColor: "#0d0d0d",
            }}
            scrollbarOptions={{
              showArrows: false,
              trackOptions: {
                foregroundColor: "#2a2a2a",
                backgroundColor: "#111111",
              },
            }}
          >
            {logs.length === 0 ? (
              <text fg="#4b5563">No logs yet...</text>
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
                    fg={log.type === "error" ? "#ef4444" : "#60a5fa"}
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
        flexGrow={0}
        flexShrink={0}
        padding={1}
        backgroundColor="#0d0d0d"
        flexDirection="column"
      >
        {/* Input box with left accent border */}
        <box flexDirection="row" width="100%">
          <box
            flexGrow={1}
            backgroundColor="#1a1a1a"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            marginBottom={1}
            flexDirection="column"
          >
            <textarea
              ref={inputRef}
              width="100%"
              height={3}
              placeholder=""
              keyBindings={customKeyBindings}
              onSubmit={handleSubmit}
            />
          </box>
        </box>
        {/* Bottom status bar */}
        <box
          flexDirection="row"
          justifyContent="space-between"
          paddingLeft={1}
          paddingRight={1}
        >
          <box flexDirection="row" justifyContent="space-between">
            <box flexDirection="row" gap={1}>
              {isLoading ? (
                <>
                  <Spinner frames={spinnerFrames} />
                  <text fg="#4b5563">Working...</text>
                </>
              ) : null}
            </box>
          </box>

          <box flexDirection="row" gap={2}>
            <text fg="#4b5563">{process.cwd()}</text>

            <box flexDirection="row" gap={1}>
              <text fg="#ffffff">esc</text>
              <text fg="#4b5563">interrupt</text>
            </box>

            <box flexDirection="row" gap={1}>
              <text fg="#ffffff">ctrl+q</text>
              <text fg="#4b5563">logs</text>
            </box>
          </box>
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
