# Lightroom Classic MCP Server

> **WIP warning:** this project now supports a minimal local Lightroom Classic workflow, but it is not a full automation suite. Use a single test image first, and keep imports/exports scoped to explicit files, selections, or collections.

Unofficial **Lightroom Classic MCP server** for local Adobe Lightroom Classic automation. It gives MCP clients such as Claude Desktop, Codex, ChatGPT-compatible MCP hosts, and other Model Context Protocol clients a structured way to queue non-generative Lightroom Classic work on your own computer.

This project is also discoverable as an **Adobe Lightroom Classic MCP server**, **MCP for Lightroom Classic**, and **Claude/Codex/ChatGPT Lightroom Classic automation** bridge.

## Unofficial Project

This is not Adobe software. It is not affiliated with, endorsed by, sponsored by, or supported by Adobe. Adobe, Lightroom, and Lightroom Classic are trademarks of Adobe Inc. This project is an independent local automation bridge for users who already run Adobe Lightroom Classic. It is also not a generative image editor: it does not create, synthesize, replace, or AI-edit pixels.

## What It Does

The goal is practical, non-generative photo workflow automation. This server does not create images and does not call image generation models. It is designed for Lightroom Classic catalog and workflow tasks such as:

- importing files or folders into a Lightroom Classic catalog;
- applying develop settings or preset-driven adjustments;
- exporting selected photos, collections, or batches to a chosen folder;
- updating metadata, collection membership, or workflow tracking fields;
- coordinating batch workflow steps that may take longer than a chat client request.

## Current Status

Minimal usable workflow. The TypeScript MCP server, local HTTP bridge, job queue, single-process lock, structured logging, and Lightroom Classic Lua plugin are in place.

The included Lightroom Classic plugin polls the bridge, claims jobs, imports files into the active catalog, applies a small allowlisted set of non-destructive develop settings, lists and applies existing Lightroom develop presets, renders low-resolution JPEG previews of the current develop state, and exports selected/imported/collection photos as JPEGs. Metadata editing, Lightroom named export presets, recursive collection lookup, and larger batch workflow features are still future work.

For this repository's immediate self-use goal, "working" means this local Mac can install the plugin/server, import one real photo into Lightroom Classic, apply non-generative develop settings, export a JPEG to `/Users/yopiesuryadi/Documents/leica`, and verify the output file exists.

## Why Async Jobs

Lightroom Classic operations can take longer than an MCP client timeout. Large imports, previews, exports, preset application, metadata writes, and batch workflows may run for minutes. If an MCP tool tries to do all of that inside one synchronous request, Claude, Codex, ChatGPT, or another MCP host can time out before Lightroom finishes.

This server uses an async job queue instead:

1. The MCP client calls a tool such as `start_import` or `start_export`.
2. The Node server stores a job and immediately returns a `job_id`.
3. The Lightroom Classic plugin polls the local bridge for queued work.
4. The plugin claims the job, performs Lightroom-side work, and reports progress.
5. The client polls `job_status` or `list_jobs` until the job succeeds or fails.

That design keeps the chat/MCP request short while allowing Lightroom Classic to continue the real desktop operation in the background.

## Requirements

- macOS with Adobe Lightroom Classic installed.
- Node.js 20 or newer.
- An MCP-capable client, such as Claude Desktop, Codex, a ChatGPT MCP host, or another Model Context Protocol client.

## Quickstart

```bash
git clone https://github.com/yopiesuryadi/lightroom-classic-mcp-server.git
cd lightroom-classic-mcp-server
npm install
npm run build
npm run install:plugin
npm run verify:plugin
npm start
```

The installer copies this repository's plugin to:

```text
~/Library/Application Support/Adobe/Lightroom/Modules/LightroomClassicMCPServer.lrplugin
```

It deliberately uses a distinct folder name and preserves any older `LightroomMCP.lrplugin` folder. If an existing `LightroomClassicMCPServer.lrplugin` already looks like this project, the installer moves it to a timestamped backup before copying the current plugin; it refuses to replace unrelated folders unless you explicitly pass `--force`. Disable older duplicate plugin entries in Lightroom Classic if more than one appears in Plug-in Manager.

In Lightroom Classic, after installing or updating the plugin:

1. Open `File > Plug-in Manager`.
2. Confirm `Lightroom Classic MCP Server Bridge` is present and enabled.
3. If it is not listed, click `Add` and select the installed `LightroomClassicMCPServer.lrplugin` folder above.
4. Keep Lightroom Classic open so the plugin can poll the local bridge.

If Lightroom Classic was already running when you installed the plugin, quit and reopen Lightroom Classic, or manually add/reload the plugin in Plug-in Manager. Lightroom does not always load a newly copied `.lrplugin` folder until that happens.

