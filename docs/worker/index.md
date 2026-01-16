# runqy Worker

The runqy worker (`runqy-worker`) is a Go binary that processes tasks from Redis and supervises Python processes.

## Overview

The worker:

- **Bootstraps** by registering with the server and deploying task code
- **Supervises** a Python process for task execution
- **Processes** tasks from Redis queues
- **Reports** health status via heartbeat

## Installation

```bash
git clone https://github.com/Publikey/runqy-worker.git
cd runqy-worker
go build ./cmd/worker
```

## Running

```bash
./worker -config config.yml
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
