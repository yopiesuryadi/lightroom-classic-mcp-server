#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePluginName = "lightroom-classic-mcp-server.lrplugin";
const installedPluginName = "LightroomClassicMCPServer.lrplugin";
const sourcePlugin = path.join(repoRoot, sourcePluginName);
const modulesDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Adobe",
  "Lightroom",
  "Modules"
);
const targetPlugin = path.join(modulesDir, installedPluginName);
const legacyPlugin = path.join(modulesDir, "LightroomMCP.lrplugin");
const previousRepoNamedInstall = path.join(modulesDir, sourcePluginName);
const toolkitIdentifier = "com.yopiesuryadi.lightroom-classic-mcp-server";
const force = process.argv.includes("--force");

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function isDirectory(value) {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function readInfoLua(pluginPath) {
  try {
    return fs.readFileSync(path.join(pluginPath, "Info.lua"), "utf8");
  } catch {
    return "";
  }
}

function backupPath() {
  const stamp = new Date().toISOString().replaceAll(":", "").replace(/\..+$/, "");
  return path.join(modulesDir, `${installedPluginName}.backup-${stamp}`);
}

if (!isDirectory(sourcePlugin)) {
  fail(`source plugin folder not found: ${sourcePlugin}`);
}

fs.mkdirSync(modulesDir, { recursive: true });

if (isDirectory(legacyPlugin)) {
  console.log(`Preserving existing legacy plugin: ${legacyPlugin}`);
}

if (isDirectory(previousRepoNamedInstall)) {
  console.log(
    `Found older repo-named install at ${previousRepoNamedInstall}; leaving it untouched.`
  );
}

if (fs.existsSync(targetPlugin)) {
  if (!isDirectory(targetPlugin)) {
    fail(`target exists but is not a plugin folder: ${targetPlugin}`);
  }

  const existingInfo = readInfoLua(targetPlugin);
  if (!force && !existingInfo.includes(toolkitIdentifier)) {
    fail(
      [
        `target plugin folder already exists and does not look like this project: ${targetPlugin}`,
        "Re-run with `npm run install:plugin -- --force` only if you intentionally want to replace it."
      ].join("\n")
    );
  }

  const backup = backupPath();
  console.log(`Moving existing ${installedPluginName} installation to ${backup}`);
  fs.renameSync(targetPlugin, backup);
}

fs.cpSync(sourcePlugin, targetPlugin, {
  recursive: true,
  errorOnExist: true,
  force: false,
  preserveTimestamps: true
});

console.log(`Installed ${sourcePluginName} to ${targetPlugin}`);
console.log("Restart Lightroom Classic, or enable/reload the plugin in File > Plug-in Manager.");
