# Using with OpenClaw (Telegram bots)

This server works well as the photo-editing backend for an [OpenClaw](https://openclaw.ai) assistant: send a photo to your Telegram bot, the agent analyzes it, edits tone/mood in Lightroom Classic through this MCP server, and sends the exported JPEG back. Non-generative: pixels are never synthesized, only Lightroom develop settings change.

## 1. Run the server persistently

Run `node dist/index.js` under launchd/systemd so the plugin bridge (`127.0.0.1:58765`) and the MCP streamable-http endpoint (`http://127.0.0.1:58766/mcp`) are always up. Keep Lightroom Classic open — the bundled plugin polls the bridge from inside Lightroom.

macOS LaunchAgent example (`~/Library/LaunchAgents/com.example.lightroom-mcp.plist`): program arguments `node /path/to/repo/dist/index.js`, `RunAtLoad` + `KeepAlive` true.

## 2. Register the MCP server — depends on your agent brain

**If your OpenClaw brain runs on the Codex harness (OpenAI models via Codex runtime):** do NOT register this server in `openclaw.json`. OpenClaw forwards its `mcp.servers` entries verbatim to Codex, and the `transport` field OpenClaw requires is rejected by Codex — every session then fails to boot ("Something went wrong" on every message). Register it in Codex's own config instead:

```toml
# ~/.codex/config.toml
[mcp_servers.lightroom]
url = "http://127.0.0.1:58766/mcp"
```

Restart the OpenClaw gateway once so the Codex app-server rereads its config.

**If your brain is an embedded/other harness that consumes OpenClaw's own MCP config:**

```json
// ~/.openclaw/openclaw.json -> mcp.servers
"lightroom": {
  "url": "http://127.0.0.1:58766/mcp",
  "transport": "streamable-http",
  "connectTimeout": 20,
  "timeout": 120
}
```

If bots start replying "Something went wrong" right after you add this, your brain is on the Codex harness — remove the entry and use the `config.toml` route above.

## 3. Teach the agent how to edit

Drop a playbook into your OpenClaw workspace (e.g. `~/.openclaw/workspace/LIGHTROOM-EDITING.md`) and reference it from `TOOLS.md`. See [`playbook-example.md`](playbook-example.md) for a complete starting point: the perceive-decide-act-verify loop, value scales, adaptive-mask rules, and a look library. Customize the taste section — that is where your own editing preferences live.

Inbound Telegram photos land in `~/.openclaw/media/inbound/`; point `start_import` at that path and export back to a folder the agent can attach from.

## Operational notes

- One editing session at a time: the server holds a single-process lock and one bridge port.
- Previews that involve AI masks (Select Subject / Sky) take ~30-60 s — Lightroom runs ML inference at apply time. Budget a few minutes per photo end to end.
- If jobs stay `queued` for more than a minute, Lightroom Classic is probably closed or the plugin poll loop is not running (check `~/Documents/LrClassicLogs/LightroomClassicMCPServer.log` for "Starting poll loop").