Then add the MCP server command to your MCP client configuration and restart that client.

For a real local smoke test on this Mac, keep Lightroom Classic open with the plugin enabled, then run:

```bash
npm run build
npm run install:plugin
npm run smoke:local -- --input "/absolute/path/to/test-photo.jpg" --output-dir "/Users/yopiesuryadi/Documents/leica"
```

The smoke script starts the local bridge, queues import, edit, and export jobs, waits for the Lightroom Classic plugin to claim and finish them, and verifies that an exported file exists.

## Install From This Repository

```bash
npm install
npm run build
npm run install:plugin
npm run verify:plugin
```

The built server entrypoint is:

```text
dist/index.js
```

The source Lightroom Classic plugin folder in this repository is:

```text
lightroom-classic-mcp-server.lrplugin
```

The installed Lightroom Classic plugin folder is:

```text
~/Library/Application Support/Adobe/Lightroom/Modules/LightroomClassicMCPServer.lrplugin
```

### Installer Commands

```bash
npm run install:lightroom-plugin
npm run install:plugin
npm run verify:plugin
```

`install:lightroom-plugin` is kept as a descriptive alias for `install:plugin`. The installer creates the Lightroom Modules folder if needed, backs up same-project installs, and copies the repository plugin into place without overwriting unrelated plugin folders. The verifier checks the installed plugin folder, expected toolkit identifier, Lightroom Classic process status, and the local bridge health endpoint if the MCP server is already running.

## Configuration

Configuration is provided through environment variables.

```bash
LRC_MCP_BRIDGE_HOST=127.0.0.1
LRC_MCP_BRIDGE_PORT=58765
LRC_MCP_INPUT_DIR=~/Pictures
LRC_MCP_OUTPUT_DIR=~/Documents/leica
LRC_MCP_STATE_DIR=~/.lightroom-classic-mcp-server
LRC_MCP_LOG_FILE=~/.lightroom-classic-mcp-server/server.log
LRC_MCP_LOCK_FILE=~/.lightroom-classic-mcp-server/server.lock
```

Defaults:

- bridge host: `127.0.0.1`
- bridge port: `58765`
- input directory: `~/Pictures`
- output directory: `~/Documents/leica`
- state directory: `~/.lightroom-classic-mcp-server`
- log file: `~/.lightroom-classic-mcp-server/server.log`
- lock file: `~/.lightroom-classic-mcp-server/server.lock`

## MCP Config Examples

Use an absolute path to `dist/index.js` after running `npm run build`.

### Claude Desktop

```json
{
  "mcpServers": {
    "lightroom-classic": {
      "command": "node",
      "args": [
        "/Users/yopiesuryadi/Documents/leica/mcp/dist/index.js"
      ],
      "env": {
        "LRC_MCP_OUTPUT_DIR": "/Users/yopiesuryadi/Documents/leica"
      }
    }
  }
}
```

### Codex

```toml
[mcp_servers.lightroom-classic]
command = "node"
args = ["/Users/yopiesuryadi/Documents/leica/mcp/dist/index.js"]

[mcp_servers.lightroom-classic.env]
LRC_MCP_OUTPUT_DIR = "/Users/yopiesuryadi/Documents/leica"
```

### ChatGPT-Compatible MCP Host

Use the same stdio command shape if your ChatGPT or OpenAI-compatible MCP host supports local MCP servers:

```json
{
  "name": "lightroom-classic",
  "command": "node",
  "args": [
    "/Users/yopiesuryadi/Documents/leica/mcp/dist/index.js"
  ],
  "env": {
    "LRC_MCP_BRIDGE_PORT": "58765"
  }
}
```

Exact file locations and schema names vary by host. The important parts are the `node` command, the absolute `dist/index.js` path, and any `LRC_MCP_*` environment variables you want to override.

## MCP Tools

- `start_import`: queue a Lightroom Classic import and return a `job_id`.
- `start_export`: queue a Lightroom Classic export and return a `job_id`.
- `start_edit_tracking`: queue a non-destructive develop-setting workflow and return a `job_id`.
- `get_develop_settings`: queue a job that reads the target photo's full develop settings (including mask-based corrections) for AI inspection.
- `start_adaptive_edit`: queue an AI-authored adaptive (masked) edit; Lightroom computes Select Subject / Sky AI masks when the generated preset is applied. See the AI-Adaptive Editing Loop section for value-scale rules.
- `get_preview`: queue a fast, low-resolution sRGB JPEG render of the current develop state and return a `job_id`. `job_result` then returns the absolute preview path(s) and the JPEG as inline MCP image content for multimodal AI vision.
- `list_develop_presets`: queue a job that enumerates develop preset folders, preset names, and UUIDs.
- `apply_develop_preset`: queue a job that applies an existing develop preset (by name or UUID) non-destructively.
- `job_status`: inspect one job.
- `job_result`: inspect a completed job result without the full job envelope.
- `job_error`: inspect a failed job error without the full job envelope.
- `list_jobs`: list recent jobs.
- `cancel_job`: cancel a queued or running job.
- `server_config`: show effective non-secret server configuration.

