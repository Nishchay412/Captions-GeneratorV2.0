import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import type { CaptionJob, JobStage, JobStatus } from "./job";

const REGION = process.env.AWS_REGION;
const TABLE = process.env.DDB_TABLE_NAME;

if (!REGION) throw new Error("Missing AWS_REGION in environment");
if (!TABLE) throw new Error("Missing DDB_TABLE_NAME in environment");

// Uses your local AWS credentials (aws configure) or env creds
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  {
    marshallOptions: { removeUndefinedValues: true },
  }
);

export async function createJob(): Promise<CaptionJob> {
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

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: job,
      // Safety: don't overwrite an existing jobId (extremely unlikely, but correct)
      ConditionExpression: "attribute_not_exists(jobId)",
    })
  );

  return job;
}

export async function getJob(jobId: string): Promise<CaptionJob | null> {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { jobId },
    })
  );

  return (out.Item as CaptionJob) ?? null;
}

function isAllowedStatus(x: unknown): x is JobStatus {
  return x === "QUEUED" || x === "PROCESSING" || x === "COMPLETED" || x === "FAILED";
}

function isAllowedStage(x: unknown): x is JobStage {
  return (
    x === "UPLOAD" ||
    x === "DISPATCH" ||
    x === "EXTRACT_AUDIO" ||
    x === "TRANSCRIBE" ||
    x === "EMBED" ||
    x === "DONE"
  );
}

export async function updateJob(
  jobId: string,
  patch: Partial<CaptionJob>
): Promise<CaptionJob | null> {
  // Only allow updating these fields (keeps your DB clean)
  const updates: Partial<CaptionJob> = {};

  if (patch.status && isAllowedStatus(patch.status)) updates.status = patch.status;
  if (patch.stage && isAllowedStage(patch.stage)) updates.stage = patch.stage;

  if (typeof patch.outputKey === "string") updates.outputKey = patch.outputKey;
  if (typeof patch.inputKey === "string") updates.inputKey = patch.inputKey;

  if (patch.error === null || typeof patch.error === "string") updates.error = patch.error;

  // Always update updatedAt
  updates.updatedAt = new Date().toISOString();

  const keys = Object.keys(updates) as (keyof CaptionJob)[];
  if (keys.length === 0) {
    // Nothing valid to update; return current record
    return await getJob(jobId);
  }

  // Build UpdateExpression dynamically
  // Example: SET #status = :status, #stage = :stage, #updatedAt = :updatedAt
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, any> = {};
  const setParts: string[] = [];

  for (const k of keys) {
    const nameKey = `#${k}`;
    const valueKey = `:${k}`;
    exprNames[nameKey] = k;
    exprValues[valueKey] = (updates as any)[k];
    setParts.push(`${nameKey} = ${valueKey}`);
  }

  const out = await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { jobId },
      UpdateExpression: `SET ${setParts.join(", ")}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      // Safety: don't create new items via update
      ConditionExpression: "attribute_exists(jobId)",
      ReturnValues: "ALL_NEW",
    })
  );

  return (out.Attributes as CaptionJob) ?? null;
}
