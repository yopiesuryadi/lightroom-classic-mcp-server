# Unofficial MCP Server for Adobe Lightroom Classic

An unofficial Model Context Protocol (MCP) server and local bridge for automating Adobe Lightroom Classic on your own machine.

This project is not official Adobe software. It is not affiliated with, endorsed by, or supported by Adobe. It is intended for local Lightroom Classic automation, not image generation.

## Why This Exists

Some Lightroom MCP flows try to perform long imports inside a single MCP request. That is fragile: desktop automation can exceed client timeouts, and stale local Node processes can make it unclear which process Lightroom is connected to.

This repo uses an asynchronous job design:

- MCP tools queue Lightroom jobs and return a `job_id` immediately.
- Lightroom Classic polls a local Node bridge for work.
- The plugin reports progress and completion back to Node.
- Clients poll `job_status` instead of waiting for a long import to finish in one call.

## Status

Early scaffold. The Node MCP server, job queue, single-process guard, structured logging, and local plugin bridge endpoints are in place. The Lightroom Classic Lua plugin is a compile-free skeleton with request/response logging and explicit TODOs for the actual Lightroom SDK import/export/edit operations.

## Requirements

- macOS with Adobe Lightroom Classic installed.
- Node.js 20 or newer.
- An MCP-capable client such as Claude Desktop, Codex, or another MCP host.

## Install

```bash
git clone https://github.com/yopiesuryadi/lightroom-classic-mcp-server.git
cd lightroom-classic-mcp-server
npm install
npm run build
```

Install the Lightroom Classic plugin:

1. Open Lightroom Classic.
2. Go to `File > Plug-in Manager`.
3. Click `Add`.
4. Select `lightroom-classic-mcp-server.lrplugin` from this repo.

## Run

```bash
npm start
```

By default the server:

- listens for the Lightroom plugin on `127.0.0.1:58765`;
- writes state to `~/.lightroom-classic-mcp-server`;
- writes structured JSON logs to `~/.lightroom-classic-mcp-server/server.log`;
- uses `~/Pictures` as the default input folder;
- uses `~/Documents/leica` as the default output folder.

Configuration is via environment variables:

```bash
LRC_MCP_BRIDGE_HOST=127.0.0.1
LRC_MCP_BRIDGE_PORT=58765
LRC_MCP_INPUT_DIR=~/Pictures
LRC_MCP_OUTPUT_DIR=~/Documents/leica
LRC_MCP_STATE_DIR=~/.lightroom-classic-mcp-server
LRC_MCP_LOG_FILE=~/.lightroom-classic-mcp-server/server.log
LRC_MCP_LOCK_FILE=~/.lightroom-classic-mcp-server/server.lock
```

## Claude Desktop MCP Config

After `npm run build`, add this to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "lightroom-classic": {
      "command": "node",
      "args": [
        "/Users/yopiesuryadi/Documents/lightroom-classic-mcp-server/dist/index.js"
      ],
      "env": {
        "LRC_MCP_OUTPUT_DIR": "/Users/yopiesuryadi/Documents/leica"
      }
    }
  }
}
```

## Codex MCP Config

For Codex or another MCP host, register the same stdio command:

```toml
[mcp_servers.lightroom-classic]
command = "node"
args = ["/Users/yopiesuryadi/Documents/lightroom-classic-mcp-server/dist/index.js"]

[mcp_servers.lightroom-classic.env]
LRC_MCP_OUTPUT_DIR = "/Users/yopiesuryadi/Documents/leica"
```

## Tools

- `start_import`: queue a Lightroom Classic import and return `job_id`.
- `start_export`: queue a Lightroom Classic export and return `job_id`.
- `start_edit_tracking`: queue a placeholder edit/metadata operation and return `job_id`.
- `job_status`: inspect a job.
- `list_jobs`: list recent jobs.
- `cancel_job`: cancel a queued or running job.
- `server_config`: show effective non-secret config.

No tool performs generative image creation.

## Development

```bash
npm install
npm run build
npm run typecheck
```

Read [docs/design.md](docs/design.md) for the timeout failure mode and the bridge design.
