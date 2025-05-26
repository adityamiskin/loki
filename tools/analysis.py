import asyncio
import json
from fastmcp import FastMCP, Context
from fastmcp.exceptions import ToolError
from typing import Annotated, Literal, Optional, List, Dict, Any
from pydantic import Field
import subprocess
import os

# --- V. Analysis & Reporting ---
mcp_analysis = FastMCP(name="AnalysisReportingTools", instructions="Tools for analyzing collected data and generating reports.")

@mcp_analysis.tool()
async def analyze_source_code(
    code_path_or_url: Annotated[str, Field(description="Path or URL to source code.")],
    ctx: Context,
    language: Annotated[Optional[str], Field(description="Programming language.")]=None,
    analysis_type: Annotated[Literal["sast_full", "sast_lightweight", "dependency_check"], Field(description="Type of static analysis.")]="sast_lightweight"
) -> Dict[str, Any]:
    await ctx.info(f"Starting {analysis_type} on {code_path_or_url}")
    findings = []
    if analysis_type.startswith('sast'):
        cmd = ['semgrep', '-q', '-f', language or 'p/ci', code_path_or_url]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE)
        out,_ = await proc.communicate()
        findings = out.decode().splitlines()
    elif analysis_type=='dependency_check':
        cmd = ['safety', 'check', '--json']
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE)
        out,_ = await proc.communicate()
        findings = json.loads(out.decode())
    return {"source": code_path_or_url, "findings": findings}

@mcp_analysis.tool()
async def codeql_scan(
    code_path: Annotated[str, Field(description="Path to source code for CodeQL analysis.")],
    ctx: Context,
    language: Annotated[Literal["csharp","cpp","go","java","javascript","python"], Field(description="Language for CodeQL analysis.")] = "python",
    database_name: Annotated[str, Field(description="Name of the CodeQL database to create.")] = "codeql-db"
) -> Dict[str, Any]:
    await ctx.info(f"Creating CodeQL database '{database_name}' for language {language}")
    proc = await asyncio.create_subprocess_exec(
        "codeql", "database", "create", database_name, "--language=" + language, "--source-root", code_path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise ToolError(f"CodeQL database creation failed: {err.decode().strip()}")
    await ctx.info("Analyzing CodeQL database")
    proc = await asyncio.create_subprocess_exec(
        "codeql", "database", "analyze", database_name, "security-and-quality.qls", "--format=json", "--output", "codeql-results.json",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise ToolError(f"CodeQL analysis failed: {err.decode().strip()}")
    try:
        with open("codeql-results.json") as f:
            results = json.load(f)
    except Exception as e:
        raise ToolError(f"Failed to read CodeQL results: {str(e)}")
    return {"database": database_name, "results": results}

@mcp_analysis.tool()
async def secret_discovery(
    code_path_or_url: Annotated[str, Field(description="Path or URL to codebase for secret discovery.")],
    ctx: Context
) -> Dict[str, Any]:
    await ctx.info(f"Running secret discovery on {code_path_or_url}")
    findings: Dict[str, Any] = {}
    proc = await asyncio.create_subprocess_exec(
        "bandit", "-r", code_path_or_url, "-f", "json",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    out, err = await proc.communicate()
    if proc.returncode == 0:
        try:
            findings["bandit"] = json.loads(out.decode())
        except Exception:
            findings["bandit"] = out.decode().splitlines()
    else:
        findings["bandit_error"] = err.decode().strip()
    proc = await asyncio.create_subprocess_exec(
        "trufflehog", "filesystem", "--json", code_path_or_url,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    out, err = await proc.communicate()
    if proc.returncode == 0:
        try:
            findings["trufflehog"] = json.loads(out.decode())
        except Exception:
            findings["trufflehog"] = out.decode().splitlines()
    else:
        findings["trufflehog_error"] = err.decode().strip()
    return {"path": code_path_or_url, "findings": findings}

@mcp_analysis.tool()
async def correlate_findings(
    assessment_id: Annotated[str, Field(description="Identifier for the current assessment.")],
    ctx: Context
) -> Dict[str, Any]:
    await ctx.info(f"Correlating findings for {assessment_id}")
    # Placeholder correlation logic
    correlated = [{"name": "Chained RCE->DB Drop", "severity": "Critical"}]
    return {"assessment_id": assessment_id, "correlated_risks": correlated}

@mcp_analysis.tool()
async def generate_vulnerability_report(
    assessment_id: Annotated[str, Field(description="Identifier for the assessment.")],
    ctx: Context,
    output_format: Annotated[Literal["json", "markdown", "html_summary"], Field(description="Report format.")]="json",
    include_remediation_advice: Annotated[bool, Field(description="Include remediation advice.")]=True
) -> Dict[str, Any]:
    await ctx.info(f"Generating {output_format} report for {assessment_id}")
    # Fetch findings (stub)
    summary = {"critical": 2, "high": 5, "medium": 10}
    if output_format=='json':
        report = {"assessment_id": assessment_id, "summary": summary}
        if include_remediation_advice:
            report['remediation'] = "Apply recommended patches and configuration changes."
        return {"format": output_format, "report_data": report}
    elif output_format=='markdown':
        md = f"# Report {assessment_id}\n\nSummary:\n- Critical: {summary['critical']}\n- High: {summary['high']}\n- Medium: {summary['medium']}"
        if include_remediation_advice:
            md += "\n\n**Remediation:** Apply patches."
        return {"format": output_format, "report_content": md}
    return {"format": output_format, "error": "Unsupported format"}

# --- VI. Orchestration & Management ---
mcp_orchestration = FastMCP(name="OrchestrationTools", instructions="Tools for managing and orchestrating security tasks.")

@mcp_orchestration.tool()
async def start_full_assessment(
    target_scope_description: Annotated[str, Field(description="Description of the target scope.")],
    assessment_name: Annotated[str, Field(description="A unique name for this assessment.")],
    ctx: Context,
    profile: Annotated[Literal["quick_recon", "web_deep_dive", "full_infrastructure_pentest"], Field(description="Predefined assessment profile.")]="web_deep_dive"
) -> Dict[str, Any]:
    await ctx.info(f"Starting full assessment '{assessment_name}' for {target_scope_description}")
    assessment_id = f"ASMT_{assessment_name.replace(' ', '_').upper()}_{profile.upper()}"
    # Kick off recon then scanning asynchronously
    asyncio.create_task(ctx.client.call_tool('ReconnaissanceTools.subdomain_enumeration', {'target_domain': target_scope_description}))
    return {"assessment_id": assessment_id, "status": "initiated", "profile": profile}

@mcp_orchestration.tool()
async def get_assessment_status(
    assessment_id: Annotated[str, Field(description="The ID of the assessment to check.")],
    ctx: Context
) -> Dict[str, Any]:
    await ctx.info(f"Fetching status for assessment {assessment_id}")
    # Stub: real implementation would track tasks and results
    status = {"assessment_id": assessment_id, "status": "in_progress", "progress": 50}
    return status

if __name__ == "__main__":
    print("Cybersecurity AI Analysis service starting...")
    mcp_analysis.run(transport="stdio")
