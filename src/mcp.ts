import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import type { JobStore } from "./jobs.js";
import type { Logger } from "./logger.js";

function jsonText(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }]
  };
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function stageLightroomImportPath(input: string): string {
  const inputPath = expandHome(input);
  const documentsPrefix = path.join(os.homedir(), "Documents") + path.sep;
  if (!inputPath.startsWith(documentsPrefix)) return inputPath;

  const stageDir = path.join(os.homedir(), "Pictures", "Lightroom", "MCP Imports");
  fs.mkdirSync(stageDir, { recursive: true });
  const parsed = path.parse(inputPath);
  let target = path.join(stageDir, parsed.base);
  if (fs.existsSync(target)) {
    const stamp = new Date().toISOString().replaceAll(":", "").replace(/\..+$/, "");
    target = path.join(stageDir, `${parsed.name}-${stamp}${parsed.ext}`);
  }
  fs.copyFileSync(inputPath, target);
  return target;
}

export async function startMcpServer(
  config: ServerConfig,
  jobs: JobStore,
  logger: Logger
): Promise<void> {
  const server = new McpServer({
    name: "lightroom-classic-mcp-server",
    version: "0.1.0"
  });

  server.tool(
    "start_import",
    "Queue a Lightroom Classic import job and return immediately with a job_id.",
    {
      paths: z.array(z.string()).min(1).describe("Files or folders to import into Lightroom Classic."),
      collection: z.string().optional().describe("Optional collection name to add imported photos to."),
      move_to: z
        .string()
        .optional()
        .describe("Optional destination folder for Lightroom's import move/copy flow.")
    },
    async (request) => {
      const stagedRequest = { ...request, paths: request.paths.map(stageLightroomImportPath) };
      const job = jobs.create("import", stagedRequest);
      logger.info("queued import job", { job_id: job.id, paths: request.paths.length });
      return jsonText({
        job_id: job.id,
        status: job.status,
        message: "Import queued. Poll job_status until Lightroom Classic reports completion."
      });
    }
  );

  server.tool(
    "start_export",
    "Queue a Lightroom Classic export job and return immediately with a job_id.",
    {
      collection: z.string().optional().describe("Collection to export from."),
      selected_only: z.boolean().default(false).describe("Export current Lightroom selection only."),
      output_dir: z.string().default(config.outputDir).describe("Export destination folder."),
      preset: z.string().optional().describe("Reserved for future Lightroom export preset support."),
      export_settings: z
        .record(z.unknown())
        .optional()
        .describe("Optional advanced Lightroom export settings table override.")
    },
    async (request) => {
      const job = jobs.create("export", request);
      logger.info("queued export job", { job_id: job.id, output_dir: request.output_dir });
      return jsonText({
        job_id: job.id,
        status: job.status,
        output_dir: request.output_dir
      });
    }
  );

  server.tool(
    "start_edit_tracking",
    "Queue a Lightroom-side non-destructive develop settings job.",
    {
      target: z
        .string()
        .describe("Target understood by the plugin: selection, selected, last_import, or last_imported."),
      collection: z.string().optional().describe("Optional top-level collection name to edit."),
      operation: z
        .string()
        .describe("Use apply_develop_settings, apply_settings, or apply_preset."),
      parameters: z
        .record(z.unknown())
        .default({})
        .describe(
          "Develop settings object. Supported keys include exposure, contrast, highlights, shadows, whites, blacks, texture, clarity, dehaze, vibrance, and saturation."
        )
    },
    async (request) => {
      const job = jobs.create("edit", request);
      logger.info("queued edit job", { job_id: job.id, operation: request.operation });
      return jsonText({
        job_id: job.id,
        status: job.status
      });
    }
  );

  server.tool(
    "job_status",
    "Get the current status of a queued Lightroom Classic job.",
    {
      job_id: z.string()
    },
    async ({ job_id }) => {
      const job = jobs.get(job_id);
      if (!job) return jsonText({ error: "job not found", job_id });
      return jsonText(job);
    }
  );

  server.tool(
    "job_result",
    "Get the result for a completed Lightroom Classic job.",
    {
      job_id: z.string()
    },
    async ({ job_id }) => {
      const job = jobs.get(job_id);
      if (!job) return jsonText({ error: "job not found", job_id });
      return jsonText({
        job_id: job.id,
        status: job.status,
        result: job.result ?? null,
        completed_at: job.completed_at ?? null
      });
    }
  );

  server.tool(
    "job_error",
    "Get the error message for a failed Lightroom Classic job.",
    {
      job_id: z.string()
    },
    async ({ job_id }) => {
      const job = jobs.get(job_id);
      if (!job) return jsonText({ error: "job not found", job_id });
      return jsonText({
        job_id: job.id,
        status: job.status,
        error: job.error ?? null,
        completed_at: job.completed_at ?? null
      });
    }
  );

  server.tool(
    "list_jobs",
    "List recent Lightroom Classic jobs.",
    {
      limit: z.number().int().min(1).max(200).default(50)
    },
    async ({ limit }) => jsonText({ jobs: jobs.list(limit) })
  );

  server.tool(
    "cancel_job",
    "Cancel a queued or running Lightroom Classic job.",
    {
      job_id: z.string()
    },
    async ({ job_id }) => {
      const job = jobs.cancel(job_id);
      if (!job) return jsonText({ error: "job not found", job_id });
      logger.warn("job cancelled", { job_id });
      return jsonText(job);
    }
  );

  server.tool("server_config", "Show effective non-secret server configuration.", {}, async () =>
    jsonText({
      bridge_host: config.bridgeHost,
      bridge_port: config.bridgePort,
      input_dir: config.inputDir,
      output_dir: config.outputDir,
      state_dir: config.stateDir,
      log_file: config.logFile,
      lock_file: config.lockFile
    })
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP stdio server connected");
}
