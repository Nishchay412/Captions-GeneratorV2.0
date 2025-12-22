package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

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

// Simulate the pipeline stages (later this becomes FFmpeg + Transcribe + S3 uploads)
func runFakePipeline(nextBaseURL, jobID string) {
	steps := []PatchJobRequest{
		{Status: "PROCESSING", Stage: "DISPATCH"},
		{Status: "PROCESSING", Stage: "EXTRACT_AUDIO"},
		{Status: "PROCESSING", Stage: "TRANSCRIBE"},
		{Status: "PROCESSING", Stage: "EMBED"},
		{Status: "COMPLETED", Stage: "DONE", OutputKey: "local/output/demo-captioned.mp4"},
	}

	for _, step := range steps {
		time.Sleep(2 * time.Second)
		if err := patchJob(nextBaseURL, jobID, step); err != nil {
			log.Printf("job %s update error: %v", jobID, err)
			return
		}
		log.Printf("job %s -> status=%s stage=%s", jobID, step.Status, step.Stage)
	}
}

func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// Handle preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		h(w, r)
	}
}

func main() {
	// Change this if your Next server is not on 3000
	nextBaseURL := "http://localhost:3000"

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	// Call this to start fake processing:
	// POST http://localhost:8081/process?jobId=<jobId>
	http.HandleFunc("/process", withCORS(func(w http.ResponseWriter, r *http.Request) {
		jobID := r.URL.Query().Get("jobId")
		if jobID == "" {
			http.Error(w, "missing jobId", http.StatusBadRequest)
			return
		}

		go runFakePipeline(nextBaseURL, jobID)
		w.WriteHeader(http.StatusAccepted)
		fmt.Fprintf(w, "started processing job %s\n", jobID)
	}))

	addr := ":8081"
	log.Printf("worker listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
