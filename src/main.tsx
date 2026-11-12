import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// 全局按钮防连点：同一个按钮 300ms 内的重复点击直接丢弃
const CLICK_LOCK_MS = 300;
document.addEventListener(
  "click",
  (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button");
    if (!button) return;
    const now = Date.now();
    const last = Number(button.dataset.lastClickAt ?? 0);
    if (now - last < CLICK_LOCK_MS) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    button.dataset.lastClickAt = String(now);
  },
  true,
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
