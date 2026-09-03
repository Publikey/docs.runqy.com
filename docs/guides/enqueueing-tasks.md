---
description: "Enqueue tasks into Runqy from Python, the CLI, the REST API, or Redis directly, with sub-queues for priorities and the batch API."
---

# Enqueueing Tasks

runqy uses Redis for task storage. This guide shows how to enqueue tasks from various languages.

## Quick Comparison

| Method | Throughput | Use Case |
|--------|------------|----------|
| HTTP API (`POST /queue/add`) | ~800-1,000/s | Simple integrations |
| HTTP Batch API (`POST /queue/add-batch`) | ~35,000-50,000/s | High-throughput from any language |
| Direct Redis (pipelined) | ~40,000-80,000/s | Maximum performance |

For most use cases, the **Batch API** offers the best balance of simplicity and performance.

## Redis Key Format

runqy uses an asynq-compatible key format. The `{...}` braces around a queue name are **literal**
(Redis Cluster hash tags):

| Key | Type | Description |
|-----|------|-------------|
| `asynq:{queue}:t:{task_id}` | Hash | Task data — also holds the `result`, `state`, and `error_msg` fields |
| `asynq:{queue}:pending` | List | Pending task IDs |
| `asynq:t:{task_id}` | Hash | Reverse-lookup (`task_id` → queue), written by the server |

## Task Data Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Task type (usually `"task"`) |
| `payload` | string | JSON-encoded payload |
| `retry` | string | Current retry count |
| `max_retry` | string | Maximum retry attempts |
| `queue` | string | Queue name (including sub-queue) |

## Queue Naming

Sub-queues let you assign different priorities to the same task type. A common use case is routing paid users to a high-priority sub-queue while free users go to a lower-priority sub-queue—both execute the same task code, but paid users get processed first.

Queues use the format `{parent}.{sub_queue}`:

- `inference.premium` — High priority (paid users)
- `inference.standard` — Standard priority (free users)
- `simple.default` — Default simple queue

Workers register for a parent queue (e.g., `inference`) and process tasks from all its sub-queues, prioritizing higher-priority sub-queues first.

### Automatic Default Fallback

When you specify a queue name without the sub-queue suffix, runqy automatically appends `.default`:

| You provide | Resolves to |
|-------------|-------------|
| `inference` | `inference.default` |
| `simple` | `simple.default` |
| `inference.high` | `inference.high` (unchanged) |

This works in the API, CLI, and direct Redis operations (the server normalizes the queue name before processing).

!!! warning "Queue must exist"
    If the resolved queue (e.g., `inference.default`) doesn't exist in the configuration, the operation fails with an error.

## HTTP Batch API

The batch endpoint is the recommended approach for high-throughput job submission. It uses Redis pipelining internally for optimal performance.

### Python (using SDK)

```python
from runqy_python import RunqyClient

client = RunqyClient("http://localhost:3000", api_key="your-api-key")

# Submit 1000 jobs in one request
jobs = [{"prompt": f"Generate image {i}"} for i in range(1000)]
result = client.enqueue_batch("inference.default", jobs)

print(f"Enqueued: {result.enqueued} jobs")
```

### cURL

```bash
curl -X POST http://localhost:3000/queue/add-batch \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "queue": "inference.default",
    "jobs": [
      {"data": {"prompt": "Hello"}},
      {"data": {"prompt": "World"}}
    ]
  }'
```

### Node.js

```javascript
const response = await fetch('http://localhost:3000/queue/add-batch', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    queue: 'inference.default',
    jobs: [
      { data: { prompt: 'Hello' } },
      { data: { prompt: 'World' } },
    ],
  }),
});

const result = await response.json();
console.log(`Enqueued: ${result.enqueued}`);
```

---

## Direct Redis Access

For maximum performance or when you need direct Redis access, you can enqueue tasks directly.

### Redis CLI

```bash
redis-cli

# Create task data ({inference.default} braces are literal hash tags)
HSET asynq:{inference.default}:t:my-task-id \
  type task \
  payload '{"input": "hello world"}' \
  retry 0 \
  max_retry 3 \
  queue inference.default

# Push to pending queue
LPUSH asynq:{inference.default}:pending my-task-id
```

### Python

