# Spider Media — Obsidian 自媒体发布插件

> 把 Obsidian 笔记一键发布到微信公众号、头条号等自媒体平台

## 痛点

- 写好 Markdown 笔记 → 复制到公众号编辑器 → 重新排版 → 格式全乱
- Mermaid 流程图无法直接粘贴 → 手动截图
- 代码块在不同平台样式丢失
- 图片需要逐个上传
- 每次在多个平台重复发布

## 解决方案

在 Obsidian 中直接完成**格式转换 + 内容填充**的全流程：

```
写笔记 (MD)  →  选择平台  →  一键同步  →  审查后发布
     │              │            │            │
     │         ┌─────┴────┐      │            │
     │         │ 公众号    │      │            │
     │         │ 头条号    │  自动填充         │
     │         │ 更多...   │  到平台后台      │
     │         └──────────┘      │            │
     │                           ▼            │
     │                    浏览器打开           │
     │                    内容已就绪           │
     │                    只需点击发布         │
     └─────────────────────────────────────────┘
```

## 核心特性

| 特性 | 说明 |
|------|------|
| **一键同步** | 选择平台 → 点击同步 → 浏览器自动填入内容，Review 后发布 |
| **Mermaid → 图片** | 笔记中的 Mermaid 流程图自动转为高清 PNG |
| **代码块保真** | 代码块保留格式 + 语法高亮 |
| **图片完整** | 本地图片自动处理（小图内嵌 / 大图上图床） |
| **手机阅读优化** | 默认模板适配移动端阅读体验 |
| **样式模板** | 5 套内置主题（精简绿/橙心/蓝调/雅黑/极简），支持自定义字号/颜色/间距/标题装饰/代码主题 |
| **易于扩展** | 添加新平台只需 ~300 行代码 |

## 快速开始

### 安装

1. 从 Releases 下载 `main.js`、`manifest.json`、`styles.css`
2. 在 vault 目录创建 `.obsidian/plugins/spider-media/`
3. 将下载的文件放入该目录
4. 重启 Obsidian，在设置 → 第三方插件中启用

### 使用

1. 在 Obsidian 中打开你要发布的 Markdown 笔记（这就是源 — 编辑仍在 Obsidian 自身的编辑器里完成）
2. 点击左侧 Ribbon 的 📱 图标（或执行命令"打开自媒体发布编辑器"）
3. 右侧滑出**预览面板**，自动加载当前活动笔记；切换笔记或保存修改时预览自动刷新
4. 选择目标平台与样式模板
5. 在「设置 → Spider Media」里调整字号 / 行高 / 主题色等排版参数（实时反映到预览）
6. 点击「同步到平台」 → 浏览器自动打开 → 扫码登录 → 自动跳转新建图文 → 注入正文
7. 在公众号后台审查后手动点击「发布」

## 配置

打开 Obsidian → 设置 → Spider Media。

### 通用

| 字段 | 说明 |
| --- | --- |
| **默认平台** | 打开发布视图时默认选中的平台 ID（当前仅支持 `wechat`） |
| **小图内嵌阈值 (KB)** | 小于该值的图片转 base64 直接内嵌到 HTML；大图保留原路径 |
| **默认排版参数** | 字号 / 行高 / 段间距 / 内边距 / 图片圆角 / 主题色 — 作用于预览与发布 |
| **标题装饰** | `跟随模板` / `下划线` / `描边胶囊` / `左竖条 + 渐变`，叠加到模板基础样式之上 |
| **代码块配色** | `跟随模板` / `暗色` / `浅色` / `GitHub Light` / `Dracula`，覆盖模板默认的 pre/code 配色 |
| **首行缩进** | 段落首行缩进 2em（文艺/学术风常用） |

### 样式模板（微信）

