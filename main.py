import asyncio
import io
import json
import os
import shlex

# New imports for DevTools actions
import subprocess

from browser_use import (
    ActionResult,
    Controller,
)  # Assuming Browser and Agent are used by your Agent class
from browser_use.agent.memory import MemoryConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

controller = Controller()

# LLM Configuration (as in your original file)
# llm = ChatOpenAI(
#     model="o4-mini", # Your original model
#     temperature=1,
# )
# planner_llm = ChatOpenAI(model="o4-mini") # Your original planner

# Updated LLM config from your example
planner_llm = ChatOpenAI(model="o4-mini")
llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro-preview-05-06", temperature=1)
# Or, if you want to use OpenAI for the main LLM too:
# llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3) # Example using OpenAI


# --- DevTools Configuration ---
DEVTOOLS_SCRIPTS_DIR = "./devtool-scripts"
NODE_EXECUTABLE = "node"  # Or the full path to your Node.js executable if not in PATH


def _sanitize_command(command: str) -> str:
    """
    Sanitize the command for safe execution. (Simplified version from Terminal)
    """
    dangerous_commands = [
        "rm",
        "sudo",
        "shutdown",
        "reboot",
        "mkfs",
        "fdisk",
        ":(){:|:&};:",
    ]  # Added a few more
    # Basic check for commands as whole words or starting with them
    try:
        parts = shlex.split(command)
        # Check if any part starts with a dangerous command followed by a space or end of string
        # This is a bit more robust than simple `in` for parts like `sudoedit` vs `sudo`
        if any(any(part == dc or part.startswith(dc + " ") for dc in dangerous_commands) for part in parts):
            raise ValueError("Use of dangerous commands or patterns is restricted.")
    except Exception:  # Fallback for more complex commands shlex might struggle with or simple string check
        if any(cmd in command for cmd in dangerous_commands):  # Less precise but a fallback
            raise ValueError("Use of dangerous commands is restricted.")
    return command


# --- Helper function for DevTools scripts ---
def _execute_devtools_script(script_name: str, url: str) -> str:
    script_path = os.path.join(DEVTOOLS_SCRIPTS_DIR, script_name)
    if not os.path.exists(script_path):
        # Return JSON error string, as the actions expect a string that might be JSON
        return json.dumps({"error": f"DevTools script not found: {script_path}"})
    if not os.path.exists(os.path.join(DEVTOOLS_SCRIPTS_DIR, "node_modules", "puppeteer")):
        return json.dumps(
            {
                "error": f"Puppeteer not found in {DEVTOOLS_SCRIPTS_DIR}/node_modules. Please run 'npm install puppeteer' in that directory."
            }
        )

    command = [NODE_EXECUTABLE, script_path, url]

    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,  # Handle non-zero exit codes manually
            cwd=DEVTOOLS_SCRIPTS_DIR,  # Important for Node.js to find modules
            timeout=90,  # 90 seconds timeout for Puppeteer tasks
        )

        output_data = process.stdout.strip()
        error_data = process.stderr.strip()  # Capture stderr as well

        if process.returncode != 0:
            # Try to parse JSON from stdout even on error, as Node scripts might output JSON error
            try:
                # Puppeteer scripts are designed to output JSON even for errors they catch
                parsed_stdout_error = json.loads(output_data)
                if "error" in parsed_stdout_error:
                    return json.dumps(
                        {
                            "error": f"Error from {script_name} (exit code {process.returncode}): {parsed_stdout_error['error']}",
                            "stderr": error_data,
                        }
                    )
            except json.JSONDecodeError:
                # If stdout is not JSON, it's unexpected output
                pass
            return json.dumps(
                {
                    "error": f"Error executing {script_name} (exit code {process.returncode})",
                    "stdout": output_data,
                    "stderr": error_data,
                }
            )

        # Node scripts should always output JSON
        try:
            # Just return the JSON string directly. The AI will parse it.
            # Ensure it's valid JSON before returning.
            json.loads(output_data)  # Validate
            return output_data
        except json.JSONDecodeError:
            return json.dumps(
                {
                    "error": f"Non-JSON output received from {script_name}",
                    "raw_output": output_data,
                }
            )

    except subprocess.TimeoutExpired:
        return json.dumps({"error": f"Timeout executing {script_name} for URL: {url}"})
    except FileNotFoundError:  # Handle if NODE_EXECUTABLE is not found
        return json.dumps(
            {
                "error": f"Node.js executable ('{NODE_EXECUTABLE}') not found. Please ensure Node.js is installed and in your PATH."
            }
        )
    except Exception as e:
        return json.dumps({"error": f"Python error calling {script_name}: {str(e)}"})


