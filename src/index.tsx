import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import {
  stepCountIs,
  streamText,
  convertToModelMessages,
  type UIMessage,
  type InferUITool,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { google } from "@ai-sdk/google";
import * as dotenv from "dotenv";
import { local_shell } from "../tools/local_shell";

dotenv.config();

// Define custom shell tool
const tools = {
  local_shell,
};

type localShellTool = InferUITool<typeof tools.local_shell>;

type ChatMessage = UIMessage<localShellTool>;

// Start local HTTP server for chat API
const PORT = 3001;
Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method === "POST" && req.url.endsWith("/api/chat")) {
      const body = (await req.json()) as { messages?: ChatMessage[] };
      const messages = body.messages || [];

      const result = streamText({
        model: google("gemini-flash-latest"),
        system:
          "You are a helpful AI assistant. Be concise, friendly, and conversational in your responses. You have access to a local shell tool that you can use to execute commands when needed.",
        messages: convertToModelMessages(messages),
        temperature: 0.7,
        tools,
        stopWhen: stepCountIs(10),
        abortSignal: req.signal,
        onAbort: ({ steps }) => {
          console.log("Stream aborted after", steps.length, "steps");
        },
      });

      return result.toUIMessageStreamResponse();
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Chat API server running on http://localhost:${PORT}`);

function App() {
  const inputRef = useRef<any>(null);

  const { messages, sendMessage, stop, status } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: `http://localhost:${PORT}/api/chat`,
    }),
  });

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
  });

  // Handle input submission
  const handleSubmit = () => {
    if (inputRef.current) {
      const value = inputRef.current.plainText?.trim() || "";
      if (value) {
        sendMessage({ text: value });
        inputRef.current.setText?.("");
      }
    }
  };

  // Focus input on mount and set up onSubmit
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus?.();
      inputRef.current.onSubmit = handleSubmit;
      inputRef.current.keyBindings = [{ name: "return", action: "submit" }];
    }
  }, [handleSubmit, stop]);

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
          return (
            <box key={message.id} flexDirection="column" width="100%">
              <box flexDirection="row" width="100%">
                {/* Add colored left border for user messages */}
                {isUser && <box width={0.5} backgroundColor="#1d64ff" />}
                <box
                  flexGrow={1}
                  backgroundColor={isUser ? "#1a1a1a" : "#0a0a0a"}
                  padding={1}
                  flexDirection="column"
                  gap={0.5}
                >
                  {message.parts?.map((part, partIndex) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <text
                            key={partIndex}
                            fg={isUser ? "#ffffff" : "#e0e0e0"}
                          >
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
                    }
                  })}
                </box>
              </box>
            </box>
          );
        })}
      </scrollbox>

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
        />
      </box>

      {/* Instructions */}
      <box
        flexGrow={0}
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={1}
      >
        <text fg="#666666">Press ESC to stop</text>
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
