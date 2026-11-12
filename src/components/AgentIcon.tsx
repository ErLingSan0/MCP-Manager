import { cn } from "@/lib/utils";

interface AgentIconProps {
  agentType: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

const iconMap: Record<string, string> = {
  antigravity: "/agents/antigravity.ico",
  cline: "/agents/cline.png",
  "cline-cli": "/agents/cline-cli.png",
  "claude-code": "/agents/claude-code.png",
  "claude-desktop": "/agents/claude-desktop.png",
  codewhale: "/agents/deepseek-reasonix.ico",
  codex: "/agents/codex.png",
  catpaw: "/agents/catpaw.png",
  cursor: "/agents/cursor.png",
  "deepseek-reasonix": "/agents/deepseek-reasonix.ico",
  "deepseek-harness": "/agents/deepseek-harness.png",
  "gemini-cli": "/agents/gemini-cli.png",
  goose: "/agents/goose.ico",
  "github-copilot-cli": "/agents/github-copilot-cli.png",
  "kimi-code": "/agents/kimi-code.ico",
  kiro: "/agents/kiro.png",
  mcporter: "/agents/mcporter.png",
  mimocode: "/agents/mimocode.ico",
  opencode: "/agents/opencode.png",
  qoder: "/agents/qoder.png",
  "qoder-cn": "/agents/qoder-cn.png",
  "trae-cn": "/agents/trae-cn.png",
  "trae-international": "/agents/trae-international.png",
  vscode: "/agents/vscode.png",
  workbuddy: "/agents/workbuddy.svg",
  windsurf: "/agents/windsurf.ico",
  zed: "/agents/zed.png",
  zcode: "/agents/zcode.svg",
};

const sizeMap = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function getAgentIconPath(agentType: string): string {
  return iconMap[agentType] ?? "";
}

export function AgentIcon({ agentType, className, size = "md" }: AgentIconProps) {
  const src = getAgentIconPath(agentType);
  const shape = cn("shrink-0 rounded-[4px] object-contain", sizeMap[size], className);

  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center bg-surface-muted font-mono text-[9px] uppercase text-muted",
          sizeMap[size],
          className,
        )}
      >
        {agentType.slice(0, 1)}
      </span>
    );
  }

  return <img src={src} alt={agentType} draggable={false} className={shape} />;
}
