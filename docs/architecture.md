# MCP Manager architecture

This document explains how MCP Manager turns one MCP server source into native agent configuration, registry installs, status checks, and debug sessions.

## Product shape

MCP Manager has a Tauri backend and a React frontend. React owns the visual workflow, stores UI state in Zustand, and calls backend commands through `src/lib/tauri.ts`. Rust owns agent detection, config transforms, file writes, registry queries, runtime detection, and managed child processes.

## Relationship to add-mcp

MCP Manager is based on the design of [neon-solutions/add-mcp](https://github.com/neon-solutions/add-mcp). The upstream project focuses on a command-line interface for adding, finding, listing, removing, and synchronizing MCP server configs. This project keeps the same core ideas:

- Parse one input source into a canonical server identity
- Declare each agent's config path, format, supported transports, and optional fields
- Transform a canonical MCP config into the native schema each agent expects
- Remove and synchronize servers by stable identity rather than display name
- Search registry-compatible server catalogs before installation

MCP Manager extends that foundation with a desktop UI, global and project install forms, a dashboard, live process logs, JSON-RPC debugging, runtime discovery, tray integration, and bilingual copy.

## Source parsing

`src-tauri/src/source/mod.rs` classifies user input as one of three source types:

- **Remote**: `http://` or `https://` URL, installed as streamable HTTP or SSE
- **Package**: npm-style package name, installed through `npx -y package_name`
- **Command**: command line or filesystem path, installed as stdio

The parser also infers a default server name from hostnames, package names, command arguments, or filenames. The inferred name can be overridden in the install form.

### Code repository guard

A repository page is not an MCP endpoint, so the form probes `http(s)` input before submitting (`commands/source.rs`, exposed as `inspect_source`):

1. `source::parse_code_repo_url` recognizes GitHub, GitLab, Gitee, Bitbucket, and Codeberg repository URLs. GitHub Pages style hosts are not treated as repositories.
2. For a repository, MCP Manager reads the repo's `package.json` name and looks it up on the npm registry.
3. If that miss, it tries common MCP naming variants (`repo`, `@owner/repo`, `repo-mcp`, `@owner/repo-mcp`, `mcp-server-repo`, `repo-mcp-server`). Guessed names are only accepted when the npm package's `repository` field points back to the same repo, so a same-name unrelated package cannot be suggested.
4. Hits are offered as a one-click switch to npm package install. Repositories without a published package fall through to local install (see below).

The probe is read-only: it never clones, installs, or executes anything.

### Local install from a repository

`commands/install.rs` turns a repository URL into a usable stdio entry, in two steps so the user sees what will happen before it happens:

1. `plan_install` — read-only. Reports the install method, target directory, and the exact commands that would run. It probes the GitHub Release API first, then `pyproject.toml`, then `setup.py`, then `package.json`.
2. `install_local` — performs the install and emits `install:progress` events.

Install methods, ordered by safety:

| Method | What runs | Guard |
| --- | --- | --- |
| Release asset | `tar` / `unzip` only | sha256 verified against the API `digest` field when present |
| Source | `git clone --depth 1`, then a package manager install | lifecycle scripts off by default (`--ignore-scripts`) |
| Python | `git clone --depth 1`, `python -m venv`, `pip install <checkout>` | none available — see below |

Release asset selection (`install/release.rs`) scores every asset against the host OS and architecture, rejects assets for other platforms outright, and returns "no usable asset" rather than guessing when several untagged assets exist. Assets that are another language's package (`.whl`, `.jar`, `.gem`, `.nupkg`, `.crate`) are scored out, and a release that ships a `.whl` is treated as a Python project even if it also attaches an sdist.

Python installs (`install/python.rs`) build a `venv` beside the checkout and never touch the system interpreter. The interpreter must be 3.10 or newer; `uv` can supply one when the machine has none. The entry point resolves as `console_scripts` first, then `python -m <module>`, then a top-level `server.py` / `main.py` / `app.py`.

The honest limitation: Python has no equivalent of npm's `--ignore-scripts`. `pip install` always invokes the project's build backend, so running code from the checkout is inherent to this path. The confirm dialog states this instead of implying it can be turned off.

Repository file lookups (`commands/source.rs`) race the `raw.githubusercontent.com` URL against the GitHub contents API and take whichever answers first. Some networks block the raw host while the API still works, and a sequential fallback would stall detection for the full timeout.

Everything lands in `~/.mcpm/servers/<owner>-<repo>/`:

```
app/    unpacked release, or the cloned repository
venv/   Python installs only
run     generated launcher script — this is the `command` written to agent configs
```

`run` exists because MCP stdio config has no `cwd` field, so the spawned process inherits the client's working directory. Servers that read `.env` via dotenv resolve it from `process.cwd()`, which would be wrong. The launcher `cd`s into the install directory before `exec`, which keeps absolute paths and relative assets working.

Note the directory choice: `~/.mcpm` rather than `~/Library/Application Support/MCP Manager`. The latter contains a space, and the `command` field is a single path that some clients re-tokenize.

## Agent model

`src-tauri/src/agent/definitions.rs` is the support matrix. Each agent definition includes:

- Agent id and display name
- Global config path
- Optional project config path
- Project detection paths
- Config key, including nested keys
- File format: JSON, YAML, or TOML
- Supported transports: stdio, HTTP, SSE
- Optional field support: timeout, OAuth scopes, auto-approval

The frontend reads this through `list_all_agents` and `get_agents_with_servers`, then shows installed and not-installed targets in the MCP management view.

## Config transforms

`src-tauri/src/agent/transform.rs` maps one canonical `McpServerConfig` into each agent's native shape. Most agents use a standard `{ command, args, env }` or `{ type, url, headers }` shape, but some need custom fields:

- Codex stores remote headers under `http_headers` and can write approval modes
- Goose uses `extensions` entries with `cmd`, `envs`, `uri`, and `enabled`
- Zed stores custom context servers under `context_servers`
- OpenCode stores local commands as an array and uses `environment`
- Kiro maps auto-approved tools to `autoApprove`
- GitHub Copilot CLI uses a different project schema under `.vscode/mcp.json`

Before writing, `apply_field_support` drops optional fields that a target agent does not support. The frontend shows those drops as warnings after installation.

## Config file IO

`src-tauri/src/format/` reads and writes JSON, YAML, and TOML without replacing unrelated config content. The utilities support nested keys such as `mcpServers`, `servers`, `mcp`, `extensions`, and `context_servers`.

Server identity comes from stable connection data. Remote servers use `url`, `uri`, or `serverUrl`. Stdio servers use package names for `npx`/`bunx`, or the command plus arguments for other commands. Sync uses that identity to group the same server across agents.

## Registry search

`src-tauri/src/registry/mod.rs` queries two registry-compatible sources:

- `https://add-mcp.com/registry/api/v1/servers`
- `https://registry.modelcontextprotocol.io/v0.1/servers`

Results are deduplicated by name and version, ranked by source quality and search relevance, then returned to the registry page. The install flow can prefill remote URL, headers, environment variables, runtime arguments, and package arguments from registry metadata.

## Process debugging

`src-tauri/src/process/manager.rs` manages stdio MCP server debug sessions. It starts child processes with an augmented runtime `PATH`, captures stdout and stderr, emits log events to the frontend, reports PID/uptime/CPU/memory, and can send JSON-RPC messages through stdin using the MCP `Content-Length` framing.

Remote servers do not need a managed process. The server catalog probes remote URLs with a short HTTP request and reports reachability.

## Frontend flow

The redesigned UI uses a three-part workbench:

- `src/pages/Servers.tsx`: the primary screen — a filterable server catalog plus a persistent inspector. The inspector shows health, source, scope, per-agent config paths, enable switches, removal, and the debug entry point.
- `src/pages/Registry.tsx`: registry search and install-prefill flow.
- `src/pages/Settings.tsx`: language, auto-start, runtime detection, and app information.
- `src/components/servers/AddServerDialog.tsx`: unified add flow for URLs, npm packages, local commands, and repository installs.
- `src/components/servers/DebugDrawer.tsx`: live logs, managed process controls, and JSON-RPC input, opened contextually from the inspector.

`src/stores/agentStore.ts`, `src/stores/serverStore.ts`, `src/stores/languageStore.ts`, and `src/stores/settingsStore.ts` keep the UI decoupled from direct Tauri calls. `src/lib/servers.ts` groups agent-scoped configs into a server-first view. When the app runs outside Tauri, `src/lib/demo.ts` provides demo data so the interface can be previewed in a browser.

## Trust boundaries

MCP Manager writes to user and project configuration files, starts local child processes during debugging, downloads and unpacks release archives, and can store headers or environment values in config files. Treat MCP server sources as executable integrations. Review generated configs, avoid committing secrets, and debug only servers you trust.

Local install adds one more surface: installing from source runs a package manager inside the cloned repository. MCP Manager disables lifecycle scripts by default, but `postinstall` remains arbitrary code execution when the user opts in, and even a plain dependency install materializes third-party code on disk. The confirm dialog lists the exact commands beforehand for that reason.
