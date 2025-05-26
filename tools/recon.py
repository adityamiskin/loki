import asyncio
import dns.resolver
import whois as whois_lib
import requests
import os
import json
from shodan import Shodan
from fastmcp import FastMCP, Context
from fastmcp.exceptions import ToolError
from typing import Annotated, Literal, Optional, List, Dict, Any
from pydantic import Field

# --- I. Reconnaissance & Information Gathering (OSINT) ---
mcp_recon = FastMCP(name="ReconnaissanceTools", instructions="Tools for OSINT and information gathering.")

@mcp_recon.tool()
async def subdomain_enumeration(
    target_domain: Annotated[str, Field(description="The primary domain to enumerate subdomains for (e.g., example.com).")],
    ctx: Context
) -> Dict[str, Any]:
    await ctx.info(f"Starting subdomain enumeration for {target_domain}")
    errors = []
    try:
        proc = await asyncio.create_subprocess_exec(
            'amass', 'enum', '-d', target_domain,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            errors.append(stderr.decode().strip())
        subdomains = list(set(stdout.decode().splitlines()))
    except FileNotFoundError:
        subdomains = []
        errors.append("Amass not installed or not in PATH.")
    await ctx.report_progress(progress=1.0, message="Enumeration complete.")
    return {"target_domain": target_domain, "subdomains": subdomains, "errors": errors}

@mcp_recon.tool()
async def dns_interrogation(
    domain: Annotated[str, Field(description="The domain to query DNS records for.")],
    ctx: Context,
    record_type: Annotated[Literal["A", "AAAA", "MX", "TXT", "NS", "SOA", "CNAME", "ANY"], Field(description="The type of DNS record to query.")] = "ANY"
) -> Dict[str, Any]:
    await ctx.info(f"Querying DNS {record_type} records for {domain}")
    resolver = dns.resolver.Resolver()
    records = {}
    types = [record_type] if record_type != "ANY" else ["A","AAAA","MX","TXT","NS","SOA","CNAME"]
    for rtype in types:
        try:
            answer = resolver.resolve(domain, rtype)
            records[rtype] = [r.to_text() for r in answer]
        except Exception:
            records[rtype] = []
    return {"domain": domain, "record_type": record_type, "records": records}

@mcp_recon.tool()
async def whois_lookup(
    query: Annotated[str, Field(description="The domain name or IP address for WHOIS lookup.")],
    ctx: Context
) -> Dict[str, Any]:
    await ctx.info(f"Performing WHOIS lookup for {query}")
    try:
        w = whois_lib.whois(query)
        data = w.__dict__
    except Exception as e:
        data = {"error": str(e)}
    return {"query": query, "whois_data": data}

@mcp_recon.tool()
async def search_engine_dorking(
    dork_query: Annotated[str, Field(description="The search engine dork (e.g., 'site:example.com filetype:pdf admin').")],
    ctx: Context,
    search_engine: Annotated[Literal["google", "bing", "duckduckgo", "shodan", "censys"], Field(description="The search engine to use.")] = "google",
    max_results: Annotated[int, Field(description="Maximum number of results to retrieve.", ge=1, le=100)] = 10
) -> Dict[str, Any]:
    await ctx.info(f"Executing dork '{dork_query}' on {search_engine}")
    results = []
    if search_engine == "google":
        params = {"q": dork_query, "num": max_results}
        headers = {'User-Agent': 'Mozilla/5.0'}
        resp = requests.get('https://www.google.com/search', params=params, headers=headers)
        # crude parse
        results = [resp.url]
    return {"dork_query": dork_query, "search_engine": search_engine, "results": results}
@mcp_recon.tool()
async def shodan_search(
    query: Annotated[str, Field(description="Search query for Shodan.")],
    ctx: Context,
    max_results: Annotated[int, Field(description="Maximum number of results to return.", ge=1)] = 10
) -> Dict[str, Any]:
    await ctx.info(f"Searching Shodan for {query}")
    key = os.getenv("SHODAN_API_KEY")
    if not key:
        return {"error": "SHODAN_API_KEY not set"}
    api = Shodan(key)
    res = api.search(query, limit=max_results)
    return {"query": query, "total": res.get("total"), "matches": res.get("matches", [])}

@mcp_recon.tool()
async def censys_search(
    query: Annotated[str, Field(description="Search query for Censys.")],
    ctx: Context,
    max_results: Annotated[int, Field(description="Maximum number of results to return.", ge=1)] = 10
) -> Dict[str, Any]:
    await ctx.info(f"Searching Censys for {query}")
    uid = os.getenv("CENSYS_UID")
    secret = os.getenv("CENSYS_SECRET")
    if not uid or not secret:
        return {"error": "CENSYS credentials not set"}
    url = "https://censys.io/api/v1/search/hosts"
    payload = {"query": query, "per_page": max_results}
    resp = requests.post(url, json=payload, auth=(uid, secret))
    try:
        data = resp.json()
    except Exception:
        data = resp.text
    return {"query": query, "results": data}

@mcp_recon.tool()
async def crt_sh_lookup(
    domain: Annotated[str, Field(description="Domain for CRT.sh certificate search (e.g., example.com).")],
    ctx: Context
) -> Dict[str, Any]:
    await ctx.info(f"Querying crt.sh for {domain}")
    url = f"https://crt.sh/?q=%25.{domain}&output=json"
    resp = requests.get(url)
    try:
        entries = resp.json()
    except Exception:
        entries = resp.text
    return {"domain": domain, "entries": entries}

if __name__ == "__main__":
    print("Cybersecurity AI Recon service starting...")
    mcp_recon.run(transport="stdio")
