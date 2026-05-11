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
| **样式模板** | 多套模板可选，支持自定义字号/颜色/间距 |
| **易于扩展** | 添加新平台只需 ~300 行代码 |

## 快速开始

### 安装

1. 从 Releases 下载 `main.js`、`manifest.json`、`styles.css`
2. 在 vault 目录创建 `.obsidian/plugins/spider-media/`
3. 将下载的文件放入该目录
4. 重启 Obsidian，在设置 → 第三方插件中启用

### 使用

1. 打开一篇 Markdown 笔记
2. 点击左侧 Ribbon 的 📱 图标（或执行命令 "打开自媒体发布编辑器"）
3. 右侧滑出编辑器 → 自动加载当前笔记
4. 选择目标平台和样式模板
5. 预览效果，微调格式参数
6. 点击「同步到公众号」
7. 浏览器自动打开并填入内容 → 审查后手动发布

## 支持平台

| 平台 | 状态 | 说明 |
|------|------|------|
| 微信公众号 | ✅ 规划中 | 支持图文消息，内联样式完整 |
| 头条号 | 🔜 规划中 | 支持图文 |
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
