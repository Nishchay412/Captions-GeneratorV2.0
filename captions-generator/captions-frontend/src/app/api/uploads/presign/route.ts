import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.S3_BUCKET_NAME!;

const s3 = new S3Client({ region: REGION });

export async function POST(req: Request) {
  const { jobId, fileName, contentType } = await req.json();

  if (!jobId || !fileName || !contentType) {
    return NextResponse.json({ error: "Missing jobId/fileName/contentType" }, { status: 400 });
  }

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `inputs/${jobId}/${Date.now()}-${safeName}`;

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
  return NextResponse.json({ url, key });
}
