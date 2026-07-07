#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { startPluginBridge } from "./http.js";
import { JobStore } from "./jobs.js";
import { acquireSingleProcessLock } from "./lock.js";
import { Logger } from "./logger.js";
import { startMcpServer } from "./mcp.js";

const config = loadConfig();
const logger = new Logger(config.logFile);

try {
  acquireSingleProcessLock(config.lockFile);
  logger.info("single-process lock acquired", { lock_file: config.lockFile });
} catch (error) {
  logger.error("failed to acquire single-process lock", {
    error: error instanceof Error ? error.message : String(error),
    lock_file: config.lockFile
  });
  process.exit(1);
}

const jobs = new JobStore();
logger.info("starting Lightroom Classic MCP server", {
  bridge_host: config.bridgeHost,
  bridge_port: config.bridgePort,
  output_dir: config.outputDir,
  state_dir: config.stateDir
});
const bridge = startPluginBridge(config, jobs, logger);

bridge.on("error", (error) => {
  logger.error("Lightroom plugin bridge failed", { error: error.message });
  process.exit(1);
});

startMcpServer(config, jobs, logger).catch((error: unknown) => {
  logger.error("MCP server failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
