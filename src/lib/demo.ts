// 浏览器预览用的演示数据：在没有 Tauri 运行时也能完整体验界面
import type {
  AddServerRequest,
  AddServerResult,
  AgentInfo,
  AgentWithServers,
  InstalledServer,
  LogPayload,
  RegistryServerEntry,
  RemoveResult,
  RemoveServerRequest,
  RepoProbe,
  RuntimeInfo,
  Scope,
  ServerProbe,
  ServerStatus,
} from "./types";

const HOME = "/Users/zhufeng";

interface DemoAgent extends AgentInfo {
  detected: boolean;
}

const agents: DemoAgent[] = [
  {
    agentType: "cursor",
    displayName: "Cursor",
    detected: true,
    supportsProject: true,
    supportedTransports: ["http", "sse", "stdio"],
    configPath: `${HOME}/.cursor/mcp.json`,
    localConfigPath: ".cursor/mcp.json",
  },
  {
    agentType: "claude-code",
    displayName: "Claude Code",
    detected: true,
    supportsProject: true,
    supportedTransports: ["http", "sse", "stdio"],
    configPath: `${HOME}/.claude.json`,
    localConfigPath: ".mcp.json",
  },
  {
    agentType: "claude-desktop",
    displayName: "Claude Desktop",
    detected: true,
    supportsProject: false,
    supportedTransports: ["stdio"],
    configPath: `${HOME}/Library/Application Support/Claude/claude_desktop_config.json`,
  },
  {
    agentType: "codex",
    displayName: "Codex",
    detected: true,
    supportsProject: true,
    supportedTransports: ["http", "stdio"],
    configPath: `${HOME}/.codex/config.toml`,
    localConfigPath: ".codex/config.toml",
  },
  {
    agentType: "vscode",
    displayName: "VS Code",
    detected: true,
    supportsProject: true,
    supportedTransports: ["http", "sse", "stdio"],
    configPath: `${HOME}/Library/Application Support/Code/User/mcp.json`,
    localConfigPath: ".vscode/mcp.json",
  },
  {
    agentType: "cline",
    displayName: "Cline",
    detected: true,
    supportsProject: false,
    supportedTransports: ["stdio", "sse"],
    configPath: `${HOME}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`,
  },
  {
    agentType: "trae-cn",
    displayName: "TRAE CN",
    detected: true,
    supportsProject: true,
    supportedTransports: ["stdio", "sse"],
    configPath: `${HOME}/Library/Application Support/Trae CN/User/mcp.json`,
    localConfigPath: ".trae/mcp.json",
  },
  {
    agentType: "zed",
    displayName: "Zed",
    detected: true,
    supportsProject: true,
    supportedTransports: ["stdio"],
    configPath: `${HOME}/.config/zed/settings.json`,
    localConfigPath: ".zed/settings.json",
  },
  {
    agentType: "deepseek-harness",
    displayName: "DeepSeek Harness",
    detected: true,
    supportsProject: false,
    supportedTransports: ["stdio", "http"],
    configPath: `${HOME}/.dsh/profiles/desktop/cordis.patch.yml`,
  },
  {
    agentType: "gemini-cli",
    displayName: "Gemini CLI",
    detected: false,
    supportsProject: true,
    supportedTransports: ["stdio", "sse"],
    configPath: `${HOME}/.gemini/settings.json`,
  },
  {
    agentType: "windsurf",
    displayName: "Windsurf",
    detected: false,
    supportsProject: false,
    supportedTransports: ["stdio", "sse"],
    configPath: `${HOME}/.codeium/windsurf/mcp_config.json`,
  },
  {
    agentType: "kimi-code",
    displayName: "Kimi Code",
    detected: false,
    supportsProject: false,
    supportedTransports: ["stdio"],
    configPath: `${HOME}/.kimi/mcp.json`,
  },
  {
    agentType: "opencode",
    displayName: "OpenCode",
    detected: false,
    supportsProject: true,
    supportedTransports: ["stdio", "http"],
    configPath: `${HOME}/.config/opencode/opencode.json`,
  },
  {
    agentType: "qoder",
    displayName: "Qoder",
    detected: false,
    supportsProject: false,
    supportedTransports: ["stdio", "sse"],
    configPath: `${HOME}/.qoder/mcp.json`,
  },
  {
    agentType: "antigravity",
    displayName: "Antigravity",
    detected: false,
    supportsProject: false,
    supportedTransports: ["stdio"],
    configPath: `${HOME}/.antigravity/mcp.json`,
  },
];

