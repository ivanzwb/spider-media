<!-- 感谢贡献！请先阅读 AGENTS.md / ARCHITECTURE.md -->

## 改动概要

<!-- 一句话概括做了什么 -->

## 改动类型

- [ ] Bug fix（不破坏现有 API）
- [ ] 新功能（不破坏现有 API）
- [ ] 破坏性变更（行为/接口改动）
- [ ] 文档 / 构建 / CI

## 影响平台

- [ ] 微信公众号
- [ ] 头条号
- [ ] 编辑器视图（PlatformEditorView）
- [ ] 核心管线（MarkdownParser / Mermaid / Image / PostProcessor）

## 自检清单

- [ ] `npm run build` 通过（`tsc -noEmit` 无 error）
- [ ] `npm run lint` 通过
- [ ] 没有引入 `as any` / `@ts-ignore` / `@ts-expect-error`
- [ ] 修改/新增的代码遵循 [AGENTS.md](../AGENTS.md) 模块划分准则（单文件 ≤ 300 行）
- [ ] 如新增 npm 依赖，已确认是否需要加入 esbuild `external`
- [ ] 文档（README / ARCHITECTURE）已同步更新

## 复现 / 测试方式

<!-- 在哪个平台、哪个笔记、点击哪些按钮验证通过 -->

## 截图（可选）
