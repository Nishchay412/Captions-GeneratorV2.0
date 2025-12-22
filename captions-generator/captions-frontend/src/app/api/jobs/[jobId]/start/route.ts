import { NextResponse } from "next/server";
import { getJob } from "@/lib/dynamoJobs";

type Ctx = { params: Promise<{ jobId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { jobId } = await params;

  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Server-to-server call: no CORS
  const workerUrl = `http://localhost:8081/process?jobId=${jobId}`;
  const res = await fetch(workerUrl, { method: "POST" });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Worker failed: ${res.status} ${res.statusText}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
