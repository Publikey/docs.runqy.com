# Local Development

This guide covers setting up a complete local development environment for runqy.

## Prerequisites

- Go 1.21+
- Python 3.9+
- Redis
- Git

## Setup

### 1. Start Redis

=== "Docker"

    ```bash
    docker run -d --name redis -p 6379:6379 redis:7-alpine
    ```

=== "macOS"

    ```bash
    brew install redis
    brew services start redis
    ```

=== "Linux"

    ```bash
    sudo apt install redis-server
    sudo systemctl start redis
    ```

### 2. Clone Repositories

```bash
mkdir runqy-dev && cd runqy-dev

git clone https://github.com/Publikey/runqy.git
git clone https://github.com/Publikey/runqy-worker.git
```

### 3. Start PostgreSQL (optional, for full features)

=== "Docker"

    ```bash
    docker run -d --name postgres -p 5432:5432 \
      -e POSTGRES_PASSWORD=devpassword \
      postgres:15-alpine
    ```

=== "Skip"

    PostgreSQL is optional for basic local development. The server can function with Redis-only configuration.

### 4. Configure and Start Server

```bash
cd runqy

# Create environment file
cp .env.secret.sample .env.secret

# Edit .env.secret with your credentials:
cat > .env.secret << 'EOF'
REDIS_HOST=localhost
REDIS_PASSWORD=
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=devpassword
DATABASE_DBNAME=runqy_dev
RUNQY_API_KEY=dev-api-key
EOF

cd app && go run .
```

The server starts on port 3000 by default.

### 5. Configure and Start Worker

In a new terminal:

```bash
cd runqy-worker

cat > config.yml << 'EOF'
server:
  url: "http://localhost:3000"
  api_key: "dev-api-key"
worker:
  queue: "inference"
  concurrency: 1
  shutdown_timeout: 30s
deployment:
  dir: "./deployment"
EOF

go run ./cmd/worker
```

## Testing

### Test Python Task Directly

```bash
cd test-dummy-task
echo '{"task_id":"t1","payload":{"foo":"bar"}}' | python python/hello_world/dummy_task.py
```

### Enqueue a Task

```bash
redis-cli

HSET asynq:t:test-1 type task payload '{"msg":"hello"}' retry 0 max_retry 2 queue inference.default
LPUSH asynq:inference.default:pending test-1
```

### Check Results

```bash
redis-cli GET asynq:result:test-1
```

### Monitor Worker Health

```bash
redis-cli HGETALL "asynq:workers:*"
```

## Debugging

### View Worker Logs

The worker outputs logs to stdout. Look for:

- `Registered with server` — Successful server connection
- `Deployed code` — Git clone completed
- `Python process ready` — Received `{"status": "ready"}`
- `Processing task` — Dequeued a task
- `Task completed` — Task finished successfully

### View Python Process Output

In long-running mode, the Python process communicates via stdin/stdout. To debug:

1. Add logging to stderr in your task code:
   ```python
   import sys
   print("Debug message", file=sys.stderr)
   ```

2. The worker will forward stderr to its own logs.

### Common Issues

**Worker can't connect to server:**

- Check server is running on the configured port
- Verify API key matches between server and worker configs

**Python process won't start:**

- Check `startup_cmd` is correct
- Verify Python dependencies are installed
- Look for syntax errors in task code

**Tasks stuck in pending:**

- Check worker is healthy (Redis heartbeat)
- Verify queue names match (including sub-queues)
