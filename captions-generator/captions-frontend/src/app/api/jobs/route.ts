import { NextResponse } from "next/server";
import { createJob } from "@/lib/dynamoJobs";

export async function POST() {
  const job = await createJob();
  console.log("created job:", job);
  return NextResponse.json(job, { status: 201 });
}
