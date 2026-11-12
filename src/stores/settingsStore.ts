import { create } from "zustand";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";

interface SettingsStore {
  autoStart: boolean;
  loading: boolean;

  initAutoStart: () => Promise<void>;
  toggleAutoStart: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  autoStart: false,
  loading: false,

  initAutoStart: async () => {
    try {
      set({ autoStart: await isEnabled() });
    } catch {
      // 浏览器预览或插件未初始化时忽略
    }
  },

  toggleAutoStart: async (enabled) => {
    set({ loading: true });
    try {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
      set({ autoStart: enabled, loading: false });
    } catch (error) {
      console.error("Failed to toggle autostart:", error);
      set({ loading: false });
    }
  },
}));
