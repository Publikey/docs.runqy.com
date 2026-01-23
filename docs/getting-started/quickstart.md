# Quick Start

This guide walks you through setting up a local runqy environment with working examples.

## Prerequisites

- Docker (for Redis, or use Docker Compose for full stack)
- **One of:**
    - Pre-built binaries (recommended)
    - Go 1.24+ (to build from source)

!!! note "No database required for development"
    SQLite is embedded in the server for development. PostgreSQL is only needed for production.

## Choose Your Installation Method

=== "Quick Install (Recommended)"

    The fastest way to get started:

    **Linux/macOS:**
    ```bash
    # Install server
    curl -fsSL https://raw.githubusercontent.com/publikey/runqy/main/install.sh | sh

    # Install worker
    curl -fsSL https://raw.githubusercontent.com/publikey/runqy-worker/main/install.sh | sh
    ```

    **Windows (PowerShell):**
    ```powershell
    # Install server
    iwr https://raw.githubusercontent.com/publikey/runqy/main/install.ps1 -useb | iex

    # Install worker
    iwr https://raw.githubusercontent.com/publikey/runqy-worker/main/install.ps1 -useb | iex
    ```

=== "Docker Compose Quickstart (Recommended)"

    Run the full stack without cloning the repo:

    ```bash
    curl -O https://raw.githubusercontent.com/Publikey/runqy/main/docker-compose.quickstart.yml
    docker-compose -f docker-compose.quickstart.yml up -d
    ```

    This starts Redis, PostgreSQL, server, and worker. Skip to [Step 5](#5-enqueue-a-task).

=== "Docker Compose (Full Repo)"

    Clone the repo and run the full stack:

    ```bash
    git clone https://github.com/Publikey/runqy.git
    cd runqy
    docker-compose up -d
    ```

    This starts Redis, PostgreSQL, server, and worker. Skip to [Step 5](#5-enqueue-a-task).

=== "From Source"

    Build from source:

    ```bash
    git clone https://github.com/Publikey/runqy.git
    git clone https://github.com/Publikey/runqy-worker.git

    # Build server
    cd runqy/app && go build -o runqy .

    # Build worker
    cd ../../runqy-worker && go build -o runqy-worker ./cmd/worker
    ```

For more installation options, see the [Installation Guide](installation.md).

## 1. Start Redis

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

## 2. Start the Server

=== "Pre-built Binary"

    === "Linux/Mac"

        ```bash
        export REDIS_HOST=localhost
        export REDIS_PORT=6379
        export REDIS_PASSWORD=""
        export RUNQY_API_KEY=dev-api-key
        runqy serve --sqlite
        ```

    === "Windows (PowerShell)"

        ```powershell
        $env:REDIS_HOST = "localhost"
        $env:REDIS_PORT = "6379"
        $env:REDIS_PASSWORD = ""
        $env:RUNQY_API_KEY = "dev-api-key"
        runqy serve --sqlite
        ```

=== "From Source"

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

## 3. Deploy the Example Queues

In a new terminal:

=== "Pre-built Binary"

    === "Linux/Mac"

        ```bash
        # Download example config
        curl -fsSL https://raw.githubusercontent.com/Publikey/runqy/main/examples/quickstart.yaml -o quickstart.yaml

        runqy login -s http://localhost:3000 -k dev-api-key
        runqy config create -f quickstart.yaml
        ```

    === "Windows (PowerShell)"

        ```powershell
        # Download example config
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Publikey/runqy/main/examples/quickstart.yaml" -OutFile "quickstart.yaml"

        runqy login -s http://localhost:3000 -k dev-api-key
        runqy config create -f quickstart.yaml
        ```

=== "From Source"

    === "Linux/Mac"

        ```bash
        cd runqy/app
        go build -o runqy .
        ./runqy login -s http://localhost:3000 -k dev-api-key config create -f ../examples/quickstart.yaml
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

## 4. Start a Worker

In a new terminal:

=== "Pre-built Binary"

    === "Linux/Mac"

        ```bash
        # Download example config
        curl -fsSL https://raw.githubusercontent.com/publikey/runqy-worker/main/config.yml.example -o config.yml

        # Start worker
        runqy-worker -config config.yml
        ```

    === "Windows (PowerShell)"

        ```powershell
        # Download example config
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/publikey/runqy-worker/main/config.yml.example" -OutFile "config.yml"

        # Start worker
        runqy-worker -config config.yml
        ```

=== "From Source"

    === "Linux/Mac"

        ```bash
        cd runqy-worker
        cp config.yml.example config.yml
        go run ./cmd/worker
        ```

    === "Windows (PowerShell)"

        ```powershell
        cd runqy-worker
        Copy-Item config.yml.example config.yml
        go run ./cmd/worker
        ```

The downloaded config is pre-configured for the quickstart (no changes needed):

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
5. The worker is now ready to process tasks

## 5. Enqueue a Task

In a new terminal:

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

## 6. Check the Result

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

## 7. Monitor

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