const serverSources: Record<string, Record<string, unknown>> = {
  "github-mcp-server": {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_••••••••••••" },
  },
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", `${HOME}/Projects`],
  },
  linear: {
    type: "sse",
    url: "https://mcp.linear.app/sse",
  },
  "postgres-dev": {
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://localhost:5432/atlas",
    ],
  },
  notion: {
    type: "http",
    url: "https://mcp.notion.com/mcp",
    headers: { Authorization: "Bearer ntn_••••••••" },
  },
  sentry: {
    type: "http",
    url: "https://mcp.sentry.dev/mcp",
  },
  "echo-utils": {
    command: "uvx",
    args: ["mcp-server-echo-utils"],
  },
};

interface DemoBinding {
  server: string;
  agent: string;
  scope: Scope;
}

const bindings: DemoBinding[] = [
  { server: "github-mcp-server", agent: "cursor", scope: "global" },
  { server: "github-mcp-server", agent: "claude-code", scope: "global" },
  { server: "github-mcp-server", agent: "codex", scope: "local" },
  { server: "github-mcp-server", agent: "cline", scope: "global" },
  { server: "github-mcp-server", agent: "windsurf", scope: "global" },
  { server: "filesystem", agent: "cursor", scope: "global" },
  { server: "filesystem", agent: "vscode", scope: "global" },
  { server: "filesystem", agent: "trae-cn", scope: "global" },
  { server: "linear", agent: "claude-desktop", scope: "global" },
  { server: "linear", agent: "cursor", scope: "global" },
  { server: "postgres-dev", agent: "codex", scope: "local" },
  { server: "postgres-dev", agent: "claude-code", scope: "local" },
  { server: "notion", agent: "claude-desktop", scope: "global" },
  { server: "notion", agent: "cursor", scope: "global" },
  { server: "notion", agent: "vscode", scope: "global" },
  { server: "notion", agent: "trae-cn", scope: "global" },
  { server: "sentry", agent: "claude-code", scope: "global" },
  { server: "echo-utils", agent: "zed", scope: "global" },
];

const PROJECT_DIR = `${HOME}/Projects/atlas`;

function buildAgentsWithServers(): AgentWithServers[] {
  return agents.map((agent) => {
    const ownBindings = bindings.filter((binding) => binding.agent === agent.agentType);
    const toInstalled = (binding: DemoBinding): InstalledServer => ({
      serverName: binding.server,
      config: structuredClone(serverSources[binding.server] ?? {}),
      identity: `${binding.server}@${binding.agent}:${binding.scope}`,
      agentType: binding.agent,
      scope: binding.scope,
      configPath:
        binding.scope === "global"
          ? agent.configPath
          : `${PROJECT_DIR}/${agent.localConfigPath ?? ".mcp.json"}`,
    });

    return {
      agentType: agent.agentType,
      displayName: agent.displayName,
      detected: agent.detected,
      configPath: agent.configPath,
      localConfigPath: agent.localConfigPath,
      supportsProject: agent.supportsProject,
      globalServers: ownBindings.filter((b) => b.scope === "global").map(toInstalled),
      localServers: ownBindings.filter((b) => b.scope === "local").map(toInstalled),
    };
  });
}

const demoAgentsWithServers = buildAgentsWithServers();

interface RunningDemo {
  pid: number;
  uptime: number;
  cpu: number;
  memory: number;
}

const running: Record<string, RunningDemo> = {
  "github-mcp-server": { pid: 49210, uptime: 51222, cpu: 0.4, memory: 38.2 },
  filesystem: { pid: 49322, uptime: 3410, cpu: 0.1, memory: 22.8 },
};

const remoteHealth: Record<string, { ok: boolean; detail: string }> = {
  linear: { ok: true, detail: "HTTP 200 · 38ms" },
  notion: { ok: true, detail: "HTTP 200 · 116ms" },
  sentry: { ok: false, detail: "HTTP 502 · 840ms" },
};