参考 [mspringjade/wechat-formatter](https://github.com/mspringjade/wechat-formatter) 的视觉体系，内置 5 套模板，可在视图顶栏切换：

| 模板 | ID | 适用场景 |
| --- | --- | --- |
| 默认精简 | `wechat-default` | 微信品牌绿，h2 底线 / h3 着色，暗色代码块 |
| 橙心 · 温暖 | `wechat-warm` | 温暖橙调，h2 左侧粗竖条 + 渐变，h3 圆角胶囊 |
| 蓝调 · 科技 | `wechat-blue` | 冷色调，h2 左短粗块，浅色 GitHub 风代码 |
| 雅黑 · 文艺 | `wechat-serif` | 宋体衬线，h2 居中带前后短杠，首行缩进、引用块仿书摘 |
| 极简 · 黑白 | `wechat-minimal` | 无主题色装饰，仅排版与字号区分层级 |

每套模板都通过 [juice](https://github.com/Automattic/juice) 把 CSS 内联到 `style=""`，发布前再叠加排版参数与可选的标题装饰 / 代码主题。最终复制到公众号编辑器的 HTML 已经不依赖 class，可被微信编辑器原样保留。

### 微信公众号

公众号自动化采用「**插件本地启动 Chrome → 用户扫码登录 → 自动跳转新建图文页面 → 调用官方 [MP_Editor JsApi](https://developers.weixin.qq.com/doc/offiaccount/MP_Editor_JsApi/mp_editor_jsapi.html) 注入正文**」的流程。任意环节失败都会自动把 HTML 复制到剪贴板兜底。

| 字段 | 是否必填 | 示例 / 说明 |
| --- | --- | --- |
| **Chrome 远程调试 URL** | 二选一 | `http://127.0.0.1:9222` — 适合手动启动 `chrome.exe --remote-debugging-port=9222 --user-data-dir=D:/chrome-mp` 后复用，免重复登录 |
| **Chrome 可执行文件路径** | 二选一 | `C:/Program Files/Google/Chrome/Application/chrome.exe` — 由 puppeteer-core 启动新实例 |
| **puppeteer-core 模块绝对路径** | **必填** | Obsidian 沙箱不能解析 bare 模块名，必须填 `puppeteer-core` 包目录的绝对路径，例如 `C:/Projects/spider-media-test/.obsidian/plugins/spider-media/node_modules/puppeteer-core`。留空则不启用自动化，发布时仅复制 HTML 到剪贴板。 |
| **自动化超时 (ms)** | 否 | 默认 30000；扫码等待固定 180s，编辑器加载固定 60s，无需此项调整 |

#### 安装 puppeteer-core

任意目录执行（不会污染 Obsidian / 仓库）：

```bash
mkdir -p C:/Projects/spider-media-test/.obsidian/plugins/spider-media
cd C:/Projects/spider-media-test/.obsidian/plugins/spider-media
npm init -y
npm install puppeteer-core
```

然后把 `node_modules/puppeteer-core` 的绝对路径填到上面的设置项。

#### 失败兜底

- 未配置 puppeteer-core 路径 / 加载失败 / Chrome 启动失败 / 扫码超时 / 编辑器 API 不可用 → 自动复制最终 HTML 到剪贴板，并弹 `Notice` 提示原因。手动粘贴到公众号编辑器同样可用（保留所有内联样式）。

## 支持平台

| 平台 | 状态 | 说明 |
|------|------|------|
| 微信公众号 | ✅ 已实现 | 内嵌 webview + MP_Editor JsApi 注入正文，自动跳转新建图文 |
| 头条号 | 🚧 实验性 | 内嵌 webview + ProseMirror paste 注入正文 / 标题（接口未稳定，DOM 可能变更） |
| 知乎 | 📝 待定 | - |
| 小红书 | 📝 待定 | - |
| CSDN | 📝 待定 | - |

## 架构设计

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)

```
obsidian-media-publisher/
├── src/
│   ├── main.ts                  # 插件入口
│   ├── core/                    # 核心管线
│   │   ├── MarkdownParser.ts    # Markdown 解析
│   │   ├── ImageManager.ts      # 图片处理
│   │   └── MermaidConverter.ts  # Mermaid 转换
│   ├── platforms/               # 平台适配器
│   │   ├── base/                # 抽象基类
│   │   ├── wechat/              # 公众号
│   │   └── toutiao/             # 头条号
│   ├── formatters/              # 格式化工具
│   ├── templates/               # 样式模板
│   ├── automator/               # 浏览器自动化
│   ├── ui/                      # 编辑器 UI
│   └── settings/                # 配置页
├── manifest.json
├── package.json
├── tsconfig.json
└── styles.css
```

## 技术栈

- **语言**: TypeScript 5
- **运行时**: Obsidian API (Electron/Chromium)
- **MD 解析**: marked 17
- **样式内联**: juice
- **自动化**: puppeteer-core
- **构建**: esbuild

## 开发

```bash
# 克隆
git clone https://github.com/your-username/spider-media.git

# 安装
npm install

# 开发 (watch 模式)
npm run dev

# 构建
npm run build
```

## License

MIT
