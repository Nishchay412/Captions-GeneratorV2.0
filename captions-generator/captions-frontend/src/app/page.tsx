"use client";

import { useEffect, useState } from "react";
import type { CaptionJob } from "@/lib/job";

async function createJob(): Promise<CaptionJob> {
  const res = await fetch("/api/jobs", { method: "POST" });
  if (!res.ok) throw new Error("Failed to create job");
  return res.json();
}

async function getJob(jobId: string): Promise<CaptionJob> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}
async function uploadVideoToS3(jobId: string, file: File) {
  // 1) get signed URL
  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!presignRes.ok) throw new Error("Failed to presign upload");
  const { url, key } = await presignRes.json();

  // 2) upload to S3
  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload to S3 failed");

  // 3) save inputKey on the job
  const patchRes = await fetch(`/api/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputKey: key, stage: "DISPATCH" }),
  });
  if (!patchRes.ok) throw new Error("Failed to attach inputKey to job");

  return key;
}


async function startWorker(jobId: string) {
  const res = await fetch(`/api/jobs/${jobId}/start`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to start worker");
}

export default function Home() {
  const [job, setJob] = useState<CaptionJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!job?.jobId || !polling) return;

    const id = setInterval(async () => {
      try {
        const latest = await getJob(job.jobId);
        setJob(latest);

        if (latest.status === "COMPLETED" || latest.status === "FAILED") {
          setPolling(false);
        }
      } catch (e: any) {
        setError(e?.message ?? "Polling error");
        setPolling(false);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [job?.jobId, polling]);

  async function onCreate() {
    setError(null);
    try {
      const j = await createJob();
      setJob(j);
      setPolling(true);
    } catch (e: any) {
      setError(e?.message ?? "Create job failed");
    }
  }

  async function onStartProcessing() {
    if (!job) return;
    setError(null);
    try {
      await startWorker(job.jobId);
      setPolling(true);
    } catch (e: any) {
      setError(e?.message ?? "Start worker failed");
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Captions Generator (Local MVP)</h1>

      <div className="rounded-xl border p-4 space-y-3">
        <p className="text-sm text-gray-600">
          For now, this creates a job and simulates processing in the Go worker.
          Next we’ll replace simulation with S3 + FFmpeg + Transcribe.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCreate}
            className="px-4 py-2 rounded-lg bg-black text-white"
          >
            Create Job
          </button>

          <button
            onClick={onStartProcessing}
            disabled={!job}
            className="px-4 py-2 rounded-lg border disabled:opacity-50"
          >
            Start Processing (Worker)
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-2">
          <input
              type="file"
              accept="video/*"
              onChange={async (e) => {
                if (!job) return;
                const file = e.target.files?.[0];
                if (!file) return;
                await uploadVideoToS3(job.jobId, file);
              }}
    />
        <h2 className="font-medium">Job Status</h2>
        {!job ? (
          <p className="text-sm text-gray-600">No job yet.</p>
        ) : (
          <div className="text-sm space-y-1">
            <div><span className="font-medium">Job ID:</span> {job.jobId}</div>
            <div><span className="font-medium">Status:</span> {job.status}</div>
            <div><span className="font-medium">Stage:</span> {job.stage}</div>
            <div>
              <span className="font-medium">Output:</span>{" "}
              {job.outputKey ? job.outputKey : "—"}
            </div>
            <div>
              <span className="font-medium">Updated:</span> {job.updatedAt}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </main>
  );
}
