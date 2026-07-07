#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { loadConfig } from "../dist/config.js";
import { startPluginBridge } from "../dist/http.js";
import { JobStore } from "../dist/jobs.js";
import { Logger } from "../dist/logger.js";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function parsePositiveInt(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function waitForBridgeListen(server) {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function waitForJob(jobs, job, timeoutMs) {
  const started = Date.now();
  let lastStatus = job.status;
  let lastMessage = "";

  while (Date.now() - started < timeoutMs) {
    const current = jobs.get(job.id);
    if (!current) throw new Error(`Job disappeared: ${job.id}`);

    const message = current.progress?.message ?? "";
    if (current.status !== lastStatus || message !== lastMessage) {
      console.log(`${current.kind} ${current.id}: ${current.status}${message ? ` - ${message}` : ""}`);
      lastStatus = current.status;
      lastMessage = message;
    }

    if (terminalStatuses.has(current.status)) return current;
    await sleep(1000);
  }

  throw new Error(
    `Timed out waiting for ${job.kind} job ${job.id}. Lightroom Classic may need the plugin reloaded in Plug-in Manager.`
  );
}

async function runJob(jobs, kind, request, timeoutMs) {
  const job = jobs.create(kind, request);
  console.log(`queued ${kind} job: ${job.id}`);
  const completed = await waitForJob(jobs, job, timeoutMs);
  if (completed.status !== "succeeded") {
    throw new Error(`${kind} failed: ${completed.error ?? JSON.stringify(completed.result ?? completed)}`);
  }
  return completed;
}

async function main() {
  const input = argValue("--input");
  if (!input) {
    throw new Error("Usage: npm run smoke:local -- --input /absolute/path/to/photo.jpg");
  }

  const inputPath = expandHome(input);
  if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
    throw new Error(`Input photo does not exist or is not a file: ${inputPath}`);
  }

  const config = loadConfig();
  const outputDir = expandHome(argValue("--output-dir") ?? config.outputDir);
  const timeoutMs = parsePositiveInt(argValue("--timeout-ms"), 120000);
  const collection = argValue("--collection") ?? `Lightroom MCP Smoke ${new Date().toISOString()}`;

  fs.mkdirSync(outputDir, { recursive: true });

  const logger = new Logger(config.logFile);
  const jobs = new JobStore();
  const bridge = startPluginBridge(config, jobs, logger);
  await waitForBridgeListen(bridge);

  console.log(`bridge listening: http://${config.bridgeHost}:${config.bridgePort}`);
  console.log(`input: ${inputPath}`);
  console.log(`output_dir: ${outputDir}`);
  console.log(`collection: ${collection}`);

  try {
    const importJob = await runJob(
      jobs,
      "import",
      {
        paths: [inputPath],
        collection
      },
      timeoutMs
    );

    const editJob = await runJob(
      jobs,
      "edit",
      {
        target: "last_import",
        operation: "apply_develop_settings",
        parameters: {
          exposure: 0.15,
          contrast: 8,
          vibrance: 10
        }
      },
      timeoutMs
    );

    const beforeExport = new Set(
      fs.existsSync(outputDir) ? fs.readdirSync(outputDir).map((name) => path.join(outputDir, name)) : []
    );

    const exportJob = await runJob(
      jobs,
      "export",
      {
        output_dir: outputDir
      },
      timeoutMs
    );

    const exportedFiles = Array.isArray(exportJob.result?.files) ? exportJob.result.files : [];
    const existingExportedFiles = exportedFiles.filter((file) => {
      return typeof file === "string" && fs.existsSync(file) && fs.statSync(file).isFile();
    });
    const newOutputFiles = fs
      .readdirSync(outputDir)
      .map((name) => path.join(outputDir, name))
      .filter((file) => !beforeExport.has(file));

    if (existingExportedFiles.length === 0 && newOutputFiles.length === 0) {
      throw new Error(`Export reported success but no output file was found in ${outputDir}`);
    }

    console.log("smoke workflow succeeded");
    console.log(
      JSON.stringify(
        {
          import: importJob.result,
          edit: editJob.result,
          export: exportJob.result,
          verified_output_files: existingExportedFiles.length > 0 ? existingExportedFiles : newOutputFiles
        },
        null,
        2
      )
    );
  } finally {
    await new Promise((resolve) => bridge.close(resolve));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
