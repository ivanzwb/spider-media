# AGENTS.md — Spider Media

Obsidian 桌面插件：将 Markdown 笔记一键发布到微信公众号、头条号等自媒体平台。
项目背景与用户视角见 [README.md](README.md)；完整架构、数据流、模块设计见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 项目状态

骨架阶段：`src/` 目录尚未创建。新建源码时请遵循 [README.md](README.md#架构设计) 中规划的目录结构（`src/main.ts`、`src/core/`、`src/platforms/`、`src/automator/`、`src/ui/`、`src/settings/`）。

## 构建与校验

| 场景 | 命令 |
| --- | --- |
| Watch 开发 | `npm run dev` |
| 生产构建（含 tsc 类型检查） | `npm run build` |
| Lint | `npm run lint` |
| 版本号更新 | `npm version <patch\|minor\|major>` |

构建配置见 [esbuild.config.mjs](esbuild.config.mjs)：入口 `src/main.ts` → 产物 `main.js`，CJS / ES2022。

## 必读约束

- **Obsidian 插件目标**：通过 `obsidian` API 工作；`obsidian`、`electron`、`@codemirror/*`、Node builtins、`puppeteer-core` 全部声明为 esbuild external（见 [esbuild.config.mjs](esbuild.config.mjs#L17-L33)），不要打包进 `main.js`。
- **桌面端专用**：[manifest.json](manifest.json) 中 `isDesktopOnly: true`。不要新增依赖移动端 API 的代码。
- **puppeteer-core 沙箱限制**：在 Obsidian 内不可直接运行；按 [esbuild.config.mjs](esbuild.config.mjs#L31) 注释，需延迟加载并实现「失败兜底到剪贴板」路径。
- **不入库的产物**：`node_modules/`、`main.js`、`main.js.map`。请勿提交。
- **发布制品**：仅 `main.js`、`manifest.json`、`styles.css` 三个文件。

## TypeScript 规范（[tsconfig.json](tsconfig.json)）

- `strict: true`，`noUnusedLocals`、`noUnusedParameters` 均开启；提交前确保零 LSP diagnostics。
- 禁止 `as any` / `@ts-ignore` / `@ts-expect-error`。需要逃生时优先抽出窄类型或 `unknown` + type guard。
- 路径别名 `@/*` → `src/*`（已在 tsconfig 配置；esbuild 默认不解析 paths，新增使用前先验证打包通过）。
- 异步统一使用 `async/await`，避免裸 Promise 链。

## 模块划分准则

- `src/main.ts` 仅做生命周期、命令、视图、设置注册；业务逻辑下沉到对应模块。
- 单文件 200–300 行为软上限，超出请拆子模块；保持单一职责。
- 所有需要清理的资源走 `this.register*`（事件、视图、interval 等），避免 `onunload` 时泄漏。
- 设置持久化使用 `loadData()` / `saveData()`。

## 平台适配器接口

每个平台实现 `PlatformAdapter`（详见 [ARCHITECTURE.md §3.3](ARCHITECTURE.md#33-platform-adapter-体系)）：

- `format(md, template, tweaks)`：MD → 平台 HTML（marked 扩展 + juice 内联 CSS）
- `publish(html, title, credentials)`：浏览器自动化填充
- `getTemplates()`：返回可用模板

新增平台时同步更新 [README.md](README.md#支持平台) 状态表。

## AI 代理工作流提示

- 新建源码时先创建 `src/main.ts` 桩，再增量补全 core / 平台模块；每步以 `npm run build` 验证类型与打包。
- 修改格式化或模板逻辑前阅读 [ARCHITECTURE.md §3.4](ARCHITECTURE.md#34-markdown-格式化管线) 中的数据流。
- 新增 npm 依赖时检查是否需要加入 esbuild `external` 列表（Obsidian / Node builtin / 重型运行时类需排除）。
