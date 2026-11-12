import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { ServersPage } from "@/pages/Servers";
import { RegistryPage } from "@/pages/Registry";
import { SettingsPage } from "@/pages/Settings";
import { useAgentStore } from "@/stores/agentStore";
import { useLanguageStore } from "@/stores/languageStore";
import { isTauri, setAppMenu } from "@/lib/tauri";

function App() {
  const fetchAgents = useAgentStore((state) => state.fetchAgents);
  const fetchAgentsWithServers = useAgentStore((state) => state.fetchAgentsWithServers);
  const language = useLanguageStore((state) => state.language);

  useEffect(() => {
    fetchAgents();
    fetchAgentsWithServers();
  }, [fetchAgents, fetchAgentsWithServers]);

  // macOS 菜单栏跟随界面语言
  useEffect(() => {
    void setAppMenu(language);
  }, [language]);

  return (
    <HashRouter>
      <div className="mcp-app relative">
        <div className="mcp-window relative">
          {/* 原生标题栏是透明覆盖层，不会自己拖动窗口；这一条透明热区负责拖拽 */}
          <div
            className="absolute inset-x-0 top-0 z-40 h-[44px]"
            onMouseDown={(event) => {
              if (!isTauri() || event.button !== 0) return;
              // 双击交给下面的 onDoubleClick，避免和系统双击缩放冲突
              if (event.detail !== 1) return;
              event.preventDefault();
              void getCurrentWindow().startDragging();
            }}
            onDoubleClick={() => {
              if (isTauri()) void getCurrentWindow().toggleMaximize();
            }}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface/60 pt-[34px]">
              <Routes>
                <Route path="/" element={<ServersPage />} />
                <Route path="/registry" element={<RegistryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </div>

      <Toaster
        position="bottom-right"
        theme="light"
        closeButton={false}
        toastOptions={{ className: "font-sans" }}
      />
    </HashRouter>
  );
}

export default App;
