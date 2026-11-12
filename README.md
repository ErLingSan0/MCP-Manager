# MCP Manager

**一个面向多智能体的 MCP Server 可视化控制中心。**

[English](README.en.md) · [架构说明](docs/architecture.md) · [支持的智能体](docs/supported-agents.md) · [贡献指南](CONTRIBUTING.md)

MCP Server 很强，但配置分散在不同编辑器、CLI、桌面应用、全局文件和项目文件里。MCP Manager 把这些碎片化配置收进一个桌面应用：在一个地方安装、查看、同步和调试 MCP Server，不必记住每个智能体自己的配置格式。

当前版本（v0.5）重新设计了整套界面，并精简了信息架构：

- 以 **服务目录 + 详情检查器** 作为唯一主工作台
- 移除重复的看板页和按智能体聚合的配置页
- 把调试能力收进检查器里的调试抽屉
- 全新的暖白 / 石墨 / 鼠尾草绿视觉系统

## 核心功能

### 一次添加，写入多个智能体

从远程 URL、npm 包、本地命令或本地路径添加 MCP Server。选择全局或项目范围，再勾选目标智能体，MCP Manager 会按目标格式写入 JSON、YAML 或 TOML 配置。

### 服务目录与实时健康状态

主界面按服务聚合：搜索、按传输类型 / 状态 / 范围筛选，查看它被哪些智能体使用。检查器展示运行状态、CPU / 内存、服务源、配置路径，并允许逐个智能体开关。

- 远程服务通过短 HTTP 探测展示可达性
- 本地 stdio 服务展示进程 PID、运行时长和资源占用
- 未安装的智能体也可以预先写入配置

### Registry 发现

在应用内搜索 add-mcp registry 和官方 MCP registry，元数据可预填远程地址、包名、请求头、环境变量和运行参数。

### 从代码仓库直接安装

贴一个 GitHub / GitLab / Gitee 仓库地址，MCP Manager 会判断安装方式，并把要执行的命令完整展示出来后再动手。优先使用 Release 预编译包（下载 + sha256 校验 + 解包，不执行脚本）；没有预编译包时回退到源码安装（浅克隆 + 安装依赖，默认关闭 postinstall）。Python 项目会单独创建虚拟环境。

### 调试 stdio Server

在检查器中打开调试抽屉，启动受管 stdio 进程，查看 stdout / stderr 实时日志，观察 CPU 与内存，并通过 JSON-RPC 输入框发送消息。

### 中英双语

默认中文，可在侧边栏随时切换为英文，选择会被记住。

## 快速开始

请先安装 pnpm、Rust 和 Tauri 对应的系统依赖。

```bash
pnpm install
pnpm tauri dev
```

构建桌面应用：

```bash
pnpm tauri build
```

提交前建议运行：

```bash
pnpm run typecheck
pnpm run build
cd src-tauri && cargo test
```

> 也可以直接 `pnpm dev` 在浏览器中预览界面。非 Tauri 环境会自动使用演示数据，不会读写本机配置。

## 支持的智能体

当前支持 28 个智能体目标，包括 Claude Code、Codex、Cursor、Gemini CLI、GitHub Copilot CLI、VS Code、Claude Desktop、Cline、Goose、Kiro、OpenCode、Windsurf、Zed、DeepSeek Harness、TRAE、Qoder、Kimi Code、WorkBuddy 等。

完整配置路径、项目级支持、传输类型和可选字段见 [docs/supported-agents.md](docs/supported-agents.md)。

## 文档

- [架构说明](docs/architecture.md)：源码解析、智能体转换、Registry 流程、进程调试与新前端结构
- [支持的智能体](docs/supported-agents.md)：配置路径、传输类型、项目级配置和可选字段
- [发布指南](docs/release.md)：打包、GitHub CLI 命令和 release note 维护方式
- [贡献指南](CONTRIBUTING.md)：开发环境、检查命令和 PR 要求
- [安全策略](SECURITY.md)：配置写入、命令执行和敏感信息相关问题的报告方式
- [更新日志](CHANGELOG.md)：版本记录

## 安全边界

MCP Manager 会写入本机智能体配置文件，也可以在调试时启动本地 stdio Server 命令，还可以从代码仓库下载安装服务。提交项目级配置前请检查生成内容，不要把密钥写入共享配置，只运行你信任的 MCP Server。Python 项目尤其要注意：`pip install` 必然要执行仓库自己的构建后端，所以只装你信任的仓库。

## 技术栈

Tauri 2、React 19、TypeScript、Zustand、Tailwind CSS 4、Vite、Rust、Tokio 和 reqwest。

## License

[MIT License](LICENSE)
