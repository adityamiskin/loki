import ast
import subprocess
import importlib

from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    name="PythonExecutor",
    instructions="A tool to execute python code.",
)


def auto_install_deps(source_code: str):
    """
    Parses the given Python source, finds all top-level imports, and
    auto-installs missing packages via `uv pip install`.
    """
    tree = ast.parse(source_code)
    candidates = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                candidates.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            candidates.add(node.module.split(".")[0])

    for pkg in candidates:
        try:
            importlib.import_module(pkg)
        except ImportError:
            subprocess.check_call(["uv", "pip", "install", pkg])


@mcp.tool()
def execute_python(code: str) -> str:
    """
    Executes the given Python code, auto-installing missing dependencies via `uv pip install`,
    and returns the output.
    """
    try:
        auto_install_deps(code)
        exec(code)
        return "Code executed successfully"
    except Exception as e:
        return f"Error: {e}"


if __name__ == "__main__":
    mcp.run()