# --- DevTools Actions ---
@controller.action(
    "Inspect Network Traffic: Fetch and list network requests made by a URL. Shows URL, method, status, resource type, and headers for up to 50 requests. Useful for understanding loaded resources, API calls, and identifying potential issues like broken links or slow requests."
)
def inspect_network_traffic(url: str) -> ActionResult:
    """
    Retrieves network request information (URL, method, status, headers, etc.) for a given URL.
    The AI can use this to understand what resources a page loads, identify slow requests, check API call responses, or find security headers.
    The URL must start with http:// or https://.
    Example: inspect_network_traffic(url="https://example.com")
    """
    if not url.startswith(("http://", "https://")):
        return ActionResult(
            extracted_content=json.dumps({"error": "Invalid URL format. Must start with http:// or https://"})
        )

    result_json_str = _execute_devtools_script("get_network_data.js", url)
    return ActionResult(extracted_content=result_json_str)


@controller.action(
    "Inspect Console Logs: Fetch and list console log messages (e.g., log, error, warn, info) from a URL. Shows message type, text, and source location for up to 50 messages. Essential for debugging JavaScript errors or observing client-side application behavior."
)
def inspect_console_logs(url: str) -> ActionResult:
    """
    Retrieves console messages (log, error, warn, info) from a given URL after the page loads.
    Useful for debugging JavaScript errors, checking for specific log outputs, or monitoring client-side events.
    The URL must start with http:// or https://.
    Example: inspect_console_logs(url="https://example.com")
    """
    if not url.startswith(("http://", "https://")):
        return ActionResult(
            extracted_content=json.dumps({"error": "Invalid URL format. Must start with http:// or https://"})
        )

    result_json_str = _execute_devtools_script("get_console_logs.js", url)
    return ActionResult(extracted_content=result_json_str)


@controller.action(
    "Inspect Application Storage: Fetch cookies, localStorage, and sessionStorage data from a URL. Provides insights into user sessions, stored preferences, or client-side cached data."
)
def inspect_application_storage(url: str) -> ActionResult:
    """
    Retrieves cookies, localStorage, and sessionStorage data from a given URL.
    Helpful for understanding user sessions, stored preferences, identifying tracking mechanisms, or checking for sensitive data exposure in client-side storage.
    The URL must start with http:// or https://.
    Example: inspect_application_storage(url="https://example.com")
    """
    if not url.startswith(("http://", "https://")):
        return ActionResult(
            extracted_content=json.dumps({"error": "Invalid URL format. Must start with http:// or https://"})
        )

    result_json_str = _execute_devtools_script("get_application_storage.js", url)
    return ActionResult(extracted_content=result_json_str)


@controller.action(
    "Inspect Page Sources: List loaded JavaScript files (src, type, async/defer attributes) and a preview (first 5KB) of the main HTML document from a URL. Useful for identifying third-party scripts, analyzing initial HTML structure, or finding inline scripts."
)
def inspect_page_sources(url: str) -> ActionResult:
    """
    Lists JavaScript files loaded by the page and provides a preview of the main HTML document's source code.
    Can be used to identify third-party scripts, analyze the initial HTML structure, or look for specific meta tags or inline scripts.
    The URL must start with http:// or https://.
    Example: inspect_page_sources(url="https://example.com")
    """
    if not url.startswith(("http://", "https://")):
        return ActionResult(
            extracted_content=json.dumps({"error": "Invalid URL format. Must start with http:// or https://"})
        )

    result_json_str = _execute_devtools_script("get_page_sources.js", url)
    return ActionResult(extracted_content=result_json_str)


# --- Existing Actions (Python and Bash execution) ---
@controller.action(
    "Write and execute Python Code. Use print statements to see results. Code will be executed in the same environment as the agent. Be careful with infinite loops or resource-intensive code."
)
def execute_python_code(
    code: str,
) -> ActionResult:  # Ensure return type is ActionResult
    """
    Execute arbitrary Python code and capture print output. Use with caution.
    Ensure the code is complete and self-contained if it doesn't rely on previous state.
    Example: execute_python_code(code='print("Hello from Python!")')
    Example: execute_python_code(code='import os; print(os.getcwd())')
    """
    local_io = io.StringIO()  # Use a local StringIO instance
    # sys is already imported at the top of the file, but good practice to be explicit if it wasn't
    import sys  # Ensure sys is available in this scope if not globally imported

    old_stdout = sys.stdout
    sys.stdout = local_io  # Redirect to local_io
    try:
        # Consider using a restricted environment or a separate process for exec if security is paramount
        # For now, direct exec is used as per original.
        exec(code)
        output_string = local_io.getvalue()
        return ActionResult(extracted_content=f"Code executed successfully. Output:\n{output_string}")
    except Exception as e:
        output_string = local_io.getvalue()  # Get any output before the exception
        return ActionResult(
            extracted_content=f"Error executing Python code: {e}\nPartial Output (if any):\n{output_string}"
        )
    finally:
        sys.stdout = old_stdout  # Always restore stdout
        local_io.close()


