import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FolderOpen,
  Globe,
  Link2,
  Package,
  Search,
  Terminal,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type {
  AddServerResult,
  AgentInfo,
  InstallKind,
  InstallPlan,
  InstallProgress,
  RepoProbe,
} from "@/lib/types";
import {
  addMcpServer,
  inspectSource,
  installLocal,
  isTauri,
  listenToInstallProgress,
  planInstall,
} from "@/lib/tauri";
import { copy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/languageStore";
import { AgentIcon } from "@/components/AgentIcon";
import { Badge } from "@/components/ui/Badge";
import { Button, Spinner } from "@/components/ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Label, Segmented, Textarea } from "@/components/ui/Field";

interface AddServerDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  agents: AgentInfo[];
  detectedAgents?: string[];
  initialTarget?: string;
  initialHeaders?: string;
  initialEnv?: string;
  initialArgs?: string;
}

type Scope = "global" | "local";

export function AddServerDialog({
  open,
  onClose,
  onSuccess,
  agents,
  detectedAgents = [],
  initialTarget,
  initialHeaders,
  initialEnv,
  initialArgs,
}: AddServerDialogProps) {
  const { language } = useLanguageStore();
  const t = copy[language];
  const a = t.add;

  const [target, setTarget] = useState("");
  const [serverName, setServerName] = useState("");
  const [scope, setScope] = useState<Scope>("global");
  const [projectDir, setProjectDir] = useState("");
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [headers, setHeaders] = useState("");
  const [env, setEnv] = useState("");
  const [args, setArgs] = useState("");
  const [timeoutValue, setTimeoutValue] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [autoApproveTools, setAutoApproveTools] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [probe, setProbe] = useState<RepoProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [installPlan, setInstallPlan] = useState<InstallPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [allowScripts, setAllowScripts] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(initialTarget ?? "");
    setHeaders(initialHeaders ?? "");
    setEnv(initialEnv ?? "");
    setArgs(initialArgs ?? "");
    setServerName("");
    setScope("global");
    setProjectDir("");
    setSelectedAgents([]);
    setAgentQuery("");
    setShowAdvanced(false);
  }, [open, initialTarget, initialHeaders, initialEnv, initialArgs]);

  const isUrl = target.startsWith("http://") || target.startsWith("https://");
  const isPath = target.startsWith("/") || target.startsWith("~");
  const isNpm = !isUrl && !isPath && (target.startsWith("@") || target.includes("/"));

  const sourceType = !target
    ? null
    : isUrl
      ? { icon: Globe, label: a.typeRemote }
      : isNpm
        ? { icon: Package, label: a.typeNpm }
        : isPath
          ? { icon: FolderOpen, label: a.typePath }
          : { icon: Terminal, label: a.typeCommand };

  // 识别代码仓库地址（只读探测）
  useEffect(() => {
    if (!isUrl || !open) {
      setProbe(null);
      setProbing(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setProbing(true);
      inspectSource(target.trim())
        .then((result) => {
          if (!cancelled) setProbe(result);
        })
        .catch(() => {
          if (!cancelled) setProbe(null);
        })
        .finally(() => {
          if (!cancelled) setProbing(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [target, isUrl, open]);

  useEffect(() => {
    if (!isUrl) return;
    setTransport(target.endsWith("/sse") || target.includes("/sse") ? "sse" : "http");
  }, [target, isUrl]);

  const sortedAgents = useMemo(() => {
    const query = agentQuery.trim().toLowerCase();
    return [...agents]
      .filter(
        (agent) =>
          !query ||
          agent.displayName.toLowerCase().includes(query) ||
          agent.agentType.toLowerCase().includes(query),
      )
      .sort((left, right) => {
        const leftDetected = detectedAgents.includes(left.agentType) ? 0 : 1;
        const rightDetected = detectedAgents.includes(right.agentType) ? 0 : 1;
        if (leftDetected !== rightDetected) return leftDetected - rightDetected;
        return left.displayName.localeCompare(right.displayName);
      });
  }, [agents, agentQuery, detectedAgents]);

  const projectDirMissing = scope === "local" && !projectDir.trim();
  const canSubmit =
    Boolean(target.trim()) && selectedAgents.length > 0 && !projectDirMissing && !loading;

  const chooseProjectDir = async () => {
    if (!isTauri()) {
      setProjectDir("/Users/zhufeng/Projects/atlas");
      return;
    }
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string") setProjectDir(selected);
  };

  const toggleAgent = (agentType: string) => {
    setSelectedAgents((current) =>
      current.includes(agentType)
        ? current.filter((item) => item !== agentType)
        : [...current, agentType],
    );
  };

  const handleSubmit = async () => {
    if (!target.trim()) {
      toast.error(a.requireSource);
      return;
    }
    if (isUrl && probe?.isCodeRepo) {
      toast.error(probe.npmPackage ? a.repoMustSwitch : a.repoNoNpm);
      return;
    }
    if (selectedAgents.length === 0) {
      toast.error(a.requireAgent);
      return;
    }
    if (projectDirMissing) {
      toast.error(a.requireProjectDir);
      return;
    }

    setLoading(true);
    try {
      const parsedTimeout = timeoutValue.trim() ? Number(timeoutValue.trim()) : null;
      if (parsedTimeout !== null && (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0)) {
        toast.error(a.invalidTimeout);
        return;
      }

      const results = await addMcpServer({
        target: target.trim(),
        serverName: serverName.trim() || undefined,
        agents: selectedAgents,
        scope,
        cwd: scope === "local" ? projectDir.trim() : null,
        transport: isUrl ? transport : undefined,
        headers: isUrl ? parsePairs(headers, ":", a.parseError) : null,
        env: !isUrl ? parsePairs(env, "=", a.parseError) : null,
        args: !isUrl
          ? args
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
          : null,
        timeout: parsedTimeout,
        oauthScopes: oauthScopes.trim()
          ? oauthScopes
              .split(/[\n,]/)
              .map((item) => item.trim())
              .filter(Boolean)
          : null,
        autoApproveTools:
          autoApprove && autoApproveTools.trim()
            ? autoApproveTools
                .split(/[\n,]/)
                .map((item) => item.trim())
                .filter(Boolean)
            : null,
      });

      const success = results.filter((result: AddServerResult) => result.success).length;
      const failures = results.filter((result: AddServerResult) => !result.success);
      const dropped = results
        .filter((result: AddServerResult) => result.success && result.droppedFields.length > 0)
        .map((result) => `${result.agentType}: ${result.droppedFields.join(", ")}`);

      if (success > 0) toast.success(a.success(success));
      if (dropped.length > 0) toast.warning(`${a.dropped}${dropped.join(language === "zh" ? "；" : "; ")}`);
      if (failures.length > 0) {
        toast.error(
          `${a.failed(failures.length)}${failures
            .map((failure) => `${failure.agentType}: ${failure.error ?? t.common.unknownError}`)
            .join(language === "zh" ? "；" : "; ")}`,
        );
      }

      onClose();
      onSuccess?.();
    } catch (error) {
      toast.error(`${a.failed(1)}${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanInstall = async () => {
    if (!target.trim()) return;
    setPlanning(true);
    setInstallError(null);
    try {
      const plan = await planInstall(target.trim());
      setInstallPlan(plan);
      setAllowScripts(false);
      setProgress(null);
    } catch (error) {
      toast.error(`${a.planFailed}: ${String(error)}`);
    } finally {
      setPlanning(false);
    }
  };

  const handleRunInstall = async () => {
    setInstalling(true);
    setInstallError(null);
    setProgress({ stage: "prepare", message: a.planning, percent: 0 });

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listenToInstallProgress((payload) => setProgress(payload));
    } catch {
      // 进度订阅失败不影响安装本身
    }

    try {
      const result = await installLocal(target.trim(), allowScripts);
      setTarget(result.command);
      setServerName(result.suggestedName);
      setProbe(null);
      setInstallPlan(null);
      toast.success(a.installDone);
    } catch (error) {
      setInstallError(String(error));
    } finally {
      unlisten?.();
      setInstalling(false);
    }
  };

  const installBadgeTone: Record<InstallKind, "moss" | "sage" | "amber"> = {
    release: "moss",
    python: "sage",
    source: "amber",
  };
  const installBadgeLabel = (kind: InstallKind) =>
    kind === "release" ? a.badgeRelease : kind === "python" ? a.badgePython : a.badgeSource;

  return (
    <>
      <Dialog open={open} onClose={onClose} className="max-w-[820px]" labelledBy="add-server-title">
        <DialogHeader
          id="add-server-title"
          title={a.title}
          subtitle={a.subtitle}
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <Field label={a.source}>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/70" />
              <Input
                autoFocus
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder={a.sourcePlaceholder}
                className="h-10 pl-9 pr-28 font-mono text-[12px]"
              />
              {sourceType && (
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-[5px] bg-surface-muted px-2 py-1 text-[10px] font-medium text-ink-soft">
                  <sourceType.icon className="h-3 w-3 text-muted" />
                  {sourceType.label}
                </div>
              )}
            </div>
            {isUrl && probing && <p className="text-[11px] text-muted">{a.probeChecking}</p>}
            {isUrl && probe?.isCodeRepo && probe.npmPackage && (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-moss/20 bg-moss-soft px-3 py-2">
                <p className="text-[11.5px] leading-5 text-moss">
                  {a.repoNpmFound(probe.npmPackage, probe.npmVersion)}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0 border-moss/25 text-moss hover:bg-white"
                  onClick={() => {
                    setTarget(probe.npmPackage ?? "");
                    setProbe(null);
                  }}
                >
                  {a.switchToNpm}
                </Button>
              </div>
            )}
            {isUrl && probe?.isCodeRepo && !probe.npmPackage && (
              <div className="mt-1 space-y-2 rounded-lg border border-amber/20 bg-amber-soft px-3 py-2.5">
                <p className="text-[11.5px] leading-5 text-amber">{a.repoNoNpm}</p>
                <p className="text-[11px] leading-5 text-amber/80">{a.repoNoNpmHint}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="border-amber/25 bg-white/60 text-amber hover:bg-white"
                  disabled={planning}
                  onClick={handlePlanInstall}
                >
                  {planning ? <Spinner /> : <Download className="h-3 w-3" />}
                  {planning ? a.planning : a.installLocal}
                </Button>
              </div>
            )}
          </Field>

          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <Field label={a.name}>
              <Input
                value={serverName}
                onChange={(event) => setServerName(event.target.value)}
                placeholder={a.namePlaceholder}
                className="font-mono text-[12px]"
              />
            </Field>
            <Field label={a.scope}>
              <Segmented
                value={scope}
                onChange={setScope}
                options={[
                  { value: "global", label: a.scopeGlobal },
                  { value: "local", label: a.scopeLocal },
                ]}
              />
            </Field>
          </div>

          {scope === "local" && (
            <Field label={a.projectDir} hint={projectDirMissing ? a.projectDirHint : undefined}>
              <div className="flex gap-2">
                <Input
                  value={projectDir}
                  onChange={(event) => setProjectDir(event.target.value)}
                  placeholder="/path/to/project"
                  className="font-mono text-[12px]"
                />
                <Button variant="secondary" onClick={chooseProjectDir} className="shrink-0">
                  <FolderOpen className="h-3.5 w-3.5" />
                  {a.chooseDir}
                </Button>
              </div>
            </Field>
          )}

          {isUrl ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Label>{a.transport}</Label>
                <Segmented
                  value={transport}
                  onChange={setTransport}
                  options={[
                    { value: "http", label: "HTTP" },
                    { value: "sse", label: "SSE" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={a.headers}>
                  <Textarea
                    rows={3}
                    value={headers}
                    onChange={(event) => setHeaders(event.target.value)}
                    placeholder={a.headersPlaceholder}
                  />
                </Field>
                <Field label={a.oauth}>
                  <Textarea
                    rows={3}
                    value={oauthScopes}
                    onChange={(event) => setOauthScopes(event.target.value)}
                    placeholder={a.oauthPlaceholder}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={a.env}>
                <Textarea
                  rows={3}
                  value={env}
                  onChange={(event) => setEnv(event.target.value)}
                  placeholder={a.envPlaceholder}
                />
              </Field>
              <Field label={a.args}>
                <Textarea
                  rows={3}
                  value={args}
                  onChange={(event) => setArgs(event.target.value)}
                  placeholder={a.argsPlaceholder}
                />
              </Field>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-line">
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-surface-muted/60"
            >
              {a.advanced}
              <ChevronDown
                className={cn("h-3.5 w-3.5 text-muted transition-transform", showAdvanced && "rotate-180")}
              />
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-4 border-t border-line px-3.5 py-3.5">
                <Field label={a.timeout}>
                  <Input
                    type="number"
                    min={1}
                    value={timeoutValue}
                    onChange={(event) => setTimeoutValue(event.target.value)}
                    placeholder="60"
                  />
                </Field>
                <div className="space-y-2">
                  <Checkbox checked={autoApprove} onChange={setAutoApprove} label={a.autoApprove} />
                  <Input
                    value={autoApproveTools}
                    onChange={(event) => setAutoApproveTools(event.target.value)}
                    placeholder={a.autoApproveHint}
                    disabled={!autoApprove}
                    className="h-8 text-[11px] disabled:opacity-50"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label>{a.agents}</Label>
                <span className="text-[11px] font-medium text-sage">
                  {a.selectedCount(selectedAgents.length)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                  <input
                    value={agentQuery}
                    onChange={(event) => setAgentQuery(event.target.value)}
                    placeholder={a.searchAgents}
                    className="h-7 w-[170px] rounded-md border border-line bg-surface pl-7 pr-2 text-[11.5px] placeholder:text-muted/70 focus:border-sage/50 focus:outline-none focus:ring-2 focus:ring-sage/15"
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedAgents(detectedAgents)}
                >
                  {a.selectDetected}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedAgents([])}>
                  {a.clearSelection}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-line bg-surface-muted/40 p-2">
              {sortedAgents.map((agent) => {
                const selected = selectedAgents.includes(agent.agentType);
                const detected = detectedAgents.includes(agent.agentType);
                return (
                  <button
                    key={agent.agentType}
                    type="button"
                    onClick={() => toggleAgent(agent.agentType)}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-md border px-2 text-left transition-colors",
                      selected
                        ? "border-sage/30 bg-surface shadow-soft"
                        : "border-transparent hover:border-line hover:bg-surface/70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                        selected ? "border-sage bg-sage text-white" : "border-line-strong bg-surface",
                      )}
                    >
                      {selected && (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                          <path
                            d="M2.5 6.2 5 8.5 9.5 3.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <AgentIcon agentType={agent.agentType} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink">
                      {agent.displayName}
                    </span>
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        detected ? "bg-moss" : "bg-line-strong",
                      )}
                      title={detected ? t.inspector.detected : t.inspector.notDetected}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {loading && <Spinner />}
            {loading
              ? a.submitting
              : selectedAgents.length > 0
                ? a.addToAgents(selectedAgents.length)
                : a.submit}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={installPlan !== null}
        onClose={() => {
          if (installing) return;
          setInstallPlan(null);
          setInstallError(null);
          setProgress(null);
        }}
        className="max-w-[620px]"
      >
        {installPlan && (
          <>
            <DialogHeader
              title={
                <span className="flex items-center gap-2">
                  {a.installTitle}
                  <Badge tone={installBadgeTone[installPlan.kind]}>
                    {installBadgeLabel(installPlan.kind)}
                  </Badge>
                </span>
              }
              onClose={() => {
                if (installing) return;
                setInstallPlan(null);
              }}
            />

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <dl className="space-y-2 text-[11.5px]">
                <Row label={a.installName} value={installPlan.suggestedName} mono />
                <Row label={a.installTargetDir} value={installPlan.targetDir} mono />
                {installPlan.version && (
                  <Row label={a.installVersion} value={installPlan.version} mono />
                )}
                {installPlan.assetName && (
                  <Row label={a.installAsset} value={installPlan.assetName} mono />
                )}
              </dl>

              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted">{a.installWillRun}</div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-surface-muted/60 px-3 py-2.5 font-mono text-[11px] leading-5 text-ink-soft">
                  {installPlan.commands.join("\n")}
                </pre>
              </div>

              {installPlan.notes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted">{a.installNotes}</div>
                  {installPlan.notes.map((note) => (
                    <div key={note} className="flex gap-1.5 text-[11.5px] leading-5 text-amber">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              )}

              {installPlan.kind === "source" && (
                <div className="rounded-lg border border-line px-3 py-2.5">
                  <Checkbox checked={allowScripts} onChange={setAllowScripts} label={a.allowScripts} />
                  <p className="mt-1.5 text-[11px] leading-5 text-muted">{a.allowScriptsHint}</p>
                </div>
              )}

              {installing && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Spinner className="h-3 w-3" />
                      {progress?.message ?? a.installingTitle}
                    </span>
                    <span className="font-mono">{progress?.percent ?? 0}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-sage transition-[width] duration-300"
                      style={{ width: `${progress?.percent ?? 0}%` }}
                    />
                  </div>
                </div>
              )}

              {installError && (
                <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-danger">
                    <AlertTriangle className="h-3 w-3" />
                    {a.installFailed}
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-danger">
                    {installError}
                  </pre>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                disabled={installing}
                onClick={() => {
                  setInstallPlan(null);
                  setInstallError(null);
                }}
              >
                {installError ? t.common.close : t.common.cancel}
              </Button>
              <Button variant="primary" disabled={installing} onClick={handleRunInstall}>
                {installing && <Spinner />}
                {installing ? a.installingTitle : a.startInstall}
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted">{label}</dt>
      <dd className={cn("min-w-0 flex-1 break-all text-ink", mono && "font-mono text-[11px]")}>
        {value}
      </dd>
    </div>
  );
}

function parsePairs(input: string, separator: ":" | "=", parseError: string) {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  return Object.fromEntries(
    lines.map((line) => {
      const index = line.indexOf(separator);
      if (index <= 0) throw new Error(`${parseError}: ${line}`);
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
}
