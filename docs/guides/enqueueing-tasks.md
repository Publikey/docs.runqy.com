# Enqueueing Tasks

runqy uses Redis for task storage. This guide shows how to enqueue tasks from various languages.

## Redis Key Format

runqy uses an asynq-compatible key format:

| Key | Type | Description |
|-----|------|-------------|
| `asynq:t:{task_id}` | Hash | Task data |
| `asynq:{queue}:pending` | List | Pending task IDs |

## Task Data Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Task type (usually `"task"`) |
| `payload` | string | JSON-encoded payload |
| `retry` | string | Current retry count |
| `max_retry` | string | Maximum retry attempts |
| `queue` | string | Queue name (including sub-queue) |

## Queue Naming

Queues use the format `{parent}_{sub_queue}`:

- `inference_high` — High priority inference
- `inference_low` — Low priority inference
- `simple_default` — Default simple queue

Workers register for a parent queue (e.g., `inference`) and process tasks from all its sub-queues.

## Examples

### Redis CLI

```bash
redis-cli

# Create task data
HSET asynq:t:my-task-id \
  type task \
  payload '{"input": "hello world"}' \
  retry 0 \
  max_retry 3 \
  queue inference_default

# Push to pending queue
LPUSH asynq:inference_default:pending my-task-id
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

    # Create task hash
    r.hset(f"asynq:t:{task_id}", mapping={
        "type": "task",
        "payload": json.dumps(payload),
        "retry": "0",
        "max_retry": str(max_retry),
        "queue": queue
    })

    # Push to pending list
    r.lpush(f"asynq:{queue}:pending", task_id)

    return task_id

# Usage
task_id = enqueue_task("inference_default", {"input": "hello"})
print(f"Enqueued task: {task_id}")
```

### Node.js

```javascript
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const redis = new Redis();

async function enqueueTask(queue, payload, maxRetry = 3) {
  const taskId = uuidv4();

  // Create task hash
  await redis.hset(`asynq:t:${taskId}`, {
    type: 'task',
    payload: JSON.stringify(payload),
    retry: '0',
    max_retry: String(maxRetry),
    queue: queue
  });

  // Push to pending list
  await redis.lpush(`asynq:${queue}:pending`, taskId);

  return taskId;
}

// Usage
const taskId = await enqueueTask('inference_default', { input: 'hello' });
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

    // Create task hash
    err = rdb.HSet(ctx, fmt.Sprintf("asynq:t:%s", taskID), map[string]any{
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
    err = rdb.LPush(ctx, fmt.Sprintf("asynq:%s:pending", queue), taskID).Err()
    if err != nil {
        return "", err
    }

    return taskID, nil
}
```

## Checking Results

!!! warning "Default: Results Not Stored in Redis"
    By default, workers do **not** store task results in Redis (`RedisStorage: false`).
    Only task success/failure status is tracked. Your Python task code should handle
    result delivery (webhook, storage, etc.). See [Result Delivery Patterns](result-delivery.md).

    Enable `RedisStorage: true` in worker config if you need Redis result storage.

### Poll for Result (when RedisStorage is enabled)

```python
import redis
import json
import time

def wait_for_result(task_id: str, timeout: int = 30) -> dict:
    """Wait for task result with timeout."""
    r = redis.Redis(host='localhost', port=6379)
    key = f"asynq:result:{task_id}"

    start = time.time()
    while time.time() - start < timeout:
        result = r.get(key)
        if result:
            return json.loads(result)
        time.sleep(0.1)

    raise TimeoutError(f"Task {task_id} did not complete within {timeout}s")

# Usage
result = wait_for_result(task_id)
print(f"Result: {result}")
```

### Check Task Status

```bash
# View task data
redis-cli HGETALL asynq:t:my-task-id

# Check if task is pending
redis-cli LRANGE asynq:inference_default:pending 0 -1

# Check if task is active (being processed)
redis-cli LRANGE asynq:inference_default:active 0 -1

# Get result
redis-cli GET asynq:result:my-task-id
```
