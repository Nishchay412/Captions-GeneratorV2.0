export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export type JobStage =
  | "UPLOAD"
  | "DISPATCH"
  | "EXTRACT_AUDIO"
  | "TRANSCRIBE"
  | "EMBED"
  | "DONE";

export type CaptionJob = {
  jobId: string;
  status: JobStatus;
  stage: JobStage;
  inputKey?: string;   // later: S3 key
  outputKey?: string;  // later: S3 key
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};
