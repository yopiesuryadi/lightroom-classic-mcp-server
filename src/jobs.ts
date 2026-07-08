import crypto from "node:crypto";

export type JobKind = "import" | "export" | "edit" | "preview" | "list_presets" | "apply_preset";
export type JobStatus = "queued" | "claimed" | "running" | "succeeded" | "failed" | "cancelled";

export type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  claimed_at?: string;
  completed_at?: string;
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  progress?: {
    current?: number;
    total?: number;
    message?: string;
  };
};

export class JobStore {
  private readonly jobs = new Map<string, Job>();

  create(kind: JobKind, request: Record<string, unknown>): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: crypto.randomUUID(),
      kind,
      status: "queued",
      created_at: now,
      updated_at: now,
      request
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(limit = 50): Job[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  claimNext(): Job | undefined {
    const job = [...this.jobs.values()]
      .filter((item) => item.status === "queued")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

    if (!job) return undefined;
    const now = new Date().toISOString();
    job.status = "claimed";
    job.claimed_at = now;
    job.updated_at = now;
    return job;
  }

  update(
    id: string,
    patch: Partial<Pick<Job, "status" | "result" | "error" | "progress">>
  ): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    Object.assign(job, patch, { updated_at: new Date().toISOString() });
    if (["succeeded", "failed", "cancelled"].includes(job.status)) {
      job.completed_at = job.completed_at ?? new Date().toISOString();
    }
    return job;
  }

  cancel(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    if (["succeeded", "failed", "cancelled"].includes(job.status)) return job;
    return this.update(id, { status: "cancelled" });
  }
}
