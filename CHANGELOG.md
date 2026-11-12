# Changelog

All notable changes to MCP Manager will be documented in this file.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/) and uses semantic versioning once release tags begin.

## Unreleased

### Added

- Release guide and versioned GitHub release note source files

## 0.5.0 - 2026-11-12

### Changed

- 界面整体重构：以「服务目录 + 详情检查器」作为唯一主工作台
- 移除重复的看板页和按智能体聚合的配置页
- 调试能力收进检查器里的调试抽屉
- 采用新的暖白 / 石墨 / 鼠尾草绿视觉系统

## 0.4.0 - 2026-11-11

### Added

- **Python projects can now be installed locally.** Pasting a Python MCP server repository URL installs it without leaving the app
  - The plan probes `pyproject.toml` first, then `setup.py`, and only falls back to `package.json` when the repo is not Python
  - The install creates an isolated `venv` next to the checkout and installs the project into it, so dependencies never leak into the system Python
  - Requires Python 3.10 or newer. If no suitable interpreter is found, `uv` is used to fetch one; if neither is available the plan says so instead of failing halfway
  - The entry point is resolved in order: `console_scripts`, then `python -m <module>`, then a top-level `server.py` / `main.py` / `app.py`
  - Python servers that depend on Playwright get `playwright install chromium` run for them. A browser download failure is reported but does not fail the install, because the server itself still starts

- **Repository metadata is now fetched over two routes in parallel.** `raw.githubusercontent.com` is unreachable on some networks while `api.github.com` still works, so file lookups race the raw URL against the GitHub contents API and use whichever answers first. Detection no longer stalls for the full timeout when the raw host is blocked

### Changed

- Release assets that are other languages' packages (`.whl`, `.pyz`, `.jar`, `.gem`, `.nupkg`, `.crate`) are never chosen as binaries, and a release that ships a `.whl` is treated as a Python project even when it also carries a `<name>-<version>.tar.gz`

### Notes

- Python installs cannot disable lifecycle scripts the way npm can. `pip install` always runs the project's own build backend, so executing code from the checkout is inherent to this path — the confirm dialog says so plainly rather than pretending otherwise
- Service names still come from the Git repository name, never from the console script or module name

## 0.3.2 - 2026-11-11

### Changed

- Product name is now **MCP Manager** (previously the short form `MCPM`). The rename covers the app bundle name, window title, tray tooltip, in-app labels, README, docs, and release assets
- Internal identifiers intentionally stay as-is: Cargo package `mcpm`, bundle identifier `com.yinhaowei.mcpm`, and the `~/.mcpm` data directory. Renaming these would orphan existing configs and app data
- The brand check now rejects the retired short name instead of the new one, so the two spellings cannot drift apart again

## 0.3.1 - 2026-11-11

### Changed

- Installed servers are always named after the Git repository, verbatim. No abbreviation, no `-mcp` suffix trimming, no first-word extraction. The name is the only handle a user has when searching their agent config later, so renaming it behind their back makes servers impossible to find
- The install confirm dialog shows the resulting server name before anything runs

### Fixed

- Servers installed from a repository were named after the generated launcher script (`run`) instead of the project, because name inference ran on the launcher path. Path-based inference now skips launcher filenames (`run`, `start`, `launch`, `bootstrap`, `entry`) and falls back to the containing directory
- Path-based inference no longer rewrites the last segment, so `…/Cc-Zzh1-moonvy-ui-mcp/run` resolves to `Cc-Zzh1-moonvy-ui-mcp`, not a trimmed variant

## 0.3.0 - 2026-11-10

### Added

- **Local install from a code repository URL.** A repo that is not published to npm can now be downloaded and turned into a working stdio entry without leaving the app
  - `plan_install` probes read-only and reports how it intends to install, plus the exact commands it will run — nothing is downloaded or executed during probing
  - `install_local` performs the install and streams progress over the `install:progress` event
  - Two install paths, ordered by safety: prebuilt GitHub Release assets first (download + sha256 verify + unpack, no script execution), source install second (`git clone --depth 1` + dependency install)
- Release asset matching scores each asset against the host OS and architecture and refuses to guess when several untagged assets are present, so it will not silently install a binary for the wrong platform
- Source install reads the entry from `package.json` `bin` first, then `main`, then conventional layouts (`src/server.js`, `dist/index.js`, …), and runs `build` only when the entry is missing
- Generated launcher script (`~/.mcpm/servers/<owner>-<repo>/run`) `cd`s into the install directory before exec. MCP stdio config has no `cwd` field, so this is what makes `.env`-based servers (dotenv reads `process.cwd()`) work
- Install assets are stripped of `com.apple.quarantine` on macOS after unpacking

### Changed

- Lifecycle scripts are disabled during source install (`--ignore-scripts`) by default. Turning them on is an explicit opt-in in the confirm dialog, because `postinstall` is arbitrary code execution
- Runtime PATH detection now discovers nvm version directories (newest first), fnm, asdf, and volta. GUI-launched apps only get `/usr/bin:/bin:/usr/sbin:/sbin`, so `node` from nvm used to be invisible

### Fixed

- Absolute paths in the server source field are no longer mistaken for npm package names in the icon hint

## 0.2.1 - 2026-11-10

### Added

- Code repository guard: `http(s)` input is probed before install. Repository URLs from GitHub, GitLab, Gitee, Bitbucket, and Codeberg are recognized as "not an MCP endpoint", so they are no longer silently written as dead remote entries
- When the repository publishes an npm package, the form offers a one-click switch to `npx` install. Detection reads the repo's `package.json` name first, then falls back to common MCP naming variants, and only trusts a guessed name when the npm package's `repository` field points back to the same repo
- `inspect_source` command plus a live, opt-in test (`cargo test -- --ignored`) covering published, unpublished, and real-endpoint cases

## 0.2.0 - 2026-11-10

### Added

- ZCode agent support (`~/.zcode/cli/config.json`, key `mcp.servers`)
- Qoder CN agent support (`~/.qoder-cn/mcp.json`)
- JSONC tolerant reading for JSON config files, so `opencode.jsonc` style files with comments and trailing commas are no longer treated as empty

### Fixed

- Qoder global config path now points to `~/.qoder/mcp.json` instead of `~/.qoder/settings.json`
- OpenCode global config now resolves `opencode.jsonc` when that file exists
- Project-level config detection for OpenCode also matches `opencode.jsonc`

## 0.1.0 - 2026-07-08

### Added

- Desktop MCP server management for global and project agent configs
- Registry search across the add-mcp registry and the official MCP registry
- Multi-agent install, remove, and sync workflows
- Dashboard status checks for remote servers and managed debug sessions
- Stdio server debugging with live logs, process metrics, and JSON-RPC input
- Runtime detection for Node.js, `npx`, Python, Bun, and `uvx`
- Bilingual Chinese and English UI
