#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const pluginName = "LightroomClassicMCPServer.lrplugin";
const modulesDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Adobe",
  "Lightroom",
  "Modules"
);
const pluginDir = path.join(modulesDir, pluginName);
const infoLua = path.join(pluginDir, "Info.lua");
const bridgePort = Number.parseInt(process.env.LRC_MCP_BRIDGE_PORT ?? "58765", 10);
const bridgeHost = process.env.LRC_MCP_BRIDGE_HOST ?? "127.0.0.1";
const toolkitIdentifier = "com.yopiesuryadi.lightroomclassicmcpserver";

async function assertInstalledPlugin() {
  const stat = await fs.stat(pluginDir);
  if (!stat.isDirectory()) {
    throw new Error(`Installed plugin is not a directory: ${pluginDir}`);
  }

  const info = await fs.readFile(infoLua, "utf8");
  if (!info.includes(toolkitIdentifier)) {
    throw new Error(`Unexpected Lightroom plugin toolkit identifier in ${infoLua}`);
  }
}

function checkBridgeHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: bridgeHost,
        port: bridgePort,
        path: "/health",
        timeout: 1000
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findLightroomClassicProcesses() {
  try {
    const output = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8"
    }).trim();
    return output
      .split("\n")
      .filter((line) => line.includes("/Adobe Lightroom Classic.app/Contents/MacOS/Adobe Lightroom Classic"));
  } catch {
    return [];
  }
}

async function checkLatestStartupLog() {
  const logFile = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Adobe",
    "Lightroom",
    "lrc_console.log"
  );

  try {
    const log = await fs.readFile(logFile, "utf8");
    if (log.includes("Lightroom Classic MCP Server Bridge")) {
      console.log("Latest Lightroom startup log lists this plugin as installed.");
    } else if (log.includes("Installed Plugins:")) {
      console.log(
        "Latest Lightroom startup log does not list this plugin yet; restart Lightroom Classic or add it in Plug-in Manager."
      );
    }
  } catch {
    // The console log is optional; the installed folder check above is the source of truth.
  }
}

async function main() {
  await assertInstalledPlugin();
  console.log(`Plugin installed: ${pluginDir}`);

  const lightroomProcesses = findLightroomClassicProcesses();
  if (lightroomProcesses.length > 0) {
    console.log(`Lightroom Classic running: ${lightroomProcesses.join("; ")}`);
  } else {
    console.log("Lightroom Classic does not appear to be running.");
  }
  await checkLatestStartupLog();

  const bridgeHealthy = await checkBridgeHealth();
  if (bridgeHealthy) {
    console.log(`Bridge health OK: http://${bridgeHost}:${bridgePort}/health`);
  } else {
    console.log(
      `Bridge health not reachable at http://${bridgeHost}:${bridgePort}/health; start the MCP server before testing jobs.`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
