import http from "node:http";
import { URL } from "node:url";
import type { JobStore } from "./jobs.js";
import type { Logger } from "./logger.js";
import type { ServerConfig } from "./config.js";

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

export function startPluginBridge(config: ServerConfig, jobs: JobStore, logger: Logger): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${config.bridgeHost}:${config.bridgePort}`);

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, server: "lightroom-classic-mcp-server" });
        return;
      }

      if (req.method === "POST" && url.pathname === "/plugin/claim-next") {
        const job = jobs.claimNext();
        if (!job) {
          sendJson(res, 200, { job: null });
          return;
        }
        logger.info("job claimed by Lightroom plugin", { job_id: job.id, kind: job.kind });
        sendJson(res, 200, { job });
        return;
      }

      const match = url.pathname.match(/^\/plugin\/jobs\/([^/]+)$/);
      if (req.method === "POST" && match) {
        const payload = await readJson(req);
        const job = jobs.update(match[1], {
          status: payload.status as any,
          progress: payload.progress as any,
          result: payload.result as any,
          error: typeof payload.error === "string" ? payload.error : undefined
        });
        if (!job) {
          sendJson(res, 404, { error: "job not found" });
          return;
        }
        logger.info("job updated by Lightroom plugin", { job_id: job.id, status: job.status });
        sendJson(res, 200, { job });
        return;
      }

      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      logger.error("bridge request failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      sendJson(res, 500, { error: "internal server error" });
    }
  });

  server.listen(config.bridgePort, config.bridgeHost, () => {
    logger.info("Lightroom plugin bridge listening", {
      host: config.bridgeHost,
      port: config.bridgePort
    });
  });

  return server;
}
