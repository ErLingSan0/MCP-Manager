import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 把 home 目录缩写成 ~，用于展示路径 */
export function shortenPath(path: string): string {
  if (!path) return "";
  const match = path.match(/^\/(?:Users|home)\/([^/]+)/);
  return match ? path.replace(match[0], "~") : path;
}

export function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function formatMemory(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function isRemoteServer(config: Record<string, unknown>): boolean {
  return Boolean(config.url || config.uri || config.serverUrl);
}

export function remoteTargetFromConfig(config: Record<string, unknown>): string {
  return (
    (config.url as string | undefined) ??
    (config.uri as string | undefined) ??
    (config.serverUrl as string | undefined) ??
    ""
  );
}

export function commandPreviewFromConfig(
  config: Record<string, unknown>,
  isRemote: boolean,
): string {
  if (isRemote) return remoteTargetFromConfig(config);
  return [config.command as string | undefined, ...((config.args as string[] | undefined) ?? [])]
    .filter(Boolean)
    .join(" ");
}

export function transportLabelFromConfig(
  config: Record<string, unknown>,
  isRemote: boolean,
): string {
  if (!isRemote) return "stdio";
  const raw =
    (config.type as string | undefined) ?? (config.transport as string | undefined) ?? "http";
  return raw.toLowerCase().includes("sse") ? "sse" : "http";
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
