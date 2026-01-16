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

git clone https://github.com/Publikey/runqy-server-minimal.git
git clone https://github.com/Publikey/runqy-worker.git
git clone https://github.com/Publikey/runqy-python.git
git clone https://github.com/Publikey/test-dummy-task.git
```

### 3. Configure and Start Server

```bash
cd runqy-server-minimal

cat > config.yml << 'EOF'
server:
  port: 8081
  api_key: "dev-api-key-12345"
redis:
  addr: "localhost:6379"
queues:
  inference:
    priority: 6
    mode: long_running
    deployment:
      git_url: "file://../test-dummy-task"
      branch: "main"
      startup_cmd: "python python/hello_world/dummy_task.py"
      startup_timeout_secs: 60
  simple:
    priority: 3
    mode: one_shot
    deployment:
      git_url: "file://../test-dummy-task"
      branch: "main"
      startup_cmd: "python python/hello_world/simple_task.py"
      startup_timeout_secs: 30
EOF

go run .
```

### 4. Configure and Start Worker

In a new terminal:

```bash
cd runqy-worker

cat > config.yml << 'EOF'
server:
  url: "http://localhost:8081"
  api_key: "dev-api-key-12345"
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

HSET asynq:t:test-1 type task payload '{"msg":"hello"}' retry 0 max_retry 2 queue inference:default
LPUSH asynq:inference:default:pending test-1
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
