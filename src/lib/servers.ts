import type { AgentInfo, AgentWithServers, InstalledServer, Scope } from "./types";
import {
  commandPreviewFromConfig,
  isRemoteServer,
  transportLabelFromConfig,
} from "./utils";

export type HealthState = "running" | "reachable" | "unreachable" | "stopped" | "checking";

export interface AgentBinding {
  key: string;
  agentType: string;
  displayName: string;
  detected: boolean;
  enabled: boolean;
  scope: Scope;
  configPath: string;
  cwd?: string;
  installed: InstalledServer | null;
}

export interface ServerGroup {
  name: string;
  isRemote: boolean;
  transport: string;
  source: string;
  config: Record<string, unknown> | null;
  bindings: AgentBinding[];
  agentTypes: string[];
  scopes: Scope[];
}

/** 把「按智能体组织」的配置聚合成「按服务组织」的视图 */
export function buildServerGroups(
  agentsWithServers: AgentWithServers[],
  allAgents: AgentInfo[],
): ServerGroup[] {
  const groups = new Map<string, ServerGroup>();
  const detected = new Set(
    agentsWithServers.filter((agent) => agent.detected).map((agent) => agent.agentType),
  );

  for (const agent of agentsWithServers) {
    const servers = [
      ...agent.globalServers.map((server) => ({ server, scope: "global" as const })),
      ...agent.localServers.map((server) => ({ server, scope: "local" as const })),
    ];

    for (const { server, scope } of servers) {
      let group = groups.get(server.serverName);
      if (!group) {
        const config = (server.config ?? {}) as Record<string, unknown>;
        const remote = isRemoteServer(config);
        group = {
          name: server.serverName,
          isRemote: remote,
          transport: transportLabelFromConfig(config, remote),
          source: commandPreviewFromConfig(config, remote),
          config,
          bindings: [],
          agentTypes: [],
          scopes: [],
        };
        groups.set(server.serverName, group);
      }

      group.bindings.push({
        key: `${agent.agentType}:${scope}`,
        agentType: agent.agentType,
        displayName: agent.displayName,
        detected: agent.detected,
        enabled: true,
        scope,
        configPath: server.configPath,
        cwd: resolveCwd(agent.localConfigPath, scope, server.configPath),
        installed: server,
      });
    }
  }

  for (const group of groups.values()) {
    const present = new Set(group.bindings.map((binding) => binding.agentType));

    for (const agent of allAgents) {
      if (present.has(agent.agentType)) continue;
      group.bindings.push({
        key: `${agent.agentType}:global`,
        agentType: agent.agentType,
        displayName: agent.displayName,
        detected: detected.has(agent.agentType),
        enabled: false,
        scope: "global",
        configPath: agent.configPath,
        installed: null,
      });
    }

    group.bindings.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      if (a.detected !== b.detected) return a.detected ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

    group.agentTypes = Array.from(new Set(group.bindings.filter((b) => b.enabled).map((b) => b.agentType)));
    group.scopes = Array.from(new Set(group.bindings.filter((b) => b.enabled).map((b) => b.scope)));
  }

  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** 从项目级配置路径反推项目根目录，删除本地配置时后端需要它 */
function resolveCwd(
  localConfigPath: string | undefined,
  scope: Scope,
  configPath: string,
): string | undefined {
  if (scope !== "local" || !localConfigPath) return undefined;
  const suffix = `/${localConfigPath}`;
  return configPath.endsWith(suffix) ? configPath.slice(0, -suffix.length) : undefined;
}

export function enabledAgentCount(group: ServerGroup): number {
  return group.bindings.filter((binding) => binding.enabled).length;
}

export function installedAgentCount(group: ServerGroup): number {
  return group.bindings.filter((binding) => binding.enabled && binding.detected).length;
}

export function healthOf(
  group: ServerGroup,
  statuses: { name: string; isRunning: boolean; statusType: string }[],
): HealthState {
  const status = statuses.find((item) => item.name === group.name);

  if (group.isRemote) {
    if (!status) return "checking";
    return status.isRunning ? "reachable" : "unreachable";
  }

  if (status?.statusType === "managed" && status.isRunning) return "running";
  return "stopped";
}
