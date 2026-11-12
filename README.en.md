# MCP Manager

**A visual control center for MCP servers across AI coding agents.**

[中文](README.md) · [Architecture](docs/architecture.md) · [Supported agents](docs/supported-agents.md) · [Contributing](CONTRIBUTING.md)

MCP servers are powerful, but their configuration is scattered across editors, CLIs, desktop apps, global files and project files. MCP Manager brings those fragments into one desktop app: install, inspect, sync and debug MCP servers without memorizing each agent's config format.

Version 0.5 is a full interface redesign with a tighter information architecture:

- A single **server catalog + inspector** workbench
- The duplicated dashboard and agent-first config pages are gone
- Debugging moved into a contextual drawer inside the inspector
- A new warm ivory / graphite / sage visual system

## What you can do

### Add once, write to many agents

Add a server from a remote URL, an npm package, a local command or a local path. Choose global or project scope, select the target agents, and MCP Manager writes JSON, YAML or TOML in each agent's native format.

### Read the catalog and live health

The main screen is server-first: search, filter by transport / status / scope, and see which agents receive each server. The inspector shows runtime status, CPU and memory, the source, config paths, and a per-agent toggle list.

- Remote servers report reachability from a short HTTP probe
- Local stdio servers report PID, uptime and resource usage
- Configs can be written for agents that are not installed yet

### Discover through registries

Search the add-mcp and official MCP registries inside the app. Metadata can prefill remote URLs, package names, headers, environment variables and runtime arguments.

### Install straight from a repository

Paste a GitHub / GitLab / Gitee URL and MCP Manager determines how it can be installed, showing the exact commands before running anything. Prebuilt release assets are preferred (download, sha256 verification, unpack — no scripts). When no release exists it falls back to a source install (shallow clone + dependency install, postinstall disabled by default). Python projects get their own virtual environment.

### Debug stdio servers

Open the debug drawer from the inspector to start a managed stdio process, stream stdout / stderr, watch CPU and memory, and send JSON-RPC messages.

### Bilingual by default

Chinese is the default language, with an English switch in the sidebar. The choice is remembered.

## Getting started

Install pnpm, Rust and the Tauri system dependencies first.

```bash
pnpm install
pnpm tauri dev
```

Build the desktop app:

```bash
pnpm tauri build
```

Before submitting changes:

```bash
pnpm run typecheck
pnpm run build
cd src-tauri && cargo test
```

> `pnpm dev` alone previews the interface in a browser. Outside Tauri the app uses demo data and never reads or writes your local configs.

## Supported agents

28 agent targets are supported, including Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI, VS Code, Claude Desktop, Cline, Goose, Kiro, OpenCode, Windsurf, Zed, DeepSeek Harness, TRAE, Qoder, Kimi Code and WorkBuddy.

See [docs/supported-agents.md](docs/supported-agents.md) for config paths, project-level support, transports and optional fields.

## Documentation

- [Architecture](docs/architecture.md): source parsing, agent transforms, registry flow, process debugging and the new frontend structure
- [Supported agents](docs/supported-agents.md): config paths, transports, project-level config and optional fields
- [Release guide](docs/release.md): packaging, GitHub CLI commands and release notes
- [Contributing](CONTRIBUTING.md): development setup and checks
- [Security](SECURITY.md): config writes, command execution and sensitive data
- [Changelog](CHANGELOG.md)

## Security boundaries

MCP Manager writes to local agent config files, can start local stdio server commands during debugging, and can download and install servers from source repositories. Review generated project configs before committing them, never put secrets in shared configs, and only run MCP servers you trust. Python projects are especially sensitive: `pip install` runs the repository's own build backend, so only install repositories you trust.

## Tech stack

Tauri 2, React 19, TypeScript, Zustand, Tailwind CSS 4, Vite, Rust, Tokio and reqwest.

## License

[MIT License](LICENSE)
