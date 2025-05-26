# generic_linux_command_tool.py

import shlex  # For safely splitting command strings
import os
import subprocess
from typing import Annotated, Any, Dict, Optional

from fastmcp import Context, FastMCP
from fastmcp.exceptions import ToolError
from pydantic import Field

import asyncio

# --- Generic Linux Command Execution Tool ---
mcp_linux_cmd = FastMCP(
    name="LinuxCommandExecutor",
    instructions="A tool to execute Linux shell commands. Use with extreme caution.",
)


@mcp_linux_cmd.tool()
async def execute_linux_command(
    command: Annotated[
        str,
        Field(
            description="The Linux command string to execute (e.g., 'ls -la /tmp', 'cat /proc/version')."
        ),
    ],
    ctx: Context,
    working_directory: Annotated[
        Optional[str],
        Field(
            description="The directory in which to execute the command. Defaults to the server's current directory."
        ),
    ] = None,
    timeout_seconds: Annotated[
        int,
        Field(
            description="Maximum time in seconds to wait for the command to complete.",
            ge=1,
            le=300,
        ),
    ] = 60,
) -> Dict[str, Any]:
    """
    Executes a given Linux command string and returns its output.

    **SECURITY WARNING:** This tool allows arbitrary command execution.
    It should ONLY be used in a tightly controlled, sandboxed environment
    and with careful validation of the commands being executed.
    Misuse can lead to severe security vulnerabilities and system compromise.

    Returns a dictionary containing:
    - 'command': The command that was executed.
    - 'return_code': The exit code of the command.
    - 'stdout': The standard output of the command.
    - 'stderr': The standard error of the command.
    - 'timed_out': Boolean indicating if the command timed out.
    - 'error': Any error message if the tool itself failed (not command stderr).
    """
    await ctx.info(
        f"Attempting to execute Linux command: '{command}' with timeout {timeout_seconds}s"
    )
    if working_directory:
        await ctx.info(f"Working directory: {working_directory}")

    try:
        # Safely split the command string into a list of arguments
        # and expand any leading '~' to the user's home directory.
        cmd_parts = shlex.split(command)
        # Expand '~' or '~/...' style paths in ALL arguments, but only for standalone ~ or those starting with ~/, not ones in the middle of a word
        def expand_part(part):
            if part.startswith("~/") or part == "~":
                return os.path.expanduser(part)
            return part
        cmd_parts = [expand_part(part) for part in cmd_parts]
        if not cmd_parts:
            raise ToolError("Command string cannot be empty.")

        process = await asyncio.to_thread(
            subprocess.run,
            cmd_parts,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            cwd=working_directory,  # None is acceptable for subprocess.run
            check=False,  # Do not raise exception for non-zero exit codes
        )

        stdout = process.stdout.strip()
        stderr = process.stderr.strip()
        return_code = process.returncode
        timed_out = False

        log_message = f"Command '{command}' executed. RC: {return_code}."
        if stdout:
            log_message += f"\nSTDOUT:\n{stdout[:500]}{'...' if len(stdout) > 500 else ''}"  # Log snippet
        if stderr:
            log_message += f"\nSTDERR:\n{stderr[:500]}{'...' if len(stderr) > 500 else ''}"  # Log snippet
        await ctx.info(log_message)

        return {
            "command": command,
            "return_code": return_code,
            "stdout": stdout,
            "stderr": stderr,
            "timed_out": timed_out,
            "error": None,
        }

    except subprocess.TimeoutExpired:
        await ctx.warning(
            f"Command '{command}' timed out after {timeout_seconds} seconds."
        )
        return {
            "command": command,
            "return_code": None,  # No return code if timed out before completion
            "stdout": "",
            "stderr": f"Command timed out after {timeout_seconds} seconds.",
            "timed_out": True,
            "error": None,
        }
    except FileNotFoundError:
        await ctx.error(f"Command not found: {cmd_parts[0] if cmd_parts else command}")
        raise ToolError(
            f"Command or one of its components not found: {cmd_parts[0] if cmd_parts else command}"
        )
    except Exception as e:
        await ctx.error(f"Error executing command '{command}': {str(e)}")
        # For unexpected errors in the tool logic itself, raise ToolError
        raise ToolError(
            f"An unexpected error occurred while trying to execute the command: {str(e)}"
        )


if __name__ == "__main__":
    print("Starting Generic Linux Command Executor FastMCP Server...")
    print("WARNING: This tool is powerful and can be dangerous. Use responsibly.")
    mcp_linux_cmd.run(transport="stdio")
    # Example command to test with httpie or curl after running:
    # http POST http://127.0.0.1:8009/call tool_name=execute_linux_command payload:='{"command": "ls -la /tmp", "timeout_seconds": 10}'
    # http POST http://127.0.0.1:8009/call tool_name=execute_linux_command payload:='{"command": "echo \"Hello from FastMCP\" > /tmp/fastmcp_test.txt && cat /tmp/fastmcp_test.txt"}'
    # http POST http://127.0.0.1:8009/call tool_name=execute_linux_command payload:='{"command": "whoami"}'
