import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const brandFiles = [
  "package.json",
  "index.html",
  "README.md",
  "README.en.md",
  "docs/architecture.md",
  "docs/supported-agents.md",
  "docs/release.md",
  "docs/macos-install-troubleshooting.md",
  "CHANGELOG.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/workflows/release.yml",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/capabilities/default.json",
  "src-tauri/src/lib.rs",
  "src-tauri/src/tray.rs",
  "src/lib/branding.ts",
  "src/stores/languageStore.ts",
  "src/components/layout/Sidebar.tsx",
];

// 产品对外名称是 "MCP Manager"。内部标识（crate 名 mcpm、bundle id、
// ~/.mcpm 数据目录）保持小写 mcpm，不受这条规则约束。
// 这里只挡旧的大写短名，避免文档和 UI 里又混回两种写法。
const retiredBrandPatterns = [/MCPM/g];

// 变更日志要如实记录「改名前叫什么」，否则这段历史就被抹掉了。
// 这里豁免是有意的，不是漏写。
const brandExempt = new Set(["CHANGELOG.md"]);

const i18nFiles = [
  "src/pages/Servers.tsx",
  "src/pages/Registry.tsx",
  "src/pages/Settings.tsx",
  "src/components/servers/AddServerDialog.tsx",
  "src/components/servers/DebugDrawer.tsx",
  "src/components/servers/ServerInspector.tsx",
  "src/components/layout/Sidebar.tsx",
];

let failed = false;

for (const relative of brandFiles) {
  if (brandExempt.has(relative)) continue;
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of retiredBrandPatterns) {
    const matches = source.match(pattern);
    if (matches) {
      failed = true;
      console.error(`${relative}: contains retired brand pattern ${pattern}`);
    }
  }
}

for (const relative of i18nFiles) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("useLanguageStore")) {
    failed = true;
    console.error(`${relative}: missing useLanguageStore`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("Brand and i18n checks passed.");
