# Design Notes

This project is an unofficial Lightroom Classic MCP server and local bridge for Adobe Lightroom Classic automation. It is not an Adobe product and is not affiliated with, endorsed by, sponsored by, or supported by Adobe.

The design is aimed at practical, non-generative photo editing workflows: import, export, develop settings, preset application, metadata updates, and batch workflow coordination.

## Components

- MCP stdio server: exposes Lightroom Classic tools to Claude Desktop, Codex, ChatGPT-compatible MCP hosts, and other MCP clients.
- Local Node bridge: runs an HTTP API on `127.0.0.1` for the Lightroom Classic plugin.
- Job store: records queued, claimed, running, succeeded, failed, and cancelled jobs.
- Lightroom Classic plugin: polls the Node bridge, claims jobs, performs Lightroom SDK work, and posts status updates.
- Lock file: prevents multiple bridge processes from competing for the same local port and plugin connection.

## Timeout Failure Mode

The failure this design avoids is a long Lightroom operation being handled as one synchronous MCP request.

A typical problematic flow looks like this:

1. The MCP client asks to import a large folder.
2. The server forwards the request to Lightroom Classic and waits for the full import to finish.
3. Lightroom Classic takes longer than the MCP client's request timeout.
4. The client reports a timeout even though Lightroom may still be working, stuck, or connected to a different local process.

In one observed setup, an import request timed out after roughly 120 seconds. Lightroom Classic had a plugin loaded and listening on localhost ports, but multiple stale Node `lightroom-mcp` processes were also running. The plugin logs showed no clear import progress or completion. That made it difficult to tell whether the request was slow, disconnected, or routed to the wrong process.

## Async Job Queue

This repo uses a job-first design.

1. The MCP client calls `start_import`, `start_export`, or `start_edit_tracking`.
2. The Node server validates the request, stores a job, and returns a `job_id` immediately.
3. The Lightroom Classic plugin polls the bridge for queued work.
4. The plugin claims one job at a time.
5. The plugin reports `running`, progress details, success, or failure.
6. The MCP client calls `job_status` or `list_jobs` to observe progress.

This keeps MCP calls short. The client only waits for the job to be created, not for Lightroom Classic to finish an import, render previews, apply presets, write metadata, or export files.

## Why Polling

The Lightroom Classic plugin environment is easier to keep reliable when the plugin initiates communication with a localhost bridge. Polling avoids requiring the Node process to directly control Lightroom Classic from outside the application. It also gives the plugin a simple recovery path: if the server restarts, the next poll can reconnect.

## Job States

Jobs currently use these states:

- `queued`: stored by the MCP server and waiting for Lightroom Classic.
- `claimed`: taken by the plugin.
- `running`: actively being handled by the plugin.
- `succeeded`: completed successfully.
- `failed`: completed with an error.
- `cancelled`: cancelled before successful completion.

Terminal states are `succeeded`, `failed`, and `cancelled`.

## Stale Process Strategy

The Node server writes a lock file at `~/.lightroom-classic-mcp-server/server.lock` by default.

- If another live process owns the lock, startup fails and reports the owning PID.
- If the lock points to a dead process, the new server replaces it.
- The default bridge port is `58765`, chosen to avoid colliding with ports seen in earlier local Lightroom MCP experiments.

The bridge host and port are configurable with `LRC_MCP_BRIDGE_HOST` and `LRC_MCP_BRIDGE_PORT`.

## Lightroom Classic Work Model

The intended Lightroom-side operations are non-generative and catalog-oriented:

- import files or folders;
- add imported photos to collections;
- apply presets or develop settings;
- export selected photos, collections, or batches;
- write metadata or workflow tracking fields;
- report progress for large batch jobs.

The TypeScript side should not claim a Lightroom operation succeeded until the plugin reports completion from Lightroom Classic.

## Current Implementation State

The TypeScript MCP server and HTTP bridge are implemented. The Lightroom Classic plugin is a compile-free Lua skeleton with request/response logging, polling, job claiming, status updates, and explicit TODOs for Lightroom SDK calls.

The skeleton intentionally reports unimplemented Lightroom operations as failed jobs. This is preferable to returning success before real Lightroom Classic automation exists.