## AI-Adaptive Editing Loop

The preview and develop-setting tools support an AI-adaptive editing loop without changing Lightroom's non-destructive model:

1. **Perceive:** call `get_preview`, poll `job_status`, then inspect the absolute JPEG preview path or inline preview image from `job_result`.
2. **Decide:** compare the preview against the intended photographic direction and choose a small develop-setting or preset adjustment.
3. **Act:** call `start_edit_tracking` with allowlisted develop settings, or call `apply_develop_preset` with a UUID from `list_develop_presets`.
4. **Verify:** call `get_preview` again and compare the new current develop state before making another adjustment or exporting.

Beyond existing presets, `start_adaptive_edit` accepts raw `MaskGroupBasedCorrections`, so the model can author per-area corrections (subject / sky / background) with free values instead of a fixed preset matrix. Local values use XMP scale (`LocalExposure2012` ±1.0 = ±4 stops); out-of-range values are silently dropped by Lightroom, and a new adaptive edit replaces all previous mask corrections.

For wiring this into an OpenClaw Telegram assistant, see `docs/openclaw.md` and the agent playbook example in `docs/playbook-example.md`.

Adaptive preset selection is still an experiment. Preset enumeration and application are available, but the model or operator is responsible for choosing appropriate presets, avoiding duplicate or ambiguous names by preferring UUIDs, and verifying the result with a preview before export.

### Why `get_preview` Is Async

`get_preview` deliberately follows the existing async job pattern. The only channel into Lightroom Classic is the plugin's bridge poll loop (roughly every 2 seconds), and develop renders — especially of RAW files — can exceed an MCP client timeout. A synchronous tool would have to block the MCP request on both the poll interval and the render, so async is the safer choice here. The multimodal payoff still works: once the job succeeds, `job_result` attaches the rendered JPEG as inline MCP image content alongside the JSON result.

Preview behavior:

- Previews render through `LrExportSession` as sRGB JPEGs constrained to `max_dimension` (default 1200 px, capped at 2048) at JPEG `quality` (default 70).
- Preview files are written to `~/.lightroom-classic-mcp-server/previews/<job_id>/`. The plugin deletes preview entries older than 24 hours on startup.
- One preview job renders at most 8 photos; `result.truncated` is `true` when the target contained more.
- `job_result` inlines up to 4 preview images (up to ~3.5 MB each); the absolute path(s) are always in the JSON result regardless.

### Worked Example: Preview → Analyze → Edit → Verify

Assume one photo was just imported (`target: "last_import"`):

1. Call `get_preview` with `{ "target": "last_import" }` and poll `job_status` until it succeeds.
2. Call `job_result`. The vision-capable client sees the preview image inline plus `result.preview_path`.
3. The AI observes, for example: underexposed midtones, a warm cast, flat contrast. It queues `start_edit_tracking`:

```json
{
  "target": "last_import",
  "operation": "apply_develop_settings",
  "parameters": {
    "exposure": 0.4,
    "contrast": 12,
    "shadows": 18,
    "temperature": -300,
    "vibrance": 8,
    "vignette": -12,
    "grain_size": 25,
    "grain_frequency": 50
  }
}
```

4. Call `get_preview` again and compare. If highlights now clip, follow up with a smaller correction such as `{ "highlights": -20, "exposure": -0.1 }` and re-verify.
5. For a black-and-white treatment, send `{ "black_white": true }` (boolean), or apply a B&W preset via `apply_develop_preset`.
6. When the preview matches the intent, call `start_export` for the full-resolution output.

Supported develop-setting aliases include `black_white`/`grayscale` (boolean `ConvertToGrayscale`), `vignette` (`PostCropVignetteAmount`), `grain`/`grain_amount`, `grain_size`, and `grain_frequency`, in addition to the tone/color/crop keys listed in the `start_edit_tracking` tool description.

### Adaptive Presets (Select Subject / Select Sky): Experiment Status

Lightroom Classic ships "Adaptive: Subject" and "Adaptive: Sky" preset groups that create AI masks when applied. Honest status: **applying adaptive presets through this bridge is untested and may not compute masks headlessly.** Adaptive presets do appear in `LrApplication.developPresetFolders()` on recent Lightroom Classic versions and `photo:applyDevelopPreset` accepts them, but the Select Subject/Select Sky mask computation runs in Lightroom's own ML pipeline, and Adobe does not document whether SDK-applied adaptive presets trigger it reliably outside the Develop module UI.

