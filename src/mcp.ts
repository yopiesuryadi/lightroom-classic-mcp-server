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

const maxInlinePreviewBytes = 3_500_000;
const maxInlinePreviewImages = 4;

function previewPathsFromResult(result: Record<string, unknown> | undefined): string[] {
  if (!result) return [];
  const paths: string[] = [];
  if (Array.isArray(result.previews)) {
    for (const preview of result.previews) {
      if (
        typeof preview === "object" &&
        preview !== null &&
        typeof (preview as Record<string, unknown>).path === "string"
      ) {
        paths.push((preview as Record<string, unknown>).path as string);
      }
    }
  }
  if (paths.length === 0 && typeof result.preview_path === "string") {
    paths.push(result.preview_path);
  }
  return paths;
}

function inlinePreviewImages(
  result: Record<string, unknown> | undefined
): Array<{ type: "image"; data: string; mimeType: string }> {
  const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
  for (const previewPath of previewPathsFromResult(result).slice(0, maxInlinePreviewImages)) {
    try {
      const stat = fs.statSync(previewPath);
      if (!stat.isFile() || stat.size > maxInlinePreviewBytes) continue;
      images.push({
        type: "image",
        data: fs.readFileSync(previewPath).toString("base64"),
        mimeType: "image/jpeg"
      });
    } catch {
      // Preview file may already be cleaned up; the path in the result is still reported.
    }
  }
  return images;
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
          "Develop settings object. Supported keys include exposure, contrast, highlights, shadows, whites, blacks, texture, clarity, dehaze, vibrance, saturation, temperature, tint, black_white/grayscale (boolean ConvertToGrayscale), vignette (PostCropVignetteAmount), grain/grain_amount, grain_size, and grain_frequency."
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
    "get_preview",
    "Queue a fast, low-resolution sRGB JPEG render of the current develop state for AI visual inspection. Returns a job_id immediately (Lightroom renders asynchronously); poll job_status, then call job_result to receive absolute preview file paths plus the preview image content inline.",
    {
      target: z
        .string()
        .optional()
        .describe(
          "Photo target understood by the plugin: selection, selected, last_import, or last_imported. Defaults to the last plugin-imported photos, then the current Lightroom selection."
        ),
      collection: z.string().optional().describe("Optional top-level collection name to preview instead of target."),
      max_dimension: z
        .number()
        .int()
        .min(256)
        .max(2048)
        .default(1200)
        .describe("Longest edge of the preview in pixels (256-2048, default 1200)."),
      quality: z
        .number()
        .int()
        .min(10)
        .max(100)
        .default(70)
        .describe("JPEG quality percentage (10-100, default 70).")
    },
    async (request) => {
      const job = jobs.create("preview", request);
      logger.info("queued preview job", { job_id: job.id, max_dimension: request.max_dimension });
      return jsonText({
        job_id: job.id,
        status: job.status,
        message: "Preview queued. Poll job_status, then fetch job_result for preview paths and inline image content."
      });
    }
  );

  server.tool(
    "get_develop_settings",
    "Queue a job that reads the full develop settings of the target photo (including MaskGroupBasedCorrections) for AI inspection. Poll job_status, then job_result.",
    {
      target: z
        .string()
        .optional()
        .describe(
          "Photo target understood by the plugin: selection, selected, last_import, or last_imported. Defaults to the last plugin-imported photos, then the current Lightroom selection."
        ),
      collection: z.string().optional().describe("Optional top-level collection name to read instead of target.")
    },
    async (request) => {
      const job = jobs.create("read_settings", request);
      logger.info("queued read-settings job", { job_id: job.id });
      return jsonText({ job_id: job.id, status: job.status });
    }
  );

  server.tool(
    "start_adaptive_edit",
    "Queue an AI-authored adaptive (masked) develop edit. Pass corrections targeting subject (MaskSubType 1), sky (MaskSubType 2), or background (subject mask with MaskInverted true); Lightroom computes the AI masks when the preset is applied. Local values use XMP scale: LocalExposure2012 valid range is about -1..1 where 1 = +4 stops; values outside valid ranges are silently dropped by Lightroom. Non-destructive.",
    {
      target: z
        .string()
        .optional()
        .describe(
          "Photo target understood by the plugin: selection, selected, last_import, or last_imported. Defaults to the last plugin-imported photos, then the current Lightroom selection."
        ),
      collection: z.string().optional().describe("Optional top-level collection name to edit instead of target."),
      preset_name: z.string().optional().describe("Display name for the generated plugin preset."),
      settings_raw: z
        .record(z.unknown())
        .describe(
          "Raw develop settings table. For adaptive edits pass { MaskGroupBasedCorrections: [ { What: 'Correction', CorrectionAmount: 1, CorrectionActive: true, CorrectionName, CorrectionSyncID (32-hex), LocalExposure2012, LocalShadows2012, LocalHighlights2012, LocalContrast2012, LocalClarity2012, LocalDehaze, LocalTexture, LocalSaturation, LocalTemperature, LocalTint, LocalCurveRefineSaturation: 100, CorrectionMasks: [ { What: 'Mask/Image', MaskActive: true, MaskName, MaskBlendMode: 0, MaskInverted, MaskSyncID (32-hex), MaskValue: 1, MaskVersion: 1, MaskSubType (1 subject, 2 sky), ReferencePoint: '0.500000 0.500000', ErrorReason: 0 } ] } ] }. Applying a new adaptive edit REPLACES all previous mask corrections, so always include every correction you want to keep."
        )
    },
    async (request) => {
      const job = jobs.create("edit_adaptive", request);
      logger.info("queued edit-adaptive job", { job_id: job.id });
      return jsonText({ job_id: job.id, status: job.status });
    }
  );

  server.tool(
    "list_develop_presets",
    "Queue a job that enumerates Lightroom Classic develop presets (folders, names, UUIDs). Poll job_status, then job_result for the preset catalog.",
    {
      name_filter: z
        .string()
        .optional()
        .describe("Optional case-insensitive substring filter matched against 'folder/preset name'.")
    },
    async (request) => {
      const job = jobs.create("list_presets", request);
      logger.info("queued list-presets job", { job_id: job.id });
      return jsonText({ job_id: job.id, status: job.status });
    }
  );

  server.tool(
    "apply_develop_preset",
    "Queue a job that applies an existing Lightroom Classic develop preset (matched by name or UUID from list_develop_presets) to the target photos non-destructively.",
    {
      preset: z.string().describe("Develop preset name or UUID. UUIDs are unambiguous; names must match exactly (case-insensitive)."),
      target: z
        .string()
        .optional()
        .describe(
          "Photo target understood by the plugin: selection, selected, last_import, or last_imported. Defaults to the last plugin-imported photos, then the current Lightroom selection."
        ),
      collection: z.string().optional().describe("Optional top-level collection name to apply the preset to.")
    },
    async (request) => {
      const job = jobs.create("apply_preset", request);
      logger.info("queued apply-preset job", { job_id: job.id, preset: request.preset });
      return jsonText({ job_id: job.id, status: job.status });
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
      const payload = {
        job_id: job.id,
        status: job.status,
        result: job.result ?? null,
        completed_at: job.completed_at ?? null
      };
      const content: Array<
        { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
      > = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
      if (job.kind === "preview" && job.status === "succeeded") {
        content.push(...inlinePreviewImages(job.result));
      }
      return { content };
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
