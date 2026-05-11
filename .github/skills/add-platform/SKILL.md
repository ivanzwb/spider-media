---
name: add-platform
description: 'Scaffold a new self-media PlatformAdapter for Spider Media (WeChat, Toutiao, Zhihu, Xiaohongshu, CSDN, etc). Use when the user asks to add/support/integrate a new platform, create a new adapter, register a publisher, or extend Spider Media to a new 自媒体/公众号/平台. Generates src/platforms/<id>/ directory, formatter + automator + templates skeleton, registers it in src/main.ts, and updates the README support table.'
argument-hint: '<platform-id> [Display Name]   e.g. zhihu "知乎"'
---

# Add Platform Adapter

Standard workflow for adding a new publishing target to Spider Media. Keeps every adapter symmetrical so the Core Pipeline → Formatter → Automator contract stays predictable.

## When to Use

- "新增 X 平台" / "支持 X 平台" / "add support for X"
- "创建一个 PlatformAdapter" / "scaffold a publisher for X"
- Updating [README.md](../../../README.md) 支持平台 table from 📝/🔜 → ✅

## Inputs

- **platform-id**: lowercase, hyphenated, ASCII (e.g. `zhihu`, `xiaohongshu`). Used for folder name, settings key, command id.
- **Display name**: human-readable Chinese / English label shown in UI and README.

If either is missing, ask the user before scaffolding.

## Procedure

1. **Read the contract**
   - [ARCHITECTURE.md §3.3 Platform Adapter 体系](../../../ARCHITECTURE.md#33-platform-adapter-体系) for the `PlatformAdapter` interface.
   - [ARCHITECTURE.md §4 扩展新平台](../../../ARCHITECTURE.md#4-扩展新平台) for the canonical checklist.
   - [AGENTS.md](../../../AGENTS.md) for esbuild external + puppeteer-core caveat.

2. **Create folder layout** under `src/platforms/<platform-id>/`:
   ```
   src/platforms/<platform-id>/
   ├── index.ts            // exports the adapter instance
   ├── adapter.ts          // implements PlatformAdapter
   ├── formatter.ts        // marked extensions + juice CSS for this platform
   └── templates/
       └── default.ts      // default template (HTML skeleton + CSS)
   ```
   Plus a webview view at `src/ui/<PlatformId>BrowserView.ts` mirroring `WeChatBrowserView.ts` / `ToutiaoBrowserView.ts`.
   If `src/platforms/base/` (shared types) does not yet exist, create it first with the `PlatformAdapter`, `PlatformConfig`, and `PublishCredentials` types per ARCHITECTURE.md §3.3.

3. **Implement the adapter skeleton**
   - `meta`: `{ id: '<platform-id>', name: '<Display Name>', icon, color, isDesktopOnly: true }`
   - `format(md, template, tweaks)`: delegate to `formatter.ts` (marked extensions → juice).
   - `publish(html, title, credentials)`: returns a fallback `PublishResult` ("请使用嵌入式<平台>浏览器发布"). Real publishing is done by the embedded `<webview>` view, not this method.
   - `getTemplates()`: return templates from `./templates/`.

4. **Register in `src/main.ts`**
   ```ts
   import { <platformId>Adapter } from "@/platforms/<platform-id>";
   import { <PlatformId>BrowserView, VIEW_TYPE_<PLATFORM>_BROWSER } from "@/ui/<PlatformId>BrowserView";
   // inside onload():
   this.registerView(VIEW_TYPE_<PLATFORM>_BROWSER, (leaf) => new <PlatformId>BrowserView(leaf, this));
   this.platforms.set(adapter.meta.id, adapter);
   this.addCommand({ id: "open-<platform-id>-embedded-browser", name: "打开嵌入式<平台>浏览器", callback: () => void this.open<PlatformId>Browser() });
   ```
   Also wire `PlatformEditorView.publish()` to route to the new webview when `meta.id` matches.

5. **Verify**
   - Run `npm run build` — must pass `tsc -noEmit` and esbuild bundle.
   - No new heavy runtime dependency required (we no longer use puppeteer-core).

6. **Update [README.md](../../../README.md)**
   In the "支持平台" table, add or flip the row to ✅/🔜 with a one-line capability summary. Keep alphabetical/中文 ordering consistent with existing rows.

7. **Do not** add unit tests, mobile-only code paths, or any direct top-level `import 'puppeteer-core'`. Puppeteer is no longer used — publishing flows must run inside the embedded `<webview>`.

## Definition of Done

- `src/platforms/<platform-id>/` exists with adapter / formatter / templates / index.
- `src/ui/<PlatformId>BrowserView.ts` registered + command added.
- Adapter is registered and discoverable; `PlatformEditorView.publish()` routes to the new webview.
- `npm run build` is green.
- README support table reflects new status.
- No `as any` / `@ts-ignore` introduced (see [AGENTS.md](../../../AGENTS.md) TypeScript 规范).