Manual experiment procedure (run once on your machine and record the outcome):

1. Import a test photo with a clear subject and visible sky, and select it in Lightroom.
2. Call `list_develop_presets` with `{ "name_filter": "adaptive" }` and note the preset UUIDs (folders typically named `Adaptive: Subject` and `Adaptive: Sky`).
3. Call `apply_develop_preset` with one of those UUIDs and `target: "selection"`.
4. Verify in Lightroom's Develop module: open the **Masking** panel and confirm a `Subject` or `Sky` mask was actually created with adjustments attached — not just a preset entry in the History panel.
5. Call `get_preview` before and after and compare renders visually; an adaptive preset that silently no-ops produces an unchanged preview.
6. If the mask is missing or empty, fall back to the manual step: select the photo in Lightroom, open the **Presets** panel in the Develop module, and click the adaptive preset there (the UI path always triggers mask computation). The rest of the loop — preview, verify, export — stays automated.

If the experiment succeeds on your Lightroom version, adaptive presets work inside the loop like any other preset. If it fails, treat adaptive presets as the one manual step in an otherwise automated loop.

## Example Workflow

1. Ask your MCP client to import one image into Lightroom Classic.
2. The client calls `start_import` and receives a `job_id`.
3. Ask for the job status, or have the client poll `job_status`.
4. After import completion, queue a small edit job, for example:

```json
{
  "target": "last_import",
  "operation": "apply_develop_settings",
  "parameters": {
    "exposure": 0.15,
    "contrast": 8,
    "vibrance": 10
  }
}
```

5. Queue an export job with `selected_only: true`, a `collection`, or no target after an import. With no target, the plugin exports the last photo(s) imported by this plugin session, then falls back to the current Lightroom selection. The default export folder is `~/Documents/leica`.

For long imports or exports, prefer polling status over asking the client to wait silently.

## Smoke Test

Use a single disposable image for the end-to-end test. The import is catalog-only and the develop settings are Lightroom non-destructive edits; the export writes a new JPEG and should not overwrite originals.

```bash
npm install
npm run build
npm run install:plugin
npm run verify:plugin
npm start
```

Then in Lightroom Classic, confirm the plugin is enabled in `File > Plug-in Manager`.

For the direct local harness:

```bash
npm run smoke:local -- --input "/absolute/path/to/test-image.jpg" --output-dir "/Users/yopiesuryadi/Documents/leica"
```

From an MCP client, run:

1. `server_config`
2. `start_import` with `paths: ["/absolute/path/to/test-image.jpg"]`
3. `job_status` until it succeeds
4. `start_edit_tracking` with `target: "last_import"`, `operation: "apply_develop_settings"`, and a small settings object
5. `start_export` with `output_dir: "~/Documents/leica"`
6. `job_result` to inspect the exported file path

## Troubleshooting

### The MCP client cannot start the server

- Run `npm run build` and confirm `dist/index.js` exists.
- Use an absolute path in your MCP config.
- Confirm Node.js 20 or newer with `node --version`.
- Check `~/.lightroom-classic-mcp-server/server.log`.

### Lightroom Classic does not appear to receive jobs

- Confirm the `.lrplugin` folder is installed in Lightroom Classic Plug-in Manager.
- Confirm Lightroom Classic is open.
- Confirm the server is listening on `127.0.0.1:58765`, or update `LRC_MCP_BRIDGE_PORT` consistently.
- Look at `~/.lightroom-classic-mcp-server/server.log` and the Lightroom plugin logs.

### Startup fails because another server is running

The server uses a lock file to avoid multiple local bridge processes fighting for the same Lightroom Classic connection. Stop the older Node process, or inspect:

```bash
cat ~/.lightroom-classic-mcp-server/server.lock
```

If the process in the lock file is no longer running, a new server should replace the stale lock on startup.

### Jobs stay queued

Queued jobs usually mean the Node MCP server is running but the Lightroom Classic plugin has not claimed work. Check that the plugin is installed, enabled, and configured for the same bridge host and port.

For local smoke testing, a timeout before the import job changes from `queued` means the Lightroom plugin is not polling the bridge. Restart Lightroom Classic or add/reload `LightroomClassicMCPServer.lrplugin` in Plug-in Manager, then rerun `npm run smoke:local`.

### Jobs fail immediately

Check the returned `error` field with `job_error`. Common causes are a missing import path, no selected photo, a collection name that does not exist, unsupported source file format, Lightroom catalog write-access timeout, or an export destination that Lightroom cannot write.

## Development

```bash
npm install
npm run build
npm run typecheck
npm run lint
```

Read [docs/design.md](docs/design.md) for more detail on the timeout failure mode, async job queue, local bridge, and stale process strategy.
