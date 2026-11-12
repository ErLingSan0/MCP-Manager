import { create } from "zustand";
import { getServerStatuses } from "@/lib/tauri";
import type { ServerProbe, ServerStatus } from "@/lib/types";

interface ServerProcessStore {
  statuses: ServerStatus[];
  loading: boolean;
  error: string | null;

  refreshStatuses: (servers?: ServerProbe[]) => Promise<void>;
}

export const useServerProcessStore = create<ServerProcessStore>((set) => ({
  statuses: [],
  loading: false,
  error: null,

  refreshStatuses: async (servers) => {
    try {
      set({ loading: true, error: null });
      const statuses = await getServerStatuses(servers);
      set({ statuses, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },
}));
