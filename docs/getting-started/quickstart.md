# Quick Start

This guide walks you through setting up a local runqy environment with working examples.

## Prerequisites

- Go 1.24+
- Docker (for Redis)
- Git

!!! note "No database required"
    SQLite is embedded in the server for development. PostgreSQL is only needed for production.

## 1. Clone the Repos

```bash
git clone https://github.com/Publikey/runqy.git
git clone https://github.com/Publikey/runqy-worker.git
```

## 2. Start Redis

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

## 3. Start the Server

=== "Linux/Mac"

    ```bash
    cd runqy/app
    export REDIS_HOST=localhost
    export REDIS_PORT=6379
    export REDIS_PASSWORD=""
    export RUNQY_API_KEY=dev-api-key
    go run . serve --sqlite
    ```

=== "Windows (PowerShell)"

    ```powershell
    cd runqy/app
    $env:REDIS_HOST = "localhost"
    $env:REDIS_PORT = "6379"
    $env:REDIS_PASSWORD = ""
    $env:RUNQY_API_KEY = "dev-api-key"
    go run . serve --sqlite
    ```

The server starts on port 3000 by default.

## 4. Deploy the Example Queues

In a new terminal:

=== "Linux/Mac"

    ```bash
    cd runqy/app
    go build -o runqy .
    ./runqy login -s http://localhost:3000 -k dev-api-key
    ./runqy config create -f ../examples/quickstart.yaml
    ```

=== "Windows (PowerShell)"

    ```powershell
    cd runqy/app
    go build -o runqy.exe .
    .\runqy.exe login -s http://localhost:3000 -k dev-api-key
    .\runqy.exe config create -f ..\examples\quickstart.yaml
    ```

This deploys two example queues:

| Queue | Mode | Description |
|-------|------|-------------|
| `quickstart-oneshot` | one_shot | Spawns a new Python process per task |
| `quickstart-longrunning` | long_running | Keeps Python process alive between tasks |

## 5. Start a Worker

In a new terminal:

```bash
cd runqy-worker
cp config.yml.example config.yml
go run ./cmd/worker
```

The example config is pre-configured for the quickstart with both queues:

```yaml
server:
  url: "http://localhost:3000"
  api_key: "dev-api-key"

worker:
  queues:
    - "quickstart-oneshot_default"
    - "quickstart-longrunning_default"
```

The worker will:

1. Register with the server
2. Clone the example task code from the runqy repo
3. Set up a Python virtual environment
4. Start the Python process
5. Begin processing tasks

## 6. Enqueue a Task

=== "Linux/Mac"

    ```bash
    curl -X POST http://localhost:3000/queue/add \
      -H "Authorization: Bearer dev-api-key" \
      -H "Content-Type: application/json" \
      -d '{
        "queue": "quickstart-oneshot_default",
        "timeout": 60,
        "data": {"operation": "uppercase", "data": "hello world"}
      }'
    ```

=== "Windows (PowerShell)"

    ```powershell
    curl.exe -X POST http://localhost:3000/queue/add `
      -H "Authorization: Bearer dev-api-key" `
      -H "Content-Type: application/json" `
      -d '{\"queue\": \"quickstart-oneshot_default\", \"timeout\": 60, \"data\": {\"operation\": \"uppercase\", \"data\": \"hello world\"}}'
    ```

Response:

```json
{
  "info": {
    "id": "abc123...",
    "state": "pending",
    "queue": "quickstart-oneshot_default",
    ...
  },
  "data": {...}
}
```

!!! tip "Task ID"
    Use the `id` from the response to check the result in the next step.

### Try Long-Running Mode

To try long-running mode, just enqueue to `quickstart-longrunning_default` — the worker already listens on both queues.

## 7. Check the Result

Replace `{id}` with the task ID from the previous step:

=== "Linux/Mac"

    ```bash
    curl http://localhost:3000/queue/{id}
    ```

=== "Windows (PowerShell)"

    ```powershell
    curl.exe http://localhost:3000/queue/{id}
    ```

Response:

```json
{
  "info": {
    "state": "completed",
    "queue": "quickstart-oneshot_default",
    "result": {"result": "HELLO WORLD"}
  }
}
```

## 8. Monitor

Visit [http://localhost:3000/monitoring/](http://localhost:3000/monitoring/) to see the web dashboard.

## Example Task Code

The quickstart uses example tasks from `runqy/examples/`:

=== "One-Shot Mode"

    ```python title="examples/quickstart-oneshot/main.py"
    from runqy_task import task, run_once

    @task
    def process(payload: dict) -> dict:
        operation = payload.get("operation", "echo")
        data = payload.get("data")

        if operation == "echo":
            return {"result": data}
        elif operation == "uppercase":
            return {"result": data.upper() if isinstance(data, str) else data}
        elif operation == "double":
            return {"result": data * 2 if isinstance(data, (int, float)) else data}
        else:
            return {"error": f"Unknown operation: {operation}"}

    if __name__ == "__main__":
        run_once()
    ```

=== "Long-Running Mode"

    ```python title="examples/quickstart-longrunning/main.py"
    from runqy_task import task, load, run

    @load
    def setup():
        # Initialize resources once at startup
        return {"processor": SimpleProcessor()}

    @task
    def process(payload: dict, ctx: dict) -> dict:
        processor = ctx["processor"]
        operation = payload.get("operation", "echo")
        data = payload.get("data")
        result = processor.process(operation, data)
        return {"result": result, "calls": processor.call_count}

    if __name__ == "__main__":
        run()
    ```

## Next Steps

- [Architecture Overview](architecture.md) — Understand how the components work together
- [Python SDK](../python-sdk/index.md) — Write your own task handlers
- [Configuration](../server/configuration.md) — Configure the server for production
