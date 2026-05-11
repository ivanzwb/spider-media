---
description: "Run the Spider Media Obsidian plugin release checklist: bump version, build, verify release artifacts, draft GitHub Release notes."
argument-hint: "patch | minor | major"
agent: "agent"
---

You are releasing a new version of the Spider Media Obsidian plugin. Follow this checklist in order. Stop and report to the user on the first failure — do not skip steps.

Inputs:
- Bump level: `${input:bumpLevel:patch|minor|major}` (defaults to `patch` if not provided).

## Steps

1. **Pre-flight**
   - Confirm `git status` is clean. If not, ask the user before continuing.
   - Read current version from [manifest.json](../../manifest.json) and [package.json](../../package.json); confirm they match.

2. **Lint & build**
   - Run `npm run lint` — must pass.
   - Run `npm run build` — must pass `tsc -noEmit -skipLibCheck` and produce `main.js`.

3. **Bump version**
   - Run `npm version <bumpLevel>` (this triggers [version-bump.mjs](../../version-bump.mjs) and stages `manifest.json` + `versions.json`).
   - Verify all three of `package.json`, `manifest.json`, `versions.json` reflect the new version.

4. **Verify release artifacts**
   - Confirm exactly these files exist at the repo root and are non-empty: `main.js`, `manifest.json`, `styles.css` (per [AGENTS.md](../../AGENTS.md) 必读约束).
   - Confirm `main.js.map` is NOT being shipped (production build disables source maps — see [esbuild.config.mjs](../../esbuild.config.mjs)).
   - Confirm `manifest.json` `minAppVersion` is satisfied by the latest Obsidian release; flag if outdated.

5. **Draft GitHub Release notes**
   - Collect commit subjects since the previous tag (`git log <prev-tag>..HEAD --pretty=format:'- %s'`).
   - Group into: `### Features`, `### Fixes`, `### Internal`. Use commit prefix heuristics (`feat:`, `fix:`, `chore:`/`refactor:`/`docs:` → Internal).
   - Output the draft as a Markdown block ready to paste into the GitHub Release body. Include an "Assets" section listing the three release files.

6. **Final report to user** — summarize:
   - Old version → new version
   - Whether lint / build passed
   - Path to the three artifacts
   - Draft release notes
   - Remaining manual actions: `git push && git push --tags`, create the GitHub Release and upload the three artifacts.

## Constraints

- Do NOT run `git push`, `git push --tags`, or create the GitHub Release yourself — these are user-confirmation actions per the operational safety policy.
- Do NOT modify source files in `src/` during release.
- Do NOT bypass `npm version` to hand-edit version fields.
