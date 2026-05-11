/**
 * version-bump.mjs — Obsidian release version bump script
 *
 * Usage:
 *   npm version patch   # auto-run via "version" script in package.json
 *   node version-bump.mjs <version>
 *
 * Updates manifest.json version and versions.json minAppVersion mapping.
 */

import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.argv[2] || process.env.npm_package_version;
if (!targetVersion) {
  console.error("Usage: node version-bump.mjs <version>");
  process.exit(1);
}

// Read manifest.json
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;

// Update manifest.json version
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`  manifest.json → ${targetVersion}`);

// Update versions.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
console.log(`  versions.json → ${targetVersion}: ${minAppVersion}`);
