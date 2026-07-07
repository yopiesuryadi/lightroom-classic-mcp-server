# Lightroom Classic MCP Server

Unofficial **Lightroom Classic MCP server** for local Adobe Lightroom Classic automation. It gives MCP clients such as Claude Desktop, Codex, ChatGPT-compatible MCP hosts, and other Model Context Protocol clients a structured way to queue non-generative Lightroom Classic work on your own computer.

This project is also discoverable as an **Adobe Lightroom Classic MCP server**, **MCP for Lightroom Classic**, and **Claude/Codex/ChatGPT Lightroom Classic automation** bridge.

## Unofficial Project

This is not Adobe software. It is not affiliated with, endorsed by, sponsored by, or supported by Adobe. Adobe, Lightroom, and Lightroom Classic are trademarks of Adobe Inc. This project is an independent local automation bridge for users who already run Adobe Lightroom Classic.

## What It Does

The goal is practical, non-generative photo workflow automation. This server does not create images and does not call image generation models. It is designed for Lightroom Classic catalog and workflow tasks such as:

- importing files or folders into a Lightroom Classic catalog;
- applying develop settings or preset-driven adjustments;
- exporting selected photos, collections, or batches to a chosen folder;
- updating metadata, collection membership, or workflow tracking fields;
- coordinating batch workflow steps that may take longer than a chat client request.

## Current Status

Early scaffold. The TypeScript MCP server, local HTTP bridge, job queue, single-process lock, structured logging, and Lightroom Classic Lua plugin skeleton are in place.

The included Lightroom Classic plugin currently logs bridge requests, polls for jobs, claims jobs, and reports status. The actual Lightroom SDK operations for import, export, develop settings, presets, and metadata still need to be completed. Until those SDK calls are implemented, the skeleton should fail unimplemented Lightroom jobs explicitly instead of pretending they succeeded.

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
npm start
```

In Lightroom Classic:

1. Open `File > Plug-in Manager`.
2. Click `Add`.
3. Select `lightroom-classic-mcp-server.lrplugin` from this repo.
4. Keep Lightroom Classic open so the plugin can poll the local bridge.

Then add the MCP server command to your MCP client configuration and restart that client.

## Install From This Repository

```bash
npm install
npm run build
```

The built server entrypoint is:

```text
dist/index.js
```

The Lightroom Classic plugin folder is:

```text
lightroom-classic-mcp-server.lrplugin
```

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
- `start_edit_tracking`: queue an edit, preset, develop-setting, or metadata workflow placeholder and return a `job_id`.
- `job_status`: inspect one job.
- `job_result`: inspect a completed job result without the full job envelope.
- `job_error`: inspect a failed job error without the full job envelope.
- `list_jobs`: list recent jobs.
- `cancel_job`: cancel a queued or running job.
- `server_config`: show effective non-secret server configuration.

## Example Workflow

1. Ask your MCP client to import a folder into Lightroom Classic.
2. The client calls `start_import` and receives a `job_id`.
3. Ask for the job status, or have the client poll `job_status`.
4. After import completion, queue export or edit workflow jobs.

For long imports or exports, prefer polling status over asking the client to wait silently.

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

### Jobs fail immediately

In the current scaffold, Lightroom SDK operations are intentionally incomplete. Import, export, preset, develop settings, and metadata operations may report failure until the Lua plugin implementation is finished.

## Development

```bash
npm install
npm run build
npm run typecheck
npm run lint
```

Read [docs/design.md](docs/design.md) for more detail on the timeout failure mode, async job queue, local bridge, and stale process strategy.
