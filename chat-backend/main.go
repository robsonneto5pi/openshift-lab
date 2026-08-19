package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openshift-lab/chat-backend/chat"
	rdb "github.com/openshift-lab/chat-backend/redis"
)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	redisAddr := getEnv("REDIS_HOST", "redis") + ":" + getEnv("REDIS_PORT", "6379")
	redisPass := getEnv("REDIS_PASSWORD", "redis-lab-pass")
	port := getEnv("PORT", "8080")

	log.Printf("Connecting to Redis at %s", redisAddr)
	redisClient := rdb.NewClient(redisAddr, redisPass)
	defer redisClient.Close()

	// Ping Redis na inicialização
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := redisClient.Ping(ctx); err != nil {
		log.Fatalf("Cannot connect to Redis: %v", err)
	}
	log.Println("Redis connected OK")

	hub := chat.NewHub(redisClient)
	go hub.Run()

	gin.SetMode(getEnv("GIN_MODE", "release"))
	r := gin.Default()

	// CORS para acesso cross-origin (nginx-sample → golang-sample)
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		c.Next()
	})

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.GET("/ready", func(c *gin.Context) {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel2()
		if err := redisClient.Ping(ctx2); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready", "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	r.GET("/ws", func(c *gin.Context) {
		chat.ServeWs(hub, c.Writer, c.Request)
	})

	srv := &http.Server{Addr: ":" + port, Handler: r}
	go func() {
		log.Printf("Chat backend listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
	ctx3, cancel3 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel3()
	_ = srv.Shutdown(ctx3)
	log.Println("Server stopped")
}
