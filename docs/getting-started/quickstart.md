# Quick Start

This guide walks you through setting up a local runqy environment.

## Prerequisites

- Go 1.21+
- Python 3.9+
- Redis server
- Git

## 1. Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or install locally
redis-server
```

## 2. Start the Server

```bash
git clone https://github.com/Publikey/runqy.git
cd runqy

# Create environment file
cp .env.secret.sample .env.secret

# Edit .env.secret with your credentials:
# REDIS_HOST=localhost
# REDIS_PASSWORD=your-redis-password
# DATABASE_HOST=localhost
# DATABASE_PASSWORD=your-db-password
# ASYNQ_API_KEY=dev-api-key-12345

cd app && go run .
```

The server will start on port 3000 by default.

## 3. Start a Worker

In a new terminal:

```bash
git clone https://github.com/Publikey/runqy-worker.git
cd runqy-worker

# Create config file
cat > config.yml << 'EOF'
server:
  url: "http://localhost:3000"
  api_key: "dev-api-key-12345"
worker:
  queue: "inference"
  concurrency: 1
  shutdown_timeout: 30s
deployment:
  dir: "./deployment"
EOF

go build ./cmd/worker && ./worker
```

The worker will:

1. Register with the server
2. Clone the task code
3. Set up a Python environment
4. Start the Python process
5. Begin processing tasks

## 4. Enqueue a Task

```bash
redis-cli

# Create task data
HSET asynq:t:test-1 type task payload '{"msg":"hello"}' retry 0 max_retry 2 queue inference:default

# Push to pending queue
LPUSH asynq:inference:default:pending test-1
```

## 5. Check the Result

```bash
redis-cli GET asynq:result:test-1
```

## Next Steps

- [Architecture Overview](architecture.md) — Understand how the components work together
- [Python SDK](../python-sdk/index.md) — Write your own task handlers
