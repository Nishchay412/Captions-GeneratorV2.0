import { CaptionJob } from "./job";

const jobs = new Map<string, CaptionJob>();

export function createJob(): CaptionJob {
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const job: CaptionJob = {
    jobId,
    status: "QUEUED",
    stage: "UPLOAD",
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): CaptionJob | null {
  return jobs.get(jobId) ?? null;
}

export function updateJob(jobId: string, patch: Partial<CaptionJob>): CaptionJob | null {
  const existing = jobs.get(jobId);
  if (!existing) return null;

  const updated: CaptionJob = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, updated);
  return updated;
}
