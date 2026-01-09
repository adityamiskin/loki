# Loki

**Loki** is an AI-powered CTF (Capture The Flag) solver and security analysis assistant that combines the intelligence of Google's Gemini Flash model with a comprehensive suite of cybersecurity tools. Built with a modern terminal user interface (TUI), Loki helps security researchers, penetration testers, and CTF enthusiasts identify vulnerabilities, analyze code, and solve security challenges.

## Features

### 🤖 AI-Powered Analysis

- **Intelligent Security Analysis**: Leverages Google Gemini Flash to reason about vulnerabilities, attack vectors, and security flaws
- **Expert-Level Reasoning**: Trained to think like a world-class security analyst, identifying bugs, logic errors, and common CVE-like vulnerabilities
- **Interactive TUI**: Beautiful terminal interface built with React and OpenTUI for seamless interaction

### 🛠️ Comprehensive Tool Suite

Loki includes a powerful set of security tools organized into several categories:

#### 1. **Reconnaissance & OSINT**

- Subdomain enumeration (Amass)
- DNS interrogation (A, AAAA, MX, TXT, NS, SOA, CNAME records)
- WHOIS lookups
- Search engine dorking (Google, Bing, DuckDuckGo, Shodan, Censys)
- Certificate transparency search (crt.sh)
- Shodan and Censys integration

#### 2. **Scanning & Enumeration**

- Port scanning (Nmap, Masscan, RustScan)
- Web directory bruteforcing (Gobuster, ffuf)
- Web vulnerability scanning (OWASP ZAP)
- Network vulnerability scanning
- Service version detection

#### 3. **Exploitation**

- Metasploit Framework integration
- SQL injection exploitation (SQLMap)
- XSS fuzzing and testing
- Custom exploit module execution

#### 4. **Code Analysis**

- Static Application Security Testing (SAST) with Semgrep
- CodeQL analysis for multiple languages
- Secret discovery (Bandit, TruffleHog)
- Dependency vulnerability checking
- Source code security analysis

#### 5. **Local Shell Access**

- Execute shell commands directly
- File system exploration
- System information gathering
- Custom tool execution

## Installation

### Prerequisites

- [Bun](https://bun.sh) (JavaScript runtime)
- Node.js 18+ (if not using Bun)
- Python 3.8+ (for Python tools)
- Google API key for Gemini

### Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd ctf-solver
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Configure environment variables**

   Create a `.env` file in the root directory:

   ```bash
   GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here

   # Optional: For advanced features
   SHODAN_API_KEY=your_shodan_key
   CENSYS_UID=your_censys_uid
   CENSYS_SECRET=your_censys_secret
   MSF_USER=metasploit_user
   MSF_PASSWORD=metasploit_password
   ```

4. **Install Python dependencies** (for Python tools)
   ```bash
   pip install -r requirements.txt  # If available
   # Or install individually:
   pip install fastmcp dnspython python-whois requests shodan pymetasploit3 python-nmap
   ```

## Usage

### Starting Loki

```bash
bun dev
```

This will:

- Start the local chat API server on `http://localhost:3001`
- Launch the TUI interface
- Connect to Google Gemini Flash model

### Health & Diagnostics

- Query `GET /health` for a structured status payload that now includes log summaries, skill-loading insights, and helpful recovery notes.
- Use `GET /logs?level=info` to stream recent log entries when debugging issues reported by the diagnostics block.

### Using the Interface

- **Type your query**: Enter your security question, CTF challenge description, or analysis request
- **Press Enter**: Submit your message
- **Press ESC**: Stop the current operation or exit the application
- **Ctrl+C**: Exit the application

### Example Queries

- _"Analyze this code for SQL injection vulnerabilities: [code snippet]"_
- _"Perform a port scan on 192.168.1.100"_
- _"Enumerate subdomains for example.com"_
- _"Find secrets in this codebase: /path/to/code"_
- _"Help me solve this CTF challenge: [description]"_

### Skill Integration

- **Enable the feature** by setting `LOKI_SKILLS=true` before starting Loki.
- **Skill files** now live inside this repo under `skills/**/SKILL.md` by default, so you can keep your procedural knowledge versioned alongside Loki. Each file needs YAML front matter with `name` (≤100 chars) and `description` (≤500 chars); the body remains on disk until the skill is triggered.
- **Custom directories** are supported via `LOKI_SKILLS_DIR=/path/to/skills` if you want to relocate skills elsewhere.
- **Loki lists** each discovered skill in the runtime prompt so the agent can mention available helpers without loading their full bodies.
- **Invalid skill files** are skipped with a warning logged in the terminal; fix the front matter and restart to reload them.

## Architecture

Loki is built with:

- **Frontend**: React + OpenTUI for the terminal interface
- **Backend**: Bun HTTP server with AI SDK integration
- **AI Model**: Google Gemini Flash (via `@ai-sdk/google`)
- **Tools**: Modular tool system supporting both TypeScript and Python tools
- **Communication**: RESTful API for chat interactions

## Tool Integration

Loki uses a flexible tool system that allows the AI to:

1. **Execute shell commands** via the `local_shell` tool
2. **Call Python tools** for specialized security operations (recon, scanning, exploitation, analysis)
3. **Chain operations** together to perform complex security assessments

The AI automatically selects and uses the appropriate tools based on your queries.

## Security Considerations

⚠️ **Important**: Loki is designed for authorized security testing and educational purposes only.

- Only use Loki on systems you own or have explicit permission to test
- Be aware that some tools (port scanning, exploitation) may be illegal if used without authorization
- Always follow responsible disclosure practices
- Review and understand what commands Loki executes before running them

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## License

[Add your license here]

## Acknowledgments

- Built with [OpenTUI](https://github.com/opentui-org/opentui) for the terminal interface
- Powered by [Vercel AI SDK](https://sdk.vercel.ai/) and Google Gemini
- Inspired by the CTF and security research community

---

**Happy Hacking! 🚀**