const registryEntries: RegistryServerEntry[] = [
  {
    name: "io.github.github/github-mcp-server",
    title: "GitHub",
    description:
      "Repository, issue, pull request and code search tools for GitHub — official MCP server maintained by GitHub.",
    version: "0.6.2",
    repositoryUrl: "https://github.com/github/github-mcp-server",
    package: {
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-github",
      runtimeArguments: ["-y"],
      environmentVariables: {
        GITHUB_PERSONAL_ACCESS_TOKEN: {
          description: "Personal access token with repo scope",
          isRequired: true,
          isSecret: true,
        },
      },
    },
  },
  {
    name: "io.modelcontextprotocol/filesystem",
    title: "Filesystem",
    description:
      "Read, write and search files inside directories you explicitly allow. Useful for giving an agent project context.",
    version: "2025.8.1",
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    package: {
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-filesystem",
      runtimeArguments: ["-y"],
    },
  },
  {
    name: "io.modelcontextprotocol/postgres",
    title: "PostgreSQL",
    description:
      "Inspect schemas and run read-only queries against a PostgreSQL database with a connection string.",
    version: "0.6.2",
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    package: {
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-postgres",
      runtimeArguments: ["-y"],
    },
  },
  {
    name: "com.notion/mcp",
    title: "Notion",
    description:
      "Search pages, read databases and create content in your Notion workspace through the hosted MCP endpoint.",
    version: "1.4.0",
    repositoryUrl: "https://developers.notion.com/docs/mcp",
    remotes: [{ type: "streamable-http", url: "https://mcp.notion.com/mcp" }],
  },
  {
    name: "com.linear/mcp",
    title: "Linear",
    description:
      "Create and update issues, browse projects and query team cycles from Linear over a remote SSE endpoint.",
    version: "0.9.3",
    repositoryUrl: "https://linear.app/docs/mcp",
    remotes: [{ type: "sse", url: "https://mcp.linear.app/sse" }],
  },
  {
    name: "io.sentry/mcp",
    title: "Sentry",
    description:
      "Investigate errors, releases and performance issues in Sentry without leaving your editor.",
    version: "2.1.0",
    repositoryUrl: "https://docs.sentry.io/product/sentry-mcp/",
    remotes: [{ type: "streamable-http", url: "https://mcp.sentry.dev/mcp" }],
  },
  {
    name: "com.brave/search",
    title: "Brave Search",
    description:
      "Web, local and news search powered by the Brave Search API. Requires an API key from the Brave dashboard.",
    version: "0.4.5",
    repositoryUrl: "https://github.com/brave/brave-search-mcp-server",
    package: {
      registryType: "npm",
      identifier: "@brave/brave-search-mcp-server",
      environmentVariables: {
        BRAVE_API_KEY: {
          description: "Brave Search API key",
          isRequired: true,
          isSecret: true,
        },
      },
    },
  },
  {
    name: "io.github.puppeteer",
    title: "Puppeteer",
    description:
      "Drive a headless Chrome instance: navigate pages, take screenshots and extract structured content.",
    version: "0.2.0",
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    package: {
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-puppeteer",
      runtimeArguments: ["-y"],
    },
  },
];

const runtimes: RuntimeInfo = {
  nodejs: "/opt/homebrew/bin/node",
  npx: "/opt/homebrew/bin/npx",
  python: "/opt/homebrew/bin/python3",
  bun: "/opt/homebrew/bin/bun",
  uvx: null,
};

// ── 日志演示总线 ──
type LogListener = (payload: LogPayload) => void;
const logListeners = new Map<string, Set<LogListener>>();
const logBuffers = new Map<string, LogPayload[]>();

function now() {
  return new Date().toISOString();
}

function emitLog(serverName: string, line: string, stream: "stdout" | "stderr" = "stdout") {
  const payload: LogPayload = { stream, line, timestamp: now() };
  const buffer = logBuffers.get(serverName) ?? [];
  buffer.push(payload);
  if (buffer.length > 500) buffer.shift();
  logBuffers.set(serverName, buffer);
  logListeners.get(serverName)?.forEach((listener) => listener(payload));
}

export function listenLogs(serverName: string, callback: LogListener): () => void {
  const set = logListeners.get(serverName) ?? new Set<LogListener>();
  set.add(callback);
  logListeners.set(serverName, set);
  logBuffers.get(serverName)?.slice(-60).forEach(callback);
  return () => set.delete(callback);
}

