import { create } from "zustand";

export type Language = "zh" | "en";

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

const STORAGE_KEY = "mcpm-language";

function initialLanguage(): Language {
  if (typeof window === "undefined") return "zh";
  return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
}

export const useLanguageStore = create<LanguageStore>((set, get) => ({
  language: initialLanguage(),
  setLanguage: (language) => {
    window.localStorage.setItem(STORAGE_KEY, language);
    set({ language });
  },
  toggleLanguage: () => {
    const next = get().language === "zh" ? "en" : "zh";
    window.localStorage.setItem(STORAGE_KEY, next);
    set({ language: next });
  },
}));
