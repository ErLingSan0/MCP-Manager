import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Send, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ServerStatus } from "@/lib/types";
import type { ServerGroup } from "@/lib/servers";
import { sendJsonRpc, startServerProcess, stopServerProcess } from "@/lib/tauri";
import { copy } from "@/lib/i18n";
import { formatMemory, formatUptime } from "@/lib/utils";
import { useLanguageStore } from "@/stores/languageStore";
import { useLogStream } from "@/hooks/useLogStream";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Button, IconButton, Spinner } from "@/components/ui/Button";
import { Dialog, DialogHeader } from "@/components/ui/Dialog";

interface DebugDrawerProps {
  open: boolean;
  onClose: () => void;
  group: ServerGroup;
  statuses: ServerStatus[];
  onRefresh: () => void;
}

export function DebugDrawer({ open, onClose, group, statuses, onRefresh }: DebugDrawerProps) {
  const { language } = useLanguageStore();
  const t = copy[language].debug;
  const { logs, clearLogs } = useLogStream(open ? group.name : null);
  const [rpcInput, setRpcInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const status = useMemo(
    () => statuses.find((item) => item.name === group.name && item.statusType === "managed"),
    [statuses, group.name],
  );
  const running = Boolean(status?.isRunning);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  const handleStart = async () => {
    if (!group.config) return;
    setBusy(true);
    try {
      await startServerProcess({
        serverName: group.name,
        command: group.config.command as string | undefined,
        args: group.config.args as string[] | undefined,
        env: group.config.env as Record<string, string> | undefined,
      });
      toast.success(t.started);
      onRefresh();
    } catch (error) {
      toast.error(`${t.startFailed}: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await stopServerProcess(group.name);
      toast.success(t.stopped);
      onRefresh();
    } catch (error) {
      toast.error(`${t.stopFailed}: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!rpcInput.trim() || !running) return;
    try {
      await sendJsonRpc(group.name, rpcInput.trim());
      toast.success(t.rpcSent);
      setRpcInput("");
    } catch (error) {
      toast.error(`${t.sendFailed}: ${String(error)}`);
    }
  };

  const fillTemplate = () => {
    setRpcInput(
      JSON.stringify(
        {
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "mcpm", version: "0.5.0" },
          },
          id: 1,
        },
        null,
        2,
      ),
    );
  };

  return (
    <Dialog open={open} onClose={onClose} align="right" className="w-[620px]">
      <DialogHeader
        title={
          <span className="flex items-center gap-2">
            {t.title}
            <Badge tone="neutral" mono>
              {group.transport}
            </Badge>
          </span>
        }
        subtitle={<span className="font-mono text-[11px]">{group.name}</span>}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
        {group.isRemote ? (
          <div className="rounded-lg border border-amber/20 bg-amber-soft px-3.5 py-3 text-[11.5px] leading-5 text-amber">
            {t.remoteNotice}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/50 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <StatusDot tone={running ? "moss" : "muted"} pulse={running} />
                <span className="text-[12px] font-medium text-ink">
                  {running ? copy[language].health.running : copy[language].health.stopped}
                </span>
                {running && status && (
                  <span className="font-mono text-[10.5px] text-muted">
                    PID {status.pid} · {formatUptime(status.uptimeSecs)} · {status.cpuUsage.toFixed(1)}% ·{" "}
                    {formatMemory(status.memoryMb)}
                  </span>
                )}
              </div>
              {running ? (
                <Button variant="danger" size="sm" onClick={handleStop} disabled={busy}>
                  {busy ? <Spinner /> : <Square className="h-3 w-3" />}
                  {t.stop}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStart}
                  disabled={busy || !group.config?.command}
                >
                  {busy ? <Spinner /> : <Play className="h-3 w-3" />}
                  {t.start}
                </Button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-terminal">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-3">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-terminal-ink/50">
                  stdout · stderr
                </span>
                <IconButton
                  onClick={clearLogs}
                  aria-label={t.clear}
                  className="h-6 w-6 text-terminal-ink/50 hover:bg-white/10 hover:text-terminal-ink"
                >
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </div>
              <div className="min-h-[240px] flex-1 overflow-y-auto px-3 py-2.5 font-mono text-[11px] leading-[1.7]">
                {logs.length === 0 ? (
                  <p className="py-10 text-center font-sans text-[11.5px] text-terminal-ink/40">
                    {running ? t.waiting : t.startHint}
                  </p>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="flex gap-2.5">
                      <span className="shrink-0 text-terminal-ink/30">
                        {log.timestamp.split("T")[1]?.slice(0, 8)}
                      </span>
                      <span
                        className={
                          log.stream === "stderr"
                            ? "break-all whitespace-pre-wrap text-[#e0a79b]"
                            : "break-all whitespace-pre-wrap text-terminal-ink/85"
                        }
                      >
                        {log.line}
                      </span>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-[0.04em] text-muted">{t.rpcTitle}</span>
                <button
                  type="button"
                  onClick={fillTemplate}
                  className="text-[11px] font-medium text-sage hover:underline"
                >
                  {t.template}
                </button>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={rpcInput}
                  onChange={(event) => setRpcInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && event.metaKey) handleSend();
                  }}
                  rows={3}
                  placeholder={t.rpcPlaceholder}
                  className="min-h-[64px] flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 font-mono text-[11px] leading-5 placeholder:text-muted/60 focus:border-sage/50 focus:outline-none focus:ring-2 focus:ring-sage/15"
                />
                <Button
                  variant="primary"
                  onClick={handleSend}
                  disabled={!running || !rpcInput.trim()}
                  className="h-auto shrink-0 flex-col gap-1 px-4"
                >
                  <Send className="h-3.5 w-3.5" />
                  {t.send}
                </Button>
              </div>
              <p className="font-mono text-[10px] text-muted">{t.shortcut}</p>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
