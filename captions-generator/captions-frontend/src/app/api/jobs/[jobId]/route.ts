import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/dynamoJobs";
import type { CaptionJob, JobStage, JobStatus } from "@/lib/job";

type Ctx = { params: Promise<{ jobId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { jobId } = await params;

  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { jobId } = await params;

  const existing = getJob(jobId);
  if (!existing) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = (await req.json()) as Partial<CaptionJob>;

  const allowedStatuses: JobStatus[] = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"];
  const allowedStages: JobStage[] = [
    "UPLOAD",
    "DISPATCH",
    "EXTRACT_AUDIO",
    "TRANSCRIBE",
    "EMBED",
    "DONE",
  ];

  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.stage && !allowedStages.includes(body.stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  const updated = updateJob(jobId, body);
  return NextResponse.json(updated);
}
