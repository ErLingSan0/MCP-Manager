import { Compass, Server, Settings2 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { copy } from "@/lib/i18n";
import { useLanguageStore } from "@/stores/languageStore";
import { useAgentStore } from "@/stores/agentStore";
import { buildServerGroups } from "@/lib/servers";
import { APP_VERSION } from "@/lib/branding";

export function Sidebar() {
  const { language, setLanguage } = useLanguageStore();
  const { agents, agentsWithServers } = useAgentStore();
  const t = copy[language];
  const serverCount = buildServerGroups(agentsWithServers, agents).length;

  const items = [
    { to: "/", label: t.nav.servers, icon: Server, end: true, badge: serverCount || undefined },
    { to: "/registry", label: t.nav.registry, icon: Compass, end: false },
    { to: "/settings", label: t.nav.settings, icon: Settings2, end: false },
  ];

  return (
    <aside className="flex w-[224px] shrink-0 flex-col border-r border-line bg-[rgba(246,248,245,0.88)] px-3 pb-3.5 pt-[44px]">
      <div className="flex items-center gap-3 px-2 pb-6 pt-0">
        <img
          src="/agents/mcpm.png"
          alt="MCP Manager"
          className="h-10 w-10 shrink-0 rounded-[11px] shadow-soft"
          draggable={false}
        />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-[-0.3px] text-ink">
            MCP Manager
          </div>
          <div className="mt-[3px] truncate text-[11px] text-muted">MCP control center</div>
        </div>
      </div>

      <nav className="flex flex-col gap-[5px]">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "group relative flex h-[42px] items-center gap-3 rounded-[9px] px-3 text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "bg-white font-semibold text-ink shadow-soft"
                  : "text-ink-soft hover:bg-white/70 hover:text-ink",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn("h-[15px] w-[15px] shrink-0", isActive ? "text-sage" : "text-muted")}
                  strokeWidth={1.8}
                />
                <span className="flex-1 truncate">{label}</span>
                {badge !== undefined && (
                  <span
                    className={cn(
                      "ml-auto rounded-md px-[7px] py-[3px] text-[11px] tabular-nums",
                      isActive ? "bg-sage-soft text-sage-strong" : "text-muted",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-4 border-t border-line px-2 pt-4">
        <div>
          <div className="mb-2 px-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
            {t.nav.language}
          </div>
          <div className="flex rounded-[9px] bg-[#f0f1ed] p-[3px]">
            {(
              [
                { value: "zh" as const, label: "中文" },
                { value: "en" as const, label: "EN" },
              ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLanguage(option.value)}
                className={cn(
                  "h-[30px] flex-1 rounded-[7px] text-[11.5px] font-medium transition-colors",
                  language === option.value
                    ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    : "text-ink-soft hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-1.5 text-[10px] text-muted">
          <span>{language === "zh" ? "28 个智能体" : "28 agents"}</span>
          <span className="font-mono">v{APP_VERSION}</span>
        </div>
      </div>
    </aside>
  );
}
