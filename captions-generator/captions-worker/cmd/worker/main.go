package main

import (
	"fmt"
	"log"
	"net/http"
)

func health(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "ok")
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", health)

	addr := ":8081"
	log.Printf("worker listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
