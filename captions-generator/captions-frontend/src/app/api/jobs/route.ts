import { NextResponse } from "next/server";
import { createJob } from "@/lib/inMemoryJobs";

export async function POST() {
  const job = createJob();
  return NextResponse.json(job, { status: 201 });
}
