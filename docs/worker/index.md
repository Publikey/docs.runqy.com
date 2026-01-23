# runqy Worker

The runqy worker (`runqy-worker`) is a Go binary that processes tasks from Redis and supervises Python processes.

## Overview

The worker:

- **Bootstraps** by registering with the server and deploying task code
- **Supervises** a Python process for task execution
- **Processes** tasks from Redis queues
- **Reports** health status via heartbeat

## Installation

### Binary Download

Download pre-built binaries from the [GitHub releases page](https://github.com/publikey/runqy-worker/releases).

=== "Linux (amd64)"

    ```bash
    curl -LO https://github.com/publikey/runqy-worker/releases/latest/download/runqy-worker_latest_linux_amd64.tar.gz
    tar -xzf runqy-worker_latest_linux_amd64.tar.gz
    ./runqy-worker -config config.yml
    ```

=== "macOS (Apple Silicon)"

    ```bash
    curl -LO https://github.com/publikey/runqy-worker/releases/latest/download/runqy-worker_latest_darwin_arm64.tar.gz
    tar -xzf runqy-worker_latest_darwin_arm64.tar.gz
    ./runqy-worker -config config.yml
    ```

=== "Windows (amd64)"

    ```powershell
    Invoke-WebRequest -Uri https://github.com/publikey/runqy-worker/releases/latest/download/runqy-worker_latest_windows_amd64.zip -OutFile runqy-worker.zip
    Expand-Archive runqy-worker.zip -DestinationPath .
    .\runqy-worker.exe -config config.yml
    ```

### Docker

Docker images are available at `ghcr.io/publikey/runqy-worker`.

=== "Minimal (default)"

    Lightweight Alpine-based image. You install your own runtime (Python, Node, etc.).

    - **Image:** `ghcr.io/publikey/runqy-worker:latest` or `:minimal`
    - **Base:** Alpine 3.19 with git, curl, ca-certificates
    - **Platforms:** linux/amd64, linux/arm64

    ```bash
    docker run -v $(pwd)/config.yml:/app/config.yml ghcr.io/publikey/runqy-worker:latest
    ```

=== "Inference"

    Pre-configured for ML workloads with PyTorch and CUDA.

    - **Image:** `ghcr.io/publikey/runqy-worker:inference`
    - **Base:** PyTorch 2.1.0 + CUDA 11.8
    - **Platform:** linux/amd64 only
    - **Includes:** Python 3, pip, PyTorch, CUDA runtime

    ```bash
    docker run --gpus all -v $(pwd)/config.yml:/app/config.yml ghcr.io/publikey/runqy-worker:inference
    ```

=== "Docker Compose"

    ```yaml
    version: "3.8"
    services:
      worker:
        image: ghcr.io/publikey/runqy-worker:latest
        volumes:
          - ./config.yml:/app/config.yml
          - ./deployment:/app/deployment
        restart: unless-stopped
    ```

#### Available Tags

| Tag | Description |
|-----|-------------|
| `latest`, `minimal` | Minimal Alpine image (multi-arch) |
| `inference` | PyTorch + CUDA image (amd64 only) |
| `<version>` | Specific version, minimal base |
| `<version>-minimal` | Specific version, minimal base |
| `<version>-inference` | Specific version, inference base |

### From Source

```bash
git clone https://github.com/Publikey/runqy-worker.git
cd runqy-worker
go build -o runqy-worker ./cmd/worker
```

## Running

```bash
./runqy-worker -config config.yml
```

## Lifecycle

1. **Register**: Worker calls `POST /worker/register` on the server
2. **Deploy**: Clone git repository and set up Python environment
3. **Start**: Spawn Python process using `startup_cmd`
4. **Wait**: Wait for `{"status": "ready"}` from Python
5. **Process**: Dequeue tasks, send to Python, write results to Redis
6. **Heartbeat**: Periodically update worker status in Redis

## Source Code

The worker is implemented in Go (~2500 lines of code):

```
runqy-worker/
├── cmd/worker/          # Binary entry point
├── internal/
│   ├── bootstrap/       # server_client, code_deploy, process_supervisor
│   ├── handler/         # stdio_handler, oneshot_handler
│   └── redis/           # Redis operations
├── worker.go            # Main Worker struct
├── processor.go         # Task dequeue loop
└── *.go                 # handler, task, heartbeat, retry, config
```

## Related

- [Configuration Reference](configuration.md)
- [Deployment Guide](deployment.md)
