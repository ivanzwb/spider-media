# Agents.md — Spider Media

## 项目概览

Obsidian 插件，将 Markdown 笔记一键发布到微信公众号、头条号等自媒体平台。

## 关键约束

- **目标**: Obsidian Community Plugin (TypeScript → esbuild → bundled main.js)
- **入口**: `src/main.ts` → 编译为 `main.js`
- **发布制品**: `main.js`, `manifest.json`, `styles.css`
- **桌面端专用**: `isDesktopOnly: true` (依赖 puppeteer-core)
- **不要提交构建产物**: `node_modules/`, `main.js`, `main.js.map` 不入库

## 核心架构

四层架构: Plugin UI → Core Pipeline → Platform Formatter → Browser Automator

详见 `ARCHITECTURE.md`

## 平台适配器

每个平台实现 `PlatformAdapter` 接口:
- `format(md, template, tweaks)`: MD → 平台 HTML
- `publish(html, title, credentials)`: 浏览器自动化填充
- `getTemplates()`: 返回可用模板

## 类型规则

- `strict: true` 严格模式
- 禁止 `as any` / `@ts-ignore` / `@ts-expect-error`
- 使用 `async/await` 替代 Promise 链

## 工作规范

- 保持 `main.ts` 最小化，只做生命周期和注册。所有业务逻辑委托到独立模块
- 超过 200-300 行的文件拆分为子模块
- 每个文件单一职责
- 使用 `this.register*` 注册所有需要清理的资源
- 使用 `loadData()`/`saveData()` 持久化设置
- 发布前务必运行 LSP diagnostics 确认无错误
