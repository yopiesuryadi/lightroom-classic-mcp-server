import os from "node:os";
import path from "node:path";

const home = os.homedir();

function expandHome(value: string): string {
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  return value;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type ServerConfig = {
  bridgeHost: string;
  bridgePort: number;
  inputDir: string;
  outputDir: string;
  stateDir: string;
  logFile: string;
  lockFile: string;
};

export function loadConfig(): ServerConfig {
  const stateDir = expandHome(
    process.env.LRC_MCP_STATE_DIR ?? "~/.lightroom-classic-mcp-server"
  );

  return {
    bridgeHost: process.env.LRC_MCP_BRIDGE_HOST ?? "127.0.0.1",
    bridgePort: intFromEnv("LRC_MCP_BRIDGE_PORT", 58765),
    inputDir: expandHome(process.env.LRC_MCP_INPUT_DIR ?? "~/Pictures"),
    outputDir: expandHome(process.env.LRC_MCP_OUTPUT_DIR ?? "~/Documents/leica"),
    stateDir,
    logFile: expandHome(process.env.LRC_MCP_LOG_FILE ?? path.join(stateDir, "server.log")),
    lockFile: expandHome(process.env.LRC_MCP_LOCK_FILE ?? path.join(stateDir, "server.lock"))
  };
}