const bootLines = [
  "[server] MCP server starting …",
  "[server] transport: stdio",
  "[server] capabilities: tools, resources, prompts",
  "[server] waiting for client requests",
];

// 已经运行的演示进程自带一段启动日志，打开调试台即可看到
for (const serverName of Object.keys(running)) {
  bootLines.forEach((line) => emitLog(serverName, line));
}

export function listAllAgents(): Promise<AgentInfo[]> {
  return Promise.resolve(
    agents.map(({ detected: _detected, ...agent }) => ({ ...agent })),
  );
}

export function fetchAgentsWithServers(): Promise<AgentWithServers[]> {
  return Promise.resolve(structuredClone(demoAgentsWithServers));
}

export function addServer(req: AddServerRequest): Promise<AddServerResult[]> {
  const name = req.serverName?.trim() || deriveName(req.target);
  const isRemote = req.target.startsWith("http://") || req.target.startsWith("https://");

  const config: Record<string, unknown> = isRemote
    ? {
        type: req.transport ?? "http",
        url: req.target,
        ...(req.headers ? { headers: req.headers } : {}),
      }
    : {
        command: req.target,
        ...(req.args?.length ? { args: req.args } : {}),
        ...(req.env ? { env: req.env } : {}),
      };

  const results = req.agents.map((agentType) => {
    const agent = demoAgentsWithServers.find((entry) => entry.agentType === agentType);
    if (!agent) {
      return {
        success: false,
        agentType,
        configPath: "",
        error: "Agent not available in preview",
        droppedFields: [],
      } satisfies AddServerResult;
    }

    const installed: InstalledServer = {
      serverName: name,
      config,
      identity: `${name}@${agentType}:${req.scope}`,
      agentType,
      scope: req.scope,
      configPath:
        req.scope === "global"
          ? agent.configPath
          : `${req.cwd ?? PROJECT_DIR}/${agent.localConfigPath ?? ".mcp.json"}`,
    };

    const target = req.scope === "global" ? agent.globalServers : agent.localServers;
    const existingIndex = target.findIndex((server) => server.serverName === name);
    if (existingIndex >= 0) target[existingIndex] = installed;
    else target.push(installed);

    return {
      success: true,
      agentType,
      configPath: installed.configPath,
      droppedFields: [],
    } satisfies AddServerResult;
  });

  if (isRemote && name in remoteHealth) {
    remoteHealth[name] = { ok: true, detail: "HTTP 200 · 92ms" };
  }

  return Promise.resolve(results);
}

export function removeServer(req: RemoveServerRequest): Promise<RemoveResult[]> {
  const results = req.agents.map((agentType) => {
    const agent = demoAgentsWithServers.find((entry) => entry.agentType === agentType);
    if (!agent) {
      return { agentType, success: false, removed: false, error: "Unknown agent" };
    }
    const list = req.scope === "global" ? agent.globalServers : agent.localServers;
    const before = list.length;
    const filtered = list.filter((server) => server.serverName !== req.serverName);
    if (req.scope === "global") agent.globalServers = filtered;
    else agent.localServers = filtered;
    return { agentType, success: true, removed: filtered.length !== before };
  });

  const stillConfigured = demoAgentsWithServers.some((agent) =>
    [...agent.globalServers, ...agent.localServers].some(
      (server) => server.serverName === req.serverName,
    ),
  );
  if (!stillConfigured) {
    delete running[req.serverName];
    delete remoteHealth[req.serverName];
  }

  return Promise.resolve(results);
}

export function getStatuses(probes: ServerProbe[]): Promise<ServerStatus[]> {
  const statuses: ServerStatus[] = [];

  for (const probe of probes) {
    const process = running[probe.name];
    if (process) {
      statuses.push({
        name: probe.name,
        pid: process.pid,
        uptimeSecs: process.uptime,
        cpuUsage: process.cpu,
        memoryMb: process.memory,
        isRunning: true,
        statusType: "managed",
        detail: null,
      });
      continue;
    }

    const health = remoteHealth[probe.name];
    if (health) {
      statuses.push({
        name: probe.name,
        pid: null,
        uptimeSecs: 0,
        cpuUsage: 0,
        memoryMb: 0,
        isRunning: health.ok,
        statusType: "remote",
        detail: health.detail,
      });
    }
  }

  return Promise.resolve(statuses);
}

