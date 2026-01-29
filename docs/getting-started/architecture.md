# Architecture

runqy uses a server-driven bootstrap architecture where workers are stateless and receive all configuration from a central server.

## System Overview

```
┌─────────────────────┐    ┌─────────────────┐    ┌───────────────┐
│ runqy-server        │    │     Redis       │    │   Clients     │
│                     │───→│                 │←───│   (enqueue)   │
│ POST /worker/       │    │ - Task queues   │    │               │
│   register          │    │ - Worker state  │    │               │
└─────────────────────┘    │ - Results       │    └───────────────┘
         │                 └─────────────────┘
         │ config +                ↑
         │ deployment              │ dequeue/heartbeat
         ↓                         │
┌──────────────────────────────────────────────────────────────────┐
│                      runqy-worker (Go)                           │
│                                                                  │
│  Bootstrap:                                                      │
│    1. POST /worker/register → receive Redis creds + git repo    │
│    2. git clone deployment code                                 │
│    3. Create virtualenv, pip install                            │
│    4. Spawn Python process (startup_cmd)                        │
│    5. Wait for {"status": "ready"} on stdout                    │
│                                                                  │
│  Run loop:                                                       │
│    1. Dequeue task from Redis                                   │
│    2. Send JSON to Python via stdin                             │
│    3. Read JSON response from stdout                            │
│    4. Write result back to Redis                                │
└──────────────────────────────────────────────────────────────────┘
         │
         │ stdin/stdout JSON
         ↓
┌──────────────────────────────────────────────────────────────────┐
│                    Python Task (runqy-python SDK)                  │
│                                                                  │
│  @load   → runs once at startup, returns ctx (e.g., ML model)   │
│  @task   → handles each task, receives payload + ctx            │
│  run()   → enters stdin/stdout loop                             │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### runqy-server

The server is the central control plane:

- **Worker registration**: Authenticates workers and provides them with Redis credentials and deployment configuration
- **Queue configuration**: Defines which queues exist and how tasks should be routed
- **Deployment specs**: Specifies which git repository, branch, and startup command each queue uses

### runqy-worker

The worker is the execution engine:

- **Bootstrap**: Fetches configuration from the server, deploys code, sets up the Python environment
- **Task processing**: Dequeues tasks from Redis, forwards them to the Python process
- **Process supervision**: Monitors the Python process health, reports status via heartbeat
- **Result handling**: Writes task results back to Redis

### runqy-python (Python SDK)

The SDK provides a simple interface for writing task handlers:

- **`@load` decorator**: Marks a function that runs once at startup (e.g., loading an ML model)
- **`@task` decorator**: Marks a function that handles each task
- **`run()` function**: Enters the stdin/stdout loop for long-running mode
- **`run_once()` function**: Processes a single task for one-shot mode

## Queue Organization

### Sub-Queues and Priority

runqy supports sub-queues to handle different priority levels for the same task type. This is particularly useful when different user tiers or applications need the same processing but with different service levels.

**Example: Paid vs Free Users**

```
inference.premium  (priority: 10) ─┐
                                   ├─→ Same task code (same deployment)
inference.standard (priority: 3)  ─┘
```

Both sub-queues run identical task code, but workers prioritize `inference.premium` tasks. Your API routes users based on their tier:

- Paid user request → enqueue to `inference.premium`
- Free user request → enqueue to `inference.standard`

When workers have capacity, they process higher-priority sub-queues first, ensuring paid users experience lower latency.

### Queue Naming

Queues use the format `{parent}.{sub_queue}`:

- `inference.premium` — High priority
- `inference.standard` — Standard priority
- `simple.default` — Default (when no sub-queue specified)

When you reference a queue without a sub-queue suffix (e.g., `inference`), runqy automatically appends `.default` (→ `inference.default`).

## Communication Protocol

### Worker ↔ Python Process

Communication uses JSON over stdin/stdout:

**Ready signal** (Python → Worker, after `@load` completes):
```json
{"status": "ready"}
```

**Task input** (Worker → Python):
```json
{"task_id": "abc123", "payload": {"msg": "hello"}}
```

**Task response** (Python → Worker):
```json
{"task_id": "abc123", "result": {...}, "error": null, "retry": false}
```

### Redis Key Format

runqy uses an asynq-compatible key format:

| Key | Purpose |
|-----|---------|
| `asynq:{queue}:pending` | List of pending task IDs |
| `asynq:{queue}:active` | List of currently processing task IDs |
| `asynq:t:{task_id}` | Hash containing task data |
| `asynq:result:{task_id}` | Task result string |
| `asynq:workers:{worker_id}` | Worker heartbeat hash |

## Failure Handling

### Python Process Crash

If the supervised Python process crashes:

1. Worker detects the crash via process monitor
2. All in-flight tasks fail immediately (no retry)
3. Worker updates heartbeat with `healthy: false`
4. Worker continues running but won't process new tasks
5. Manual restart is required (no auto-recovery)

### Task Failure

If a task returns an error:

1. Worker writes the error to Redis
2. If `retry: true` in response, task may be retried (up to `max_retry`)
3. Otherwise, task is marked as failed