```python
import redis
import json
import uuid

def enqueue_task(queue: str, payload: dict, max_retry: int = 3) -> str:
    """Enqueue a task and return its ID."""
    r = redis.Redis(host='localhost', port=6379)

    task_id = str(uuid.uuid4())

    # Create task hash (the {queue} braces are literal hash tags)
    r.hset("asynq:{" + queue + "}:t:" + task_id, mapping={
        "type": "task",
        "payload": json.dumps(payload),
        "retry": "0",
        "max_retry": str(max_retry),
        "queue": queue
    })

    # Push to pending list
    r.lpush("asynq:{" + queue + "}:pending", task_id)

    return task_id

# Usage
task_id = enqueue_task("inference.default", {"input": "hello"})
print(f"Enqueued task: {task_id}")
```

### Node.js

```javascript
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const redis = new Redis();

async function enqueueTask(queue, payload, maxRetry = 3) {
  const taskId = uuidv4();

  // Create task hash (the {queue} braces are literal hash tags)
  await redis.hset(`asynq:{${queue}}:t:${taskId}`, {
    type: 'task',
    payload: JSON.stringify(payload),
    retry: '0',
    max_retry: String(maxRetry),
    queue: queue
  });

  // Push to pending list
  await redis.lpush(`asynq:{${queue}}:pending`, taskId);

  return taskId;
}

// Usage
const taskId = await enqueueTask('inference.default', { input: 'hello' });
console.log(`Enqueued task: ${taskId}`);
```

### Go

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"

    "github.com/google/uuid"
    "github.com/redis/go-redis/v9"
)

func enqueueTask(ctx context.Context, rdb *redis.Client, queue string, payload map[string]any, maxRetry int) (string, error) {
    taskID := uuid.New().String()

    payloadJSON, err := json.Marshal(payload)
    if err != nil {
        return "", err
    }

    // Create task hash (the {queue} braces are literal hash tags)
    err = rdb.HSet(ctx, fmt.Sprintf("asynq:{%s}:t:%s", queue, taskID), map[string]any{
        "type":      "task",
        "payload":   string(payloadJSON),
        "retry":     "0",
        "max_retry": fmt.Sprintf("%d", maxRetry),
        "queue":     queue,
    }).Err()
    if err != nil {
        return "", err
    }

    // Push to pending list
    err = rdb.LPush(ctx, fmt.Sprintf("asynq:{%s}:pending", queue), taskID).Err()
    if err != nil {
        return "", err
    }

    return taskID, nil
}
```

## Checking Results

!!! warning "Default: Results Not Stored in Redis"
    By default, workers do **not** store task results in Redis (`redis_storage: false`).
    Only task success/failure status is tracked. Your Python task code should handle
    result delivery (webhook, storage, etc.). See [Result Delivery Patterns](result-delivery.md).

    Enable `redis_storage: true` in your queue deployment config (server-side) if you need Redis result storage.

### Poll for Result (when redis_storage is enabled)

```python
import redis
import json
import time

def wait_for_result(queue: str, task_id: str, timeout: int = 30) -> dict:
    """Wait for task result with timeout.

    The result is stored in the `result` field of the task hash
    (asynq:{queue}:t:<id>), not in a separate key.
    """
    r = redis.Redis(host='localhost', port=6379)
    key = "asynq:{" + queue + "}:t:" + task_id

    start = time.time()
    while time.time() - start < timeout:
        result = r.hget(key, "result")
        if result:
            return json.loads(result)
        time.sleep(0.1)

    raise TimeoutError(f"Task {task_id} did not complete within {timeout}s")

# Usage
result = wait_for_result("inference.default", task_id)
print(f"Result: {result}")
```

### Check Task Status

```bash
# View task data (state, payload, result, ...)
redis-cli HGETALL asynq:{inference.default}:t:my-task-id

# Check if task is pending
redis-cli LRANGE asynq:{inference.default}:pending 0 -1

# Check if task is active (being processed)
redis-cli LRANGE asynq:{inference.default}:active 0 -1

# Get just the result field
redis-cli HGET asynq:{inference.default}:t:my-task-id result
```

## See Also

- [Task Lifecycle: TTL, Timeouts & Retries](task-lifecycle.md) — control how long tasks live and when they fail (per-queue overrides).
- [Result Delivery](result-delivery.md) — retrieving task results.
