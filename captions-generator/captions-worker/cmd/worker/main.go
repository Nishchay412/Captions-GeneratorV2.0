package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type CaptionJob struct {
	JobID    string `json:"jobId"`
	Status   string `json:"status"`
	Stage    string `json:"stage"`
	InputKey string `json:"inputKey"`
}

type PatchJobRequest struct {
	Status    string `json:"status,omitempty"`
	Stage     string `json:"stage,omitempty"`
	OutputKey string `json:"outputKey,omitempty"`
	Error     string `json:"error,omitempty"`
}

func patchJob(nextBaseURL, jobID string, patch PatchJobRequest) error {
	b, err := json.Marshal(patch)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/jobs/%s", nextBaseURL, jobID)
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("patch failed: %s", resp.Status)
	}
	return nil
}

func getJob(nextBaseURL, jobID string) (*CaptionJob, error) {
	url := fmt.Sprintf("%s/api/jobs/%s", nextBaseURL, jobID)
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("get job failed: %s", resp.Status)
	}

	var job CaptionJob
	if err := json.NewDecoder(resp.Body).Decode(&job); err != nil {
		return nil, err
	}
	return &job, nil
}

func downloadFromS3(ctx context.Context, s3c *s3.Client, bucket, key, destPath string) error {
	out, err := s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &bucket,
		Key:    &key,
	})
	if err != nil {
		return err
	}
	defer out.Body.Close()

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}

	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(f, out.Body)
	return err
}

func runPipeline(nextBaseURL string, s3c *s3.Client, bucket, jobID string) {
	ctx := context.Background()

	// stage: dispatch
	_ = patchJob(nextBaseURL, jobID, PatchJobRequest{Status: "PROCESSING", Stage: "DISPATCH"})
	time.Sleep(300 * time.Millisecond)

	job, err := getJob(nextBaseURL, jobID)
	if err != nil {
		log.Printf("job %s read error: %v", jobID, err)
		_ = patchJob(nextBaseURL, jobID, PatchJobRequest{Status: "FAILED", Stage: "DISPATCH", Error: err.Error()})
		return
	}

	if job.InputKey == "" {
		err := fmt.Errorf("missing inputKey on job (upload not completed)")
		log.Printf("job %s error: %v", jobID, err)
		_ = patchJob(nextBaseURL, jobID, PatchJobRequest{Status: "FAILED", Stage: "DISPATCH", Error: err.Error()})
		return
	}

	// stage: "download"
	_ = patchJob(nextBaseURL, jobID, PatchJobRequest{Status: "PROCESSING", Stage: "EXTRACT_AUDIO"})

	dest := filepath.Join("tmp", fmt.Sprintf("%s.mp4", jobID))
	if err := downloadFromS3(ctx, s3c, bucket, job.InputKey, dest); err != nil {
		log.Printf("job %s s3 download error: %v", jobID, err)
		_ = patchJob(nextBaseURL, jobID, PatchJobRequest{Status: "FAILED", Stage: "EXTRACT_AUDIO", Error: err.Error()})
		return
	}

	log.Printf("job %s downloaded input to %s", jobID, dest)

	// for now, just mark done
	_ = patchJob(nextBaseURL, jobID, PatchJobRequest{Status: "COMPLETED", Stage: "DONE", OutputKey: "local/tmp/" + jobID + ".mp4"})
}

func main() {
	nextBaseURL := "http://localhost:3000"
	region := os.Getenv("AWS_REGION")
	bucket := os.Getenv("S3_BUCKET_NAME")

	if region == "" || bucket == "" {
		log.Fatal("Missing AWS_REGION or S3_BUCKET_NAME env vars")
	}

	cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(region))
	if err != nil {
		log.Fatalf("aws config error: %v", err)
	}
	s3c := s3.NewFromConfig(cfg)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	http.HandleFunc("/process", func(w http.ResponseWriter, r *http.Request) {
		jobID := r.URL.Query().Get("jobId")
		if jobID == "" {
			http.Error(w, "missing jobId", http.StatusBadRequest)
			return
		}

		go runPipeline(nextBaseURL, s3c, bucket, jobID)
		w.WriteHeader(http.StatusAccepted)
		fmt.Fprintf(w, "started processing job %s\n", jobID)
	})

	addr := ":8081"
	log.Printf("worker listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
