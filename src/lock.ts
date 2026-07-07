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

  while (true) {
    try {
      const payload: LockPayload = {
        pid: process.pid,
        started_at: new Date().toISOString()
      };
      fs.writeFileSync(lockFile, JSON.stringify(payload, null, 2), { flag: "wx" });
      break;
    } catch (error) {
      if (!isFileExistsError(error)) throw error;

      const raw = fs.readFileSync(lockFile, "utf8");
      let existing: LockPayload | undefined;

      try {
        existing = JSON.parse(raw) as LockPayload;
      } catch {
        fs.unlinkSync(lockFile);
        continue;
      }

      if (Number.isInteger(existing.pid) && isProcessAlive(existing.pid)) {
        throw new Error(
          `Another lightroom-classic-mcp-server process is already running with pid ${existing.pid}. ` +
            `Stop it or remove ${lockFile} if the process is stale.`
        );
      }

      try {
        fs.unlinkSync(lockFile);
      } catch (unlinkError) {
        if (!isFileNotFoundError(unlinkError)) throw unlinkError;
      }
    }
  }

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

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