@controller.action(
    "Execute Bash Command. Use with extreme caution as this can modify the system. Only use for simple, non-interactive commands."
)
async def execute_bash_command(
    command: str,
) -> ActionResult:  # Ensure return type is ActionResult
    """
    Execute arbitrary bash commands. Use with extreme caution.
    Output and errors from the command will be returned.
    The command is sanitized to prevent some dangerous operations.
    Example: execute_bash_command(command="ls -la")
    Example: execute_bash_command(command="echo 'Hello from Bash'")
    """
    final_output = {"output": "", "error": ""}

    try:
        sanitized_command = _sanitize_command(command)
    except ValueError as e:
        return ActionResult(extracted_content=f"Command sanitization failed: {e}")

    try:
        # asyncio.subprocess is already imported via `import asyncio`
        process = await asyncio.create_subprocess_shell(
            sanitized_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=os.getcwd(),
        )

        stdout, stderr = await process.communicate()  # Add timeout here if needed
        result_output = stdout.decode(errors="replace").strip()
        result_error = stderr.decode(errors="replace").strip()

        if result_output:
            final_output["output"] += result_output
        if result_error:
            final_output["error"] += result_error

        if process.returncode != 0:
            return ActionResult(
                extracted_content=f"Bash command failed with error code {process.returncode}.\nOutput:\n{final_output['output']}\nError:\n{final_output['error']}"
            )
        return ActionResult(
            extracted_content=f"Bash command executed successfully.\nOutput:\n{final_output['output']}"
            + (f"\nError (stderr, but exit code 0):\n{final_output['error']}" if final_output["error"] else "")
        )
    except Exception as e:
        return ActionResult(extracted_content=f"Error executing bash command: {e}")


async def main():
    system = """You are the best security researcher in the world tasked to solve any CTF given to you."""
    query = """Solve this CTF. The zip file is in Downloads folder called challenge.zip. Download ZIP archive password is: talk-tuah. Use the tools u have access to. U might have to use bash commands or something. Also you have to go to the website http://challenge.nahamcon.com:30972/ after this.
    
    This is the CTF context. 
    Guess what! You're the new Talk Tuah podcast producer!! Record, upload and manage guest episodes, and make sure the new podcast management site has its security in tip-top shape!
    """
    # query = input("Enter your query: ")

    # Assuming Agent is imported from browser_use
    # If Agent is defined in this file, ensure its definition is present.
    # For this example, I'll assume it's correctly imported or defined elsewhere.
    # from browser_use import Agent # Or wherever your Agent class is defined

    # Check if devtools_scripts directory and puppeteer exist, provide guidance if not
    if not os.path.isdir(DEVTOOLS_SCRIPTS_DIR):
        print(f"ERROR: The 'devtools_scripts' directory is missing at {DEVTOOLS_SCRIPTS_DIR}.")
        print("Please create it and place the .js DevTools scripts inside.")
        return
    if not os.path.exists(os.path.join(DEVTOOLS_SCRIPTS_DIR, "node_modules", "puppeteer")):
        print(f"WARNING: Puppeteer not found in {DEVTOOLS_SCRIPTS_DIR}/node_modules.")
        print(f"Please navigate to '{DEVTOOLS_SCRIPTS_DIR}' and run 'npm install puppeteer'.")
        print("DevTools actions might fail without Puppeteer installed there.")
    if not shutil.which(NODE_EXECUTABLE):  # Requires `import shutil`
        print(f"WARNING: Node.js executable '{NODE_EXECUTABLE}' not found in PATH.")
        print("DevTools actions will fail. Please install Node.js and ensure it's in your system PATH.")

    # Make sure your Agent class from browser_use is correctly defined and imported
    # For this example, I'll assume it's:
    from browser_use import Agent
    # If it's in the same file, then no import is needed.

    agent = Agent(
        extend_system_message=system,
        task=query,
        llm=llm,
        controller=controller,
        planner_llm=planner_llm,
        use_vision=True,  # Keep these if your Agent class supports them
        use_vision_for_planner=True,
        enable_memory=True,
    )

    await agent.run()


if __name__ == "__main__":
    import shutil  # For shutil.which check in main()

    asyncio.run(main())
