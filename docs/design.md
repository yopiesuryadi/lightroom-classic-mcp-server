# Design Notes

This project is an unofficial MCP server and local bridge for Adobe Lightroom Classic. It is not an Adobe product and is not affiliated with or endorsed by Adobe.

## Timeout Failure Mode

The observed failure with the existing community MCP was an import request that timed out after roughly 120 seconds. Lightroom Classic had the plugin loaded and was listening on `127.0.0.1:58763` and `127.0.0.1:58764`, but multiple stale Node `lightroom-mcp` processes were also running. The Lightroom plugin logs showed no import progress or completion.

That failure mode has two likely causes:

- The MCP tool call waited for Lightroom to finish the whole import inside one synchronous request.
- Stale Node processes and unclear ownership of localhost ports made it hard to know which process, if any, the Lightroom plugin was talking to.

## Approach

This repo uses a job-first design:

1. The MCP client asks the Node server to start an import, export, or edit job.
2. The Node server records the job and immediately returns a `job_id`.
3. The Lightroom Classic plugin polls the Node bridge for work.
4. The plugin reports `running`, progress, success, or failure back to Node.
5. MCP clients poll `job_status` instead of waiting for a long-running Lightroom operation.

The result is that long imports do not need to fit inside a Claude, Codex, or MCP client timeout window. A timeout in the chat client should not kill the underlying job record or make Lightroom's progress invisible.

## Stale Process Strategy

The Node server writes a lock file at `~/.lightroom-classic-mcp-server/server.lock` by default. If another live process owns the lock, startup fails with the owning PID. If the lock points to a dead process, the new server replaces it.

The bridge listens on `127.0.0.1:58765` by default to avoid colliding with the ports seen in the earlier community MCP setup. The port is configurable with `LRC_MCP_BRIDGE_PORT`.

## Current State

The TypeScript MCP server and HTTP bridge are implemented. The Lightroom Classic plugin is a compile-free skeleton with request/response logging, polling, job claiming, status updates, and explicit TODOs for the Lightroom SDK operations that must be completed:

- Import files/folders into a catalog.
- Add imported photos to a collection.
- Export selected photos or collections to `~/Documents/leica` by default.
- Apply metadata or develop edit operations.

The skeleton intentionally reports unimplemented Lightroom operations as failed jobs instead of pretending work succeeded.
