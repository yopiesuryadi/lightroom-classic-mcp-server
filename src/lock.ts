import fs from "node:fs";
import path from "node:path";

type LockPayload = {
  pid: number;
  started_at: string;
};

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireSingleProcessLock(lockFile: string): () => void {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  if (fs.existsSync(lockFile)) {
    const raw = fs.readFileSync(lockFile, "utf8");
    try {
      const existing = JSON.parse(raw) as LockPayload;
      if (Number.isInteger(existing.pid) && isProcessAlive(existing.pid)) {
        throw new Error(
          `Another lightroom-classic-mcp-server process is already running with pid ${existing.pid}. ` +
            `Stop it or remove ${lockFile} if the process is stale.`
        );
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Corrupt lock files are treated as stale and replaced below.
      } else {
        throw error;
      }
    }
  }

  const payload: LockPayload = {
    pid: process.pid,
    started_at: new Date().toISOString()
  };
  fs.writeFileSync(lockFile, JSON.stringify(payload, null, 2));

  const release = (): void => {
    try {
      const raw = fs.readFileSync(lockFile, "utf8");
      const existing = JSON.parse(raw) as LockPayload;
      if (existing.pid === process.pid) fs.unlinkSync(lockFile);
    } catch {
      // Best effort cleanup.
    }
  };

  process.once("exit", release);
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(143);
  });

  return release;
}
