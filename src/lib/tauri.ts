// 所有后端通信统一封装；在普通浏览器中自动退回演示数据，便于预览界面
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as demo from "./demo";
import type {
  AddServerRequest,
  AddServerResult,
  AgentInfo,
  AgentWithServers,
  InstallPlan,
  InstallProgress,
  InstallResult,
  LogPayload,
  RegistrySearchResult,
  RemoveResult,
  RemoveServerRequest,
  RepoProbe,
  RuntimeInfo,
  ServerProbe,
  ServerStatus,
  StartServerRequest,
  SyncResult,
} from "./types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ── Agent ──

export const fetchAllAgents = (): Promise<AgentInfo[]> =>
  isTauri() ? invoke("list_all_agents") : demo.listAllAgents();

export const fetchAgentsWithServers = (
  scope?: "local" | "global",
  cwd?: string,
): Promise<AgentWithServers[]> =>
  isTauri()
    ? invoke("get_agents_with_servers", { scope: scope ?? null, cwd: cwd ?? null })
    : demo.fetchAgentsWithServers();

// ── Server 配置 ──

export const addMcpServer = (req: AddServerRequest): Promise<AddServerResult[]> =>
  isTauri() ? invoke("add_mcp_server", { req }) : demo.addServer(req);

export const removeMcpServer = (req: RemoveServerRequest): Promise<RemoveResult[]> =>
  isTauri() ? invoke("remove_mcp_server", { req }) : demo.removeServer(req);

export const syncServers = (scope: "local" | "global", cwd?: string): Promise<SyncResult> =>
  invoke("sync_servers", { scope, cwd: cwd ?? null });

// ── 进程管理 ──

export const startServerProcess = (req: StartServerRequest): Promise<number> =>
  isTauri() ? invoke("start_server_process", { req }) : demo.startServer(req);

export const stopServerProcess = (serverName: string): Promise<void> =>
  isTauri() ? invoke("stop_server_process", { serverName }) : demo.stopServer(serverName);

export const getServerStatuses = (servers?: ServerProbe[]): Promise<ServerStatus[]> =>
  isTauri()
    ? invoke("get_server_statuses", { servers: servers ?? null })
    : demo.getStatuses(servers ?? []);

export const sendJsonRpc = (serverName: string, message: string): Promise<void> =>
  isTauri() ? invoke("send_jsonrpc", { serverName, message }) : demo.sendRpc(serverName, message);

// ── Registry ──

export const searchMcpRegistry = (query: string): Promise<RegistrySearchResult> =>
  isTauri() ? invoke("search_mcp_registry", { query }) : demo.searchRegistry(query);

// ── 服务源探测 ──

export const inspectSource = (url: string): Promise<RepoProbe> =>
  isTauri() ? invoke("inspect_source", { url }) : demo.inspectRepo(url);

// ── 仓库本地安装 ──

export const planInstall = (url: string): Promise<InstallPlan> =>
  isTauri() ? invoke("plan_install", { url }) : demo.planInstall(url);

export const installLocal = (url: string, allowScripts: boolean): Promise<InstallResult> =>
  isTauri() ? invoke("install_local", { url, allowScripts }) : demo.installFromRepo(url);

export function listenToInstallProgress(
  callback: (payload: InstallProgress) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen<InstallProgress>("install:progress", (event) => callback(event.payload));
}

// ── 应用外壳 ──

export const setAppMenu = (language: "zh" | "en"): Promise<void> =>
  isTauri() ? invoke("set_app_menu", { language }) : Promise.resolve();

// ── 环境 ──

export const detectRuntimes = (): Promise<RuntimeInfo> =>
  isTauri() ? invoke("detect_runtimes") : demo.detectRuntimes();

export const getConfigPreview = (
  agentType: string,
  scope: "local" | "global",
  cwd?: string,
): Promise<string> =>
  isTauri()
    ? invoke("get_config_preview", { agentType, scope, cwd: cwd ?? null })
    : demo.configPreview();

// ── 事件 ──

export function listenToLogStream(
  serverName: string,
  callback: (payload: LogPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(demo.listenLogs(serverName, callback));
  return listen<LogPayload>(`mcp-log-${serverName}`, (event) => callback(event.payload));
}

export function listenToProcessExit(
  serverName: string,
  callback: () => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen(`mcp-process-exited-${serverName}`, () => callback());
}
