import asyncio
import nmap
from fastmcp import FastMCP, Context
from fastmcp.exceptions import ToolError
from typing import Annotated, Literal, Optional, List, Dict, Any
from pydantic import Field
import subprocess
import re

# --- II. Scanning & Enumeration (Active) ---
mcp_scan_enum = FastMCP(name="ScanningEnumerationTools", instructions="Tools for active network and service scanning.")

@mcp_scan_enum.tool()
async def port_scan(
    target_host: Annotated[str, Field(description="The IP address or hostname to scan.")],
    ctx: Context,
    ports: Annotated[Optional[str], Field(description="Comma-separated ports or port ranges.")] = None,
    scan_type: Annotated[Literal["SYN", "TCP Connect", "UDP"], Field(description="Type of port scan.")] = "SYN",
    include_version_info: Annotated[bool, Field(description="Attempt to determine service versions.")] = True
) -> Dict[str, Any]:
    await ctx.info(f"Starting {scan_type} port scan on {target_host}")
    nm = nmap.PortScanner()
    args = ''
    if include_version_info:
        args += ' -sV'
    if scan_type == 'SYN':
        args += ' -sT'
    elif scan_type == 'TCP Connect':
        args += ' -sT'
    elif scan_type == 'UDP':
        args += ' -sU'
    scan_args = args.strip()
    nm.scan(hosts=target_host, ports=ports or '1-1024', arguments=scan_args)
    ports_out = []
    for host in nm.all_hosts():
        for proto in nm[host].all_protocols():
            for port in nm[host][proto].keys():
                info = nm[host][proto][port]
                ports_out.append({
                    'port': port,
                    'protocol': proto,
                    'state': info['state'],
                    'service': info.get('name'),
                    'version': info.get('version')
                })
    return {"target": target_host, "ports": ports_out}

@mcp_scan_enum.tool()
async def web_directory_bruteforce(
    base_url: Annotated[str, Field(description="The base URL to search for directories/files.")],
    ctx: Context,
    wordlist_size: Annotated[Literal["small", "medium", "large"], Field(description="Size of the wordlist to use.")] = "medium",
    extensions: Annotated[Optional[str], Field(description="Comma-separated file extensions to test.")] = None
) -> Dict[str, Any]:
    await ctx.info(f"Starting directory bruteforce on {base_url}")
    wordlist = f"/usr/share/wordlists/dirbuster/{wordlist_size}.txt"
    cmd = ["gobuster", "dir", "-u", base_url, "-w", wordlist]
    if extensions:
        cmd += ['-x', extensions]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, _ = await proc.communicate()
    paths = [line.split()[0] for line in stdout.decode().splitlines() if line]
    return {"base_url": base_url, "discovered_paths": paths}

@mcp_scan_enum.tool()
async def web_vulnerability_scan(
    target_url: Annotated[str, Field(description="The target URL for web vulnerability scanning.")],
    ctx: Context,
    scan_profile: Annotated[Literal["passive", "light_active", "full_active", "intrusive"], Field(description="Aggressiveness of the scan.")] = "light_active",
    specific_tests: Annotated[Optional[str], Field(description="Comma-separated list of specific tests.")] = None
) -> Dict[str, Any]:
    await ctx.info(f"Starting web vulnerability scan on {target_url}")
    cmd = ["zap-cli", "quick-scan", target_url]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, _ = await proc.communicate()
    vulns = stdout.decode().splitlines()
    return {"target_url": target_url, "vulnerabilities": vulns}

@mcp_scan_enum.tool()
async def network_vulnerability_scan(
    target_spec: Annotated[str, Field(description="Target IP, hostname, or CIDR range.")],
    ctx: Context,
    scan_policy: Annotated[Literal["discovery", "full_scan", "cve_scan"], Field(description="Type of network scan policy.")] = "full_scan"
) -> Dict[str, Any]:
    await ctx.info(f"Starting network vulnerability scan on {target_spec}")
    # Example: queue OpenVAS task via ospd-openvas API
    return {"target_spec": target_spec, "status": "queued"}

@mcp_scan_enum.tool()
async def fast_port_discovery(
    target_host: Annotated[str, Field(description="The IP address or hostname to scan quickly.")],
    ctx: Context,
    ports: Annotated[Optional[str], Field(description="Comma-separated ports or ranges.")] = None,
    rate: Annotated[int, Field(description="Packets per second rate for masscan.", ge=1)] = 1000
) -> Dict[str, Any]:
    await ctx.info(f"Running masscan on {target_host} at rate {rate}")
    cmd = ["masscan", "-p", ports or "1-65535", target_host, "--rate", str(rate)]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, _ = await proc.communicate()
    discoveries = []
    for line in out.decode().splitlines():
        m = re.search(r"Discovered open port (\d+)/(tcp|udp) on (.+)", line)
        if m:
            discoveries.append({"port": int(m.group(1)), "protocol": m.group(2), "ip": m.group(3)})
    return {"target": target_host, "discoveries": discoveries}

@mcp_scan_enum.tool()
async def rustscan_scan(
    target_host: Annotated[str, Field(description="Target host for RustScan.")],
    ctx: Context,
    ports: Annotated[Optional[str], Field(description="Ports to scan.")] = None
) -> Dict[str, Any]:
    await ctx.info(f"Running RustScan on {target_host}")
    cmd = ["rustscan", "-a", target_host, "--", "-A", "-T4", "-p", ports or "1-65535"]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, _ = await proc.communicate()
    return {"target": target_host, "output": out.decode().splitlines()}

@mcp_scan_enum.tool()
async def web_fuzz(
    target_url: Annotated[str, Field(description="The base URL for fuzzing (use FUZZ marker).")],
    ctx: Context,
    wordlist: Annotated[str, Field(description="Path to wordlist for fuzzing.")] = "/usr/share/wordlists/raft-large-directories.txt",
    extensions: Annotated[Optional[str], Field(description="Comma-separated list of file extensions to test.")] = None
) -> Dict[str, Any]:
    await ctx.info(f"Running ffuf fuzzing on {target_url}")
    cmd = ["ffuf", "-u", f"{target_url}/FUZZ", "-w", wordlist]
    if extensions:
        cmd += ["-e", extensions]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, _ = await proc.communicate()
    fuzz_results = [line for line in out.decode().splitlines() if "=>" in line]
    return {"target_url": target_url, "fuzz_results": fuzz_results}

if __name__ == "__main__":
    print("Cybersecurity AI Scan service starting...")
    mcp_scan_enum.run(transport="stdio")