export function startServer(req: { serverName: string }): Promise<number> {
  const pid = 49000 + Math.floor(Math.random() * 900);
  running[req.serverName] = { pid, uptime: 0, cpu: 0.2, memory: 26.4 };
  logBuffers.set(req.serverName, []);
  bootLines.forEach((line, index) => {
    window.setTimeout(() => emitLog(req.serverName, line), 180 * (index + 1));
  });
  return Promise.resolve(pid);
}

export function stopServer(serverName: string): Promise<void> {
  delete running[serverName];
  emitLog(serverName, "[server] process exited with code 0", "stderr");
  return Promise.resolve();
}

export function sendRpc(serverName: string, message: string): Promise<void> {
  emitLog(serverName, `[rpc →] ${message}`);
  window.setTimeout(() => {
    emitLog(
      serverName,
      `[rpc ←] {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}`,
    );
  }, 220);
  return Promise.resolve();
}

export function searchRegistry(query: string): Promise<{
  entries: RegistryServerEntry[];
  failedRegistries: { url: string; label?: string; detail: string }[];
}> {
  const needle = query.trim().toLowerCase();
  const entries = needle
    ? registryEntries.filter((entry) =>
        [entry.name, entry.title, entry.description, entry.package?.identifier]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : registryEntries;

  return Promise.resolve({ entries, failedRegistries: [] });
}

export function inspectRepo(url: string): Promise<RepoProbe> {
  const isRepo = /github\.com|gitlab\.com|gitee\.com/.test(url);
  return Promise.resolve({
    isCodeRepo: isRepo,
    repo: isRepo ? "modelcontextprotocol/servers" : null,
    npmPackage: isRepo ? "@modelcontextprotocol/server-filesystem" : null,
    npmVersion: isRepo ? "2025.8.1" : null,
  });
}

export function planInstall(url: string): Promise<import("./types").InstallPlan> {
  return Promise.resolve({
    repo: url.split("/").slice(-2).join("/") || "owner/repo",
    suggestedName: "filesystem",
    targetDir: `${HOME}/.mcpm/servers/owner-repo`,
    kind: "release",
    version: "v2025.8.1",
    assetName: "server-macos-arm64.tar.gz",
    assetSize: 18_432_112,
    entry: null,
    packageManager: null,
    commands: [
      "curl -L https://github.com/owner/repo/releases/download/v2025.8.1/server-macos-arm64.tar.gz",
      "shasum -a 256 -c server-macos-arm64.tar.gz.sha256",
      "tar -xzf server-macos-arm64.tar.gz -C ~/.mcpm/servers/owner-repo",
    ],
    notes: ["预编译包只做下载、校验和解压，不执行仓库里的脚本。"],
  });
}

export function installFromRepo(
  url: string,
): Promise<import("./types").InstallResult> {
  return Promise.resolve({
    kind: "release",
    suggestedName: url.split("/").filter(Boolean).pop() ?? "mcp-server",
    dir: `${HOME}/.mcpm/servers/owner-repo`,
    command: `${HOME}/.mcpm/servers/owner-repo/run.sh`,
    args: [],
    log: ["downloaded release asset", "checksum ok", "launcher written"],
  });
}

export function detectRuntimes(): Promise<RuntimeInfo> {
  return Promise.resolve(runtimes);
}

export function configPreview(): Promise<string> {
  return Promise.resolve(
    JSON.stringify(
      {
        mcpServers: {
          "github-mcp-server": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_xxxxxxxx" },
          },
        },
      },
      null,
      2,
    ),
  );
}

function deriveName(target: string): string {
  const clean = target.replace(/\/+$/, "");
  if (clean.startsWith("http")) {
    const segment = clean.split("/").pop() ?? "remote-server";
    return segment === "mcp" || segment === "sse" ? "remote-server" : segment;
  }
  if (clean.startsWith("@")) {
    return clean.split("/").pop()?.replace(/^server-/, "") ?? "mcp-server";
  }
  if (clean.startsWith("/") || clean.startsWith("~")) {
    return clean.split("/").pop() || "local-server";
  }
  return clean.replace(/^server-/, "") || "mcp-server";
}
