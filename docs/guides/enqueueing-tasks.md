---
title: "Enqueueing tasks"
description: "Send tasks to a runqy queue from the Python client, the CLI or the REST API, one at a time or in batches."
---

# Enqueueing tasks

A task is a JSON payload sent to a queue. This guide shows the three ways to enqueue one through the runqy server (Python client, CLI, REST API), how to send many at once, and what comes back. At the end you will have a task id you can use to [get the result](result-delivery.md).

## Before you start

You need:

- a running runqy server (the examples use `http://localhost:3000`);
- an API key: the admin key (`RUNQY_API_KEY`) or the client key (`RUNQY_CLIENT_API_KEY`). The examples use `dev-api-key`;
- a queue that exists on the server. The examples use a queue named `inference`.

A queue name is either a full sub-queue name (`inference.high`) or a parent name (`inference`), which the server resolves to `inference.default`. An enqueue to a queue that does not exist is rejected. See [Queues, sub-queues and priorities](../concepts/queues.md#naming-and-the-default-rule).

## Python client

Install the package (`pip install runqy-python`), then:

```python
from runqy_python import RunqyClient

client = RunqyClient("http://localhost:3000", api_key="dev-api-key")

task = client.enqueue("inference", {"prompt": "a red bicycle"}, timeout=0)

print(task.task_id)
print(task.queue)
print(task.state)
```

```text
0f3c2a9e-6d1b-4f6e-9a57-2f1f0c6f7a10
inference.default
pending
```

`enqueue()` returns a `TaskInfo` with `task_id`, `queue`, `state` and `payload`.

!!! warning
    The `timeout` argument of `enqueue()` defaults to **300 seconds**, and a non-zero value replaces the queue's `active_timeout` for that task. A task enqueued without `timeout=0` is therefore stopped and retried after 5 minutes of execution, whatever the queue config says. Pass `timeout=0` to use the queue's own setting, or the number of seconds you want.

The client raises `AuthenticationError` on a rejected API key and `RunqyError` on other failures. An unknown queue is reported by the server with HTTP 404, which the client raises as `TaskNotFoundError`; the message contains `queue not found: <name>`.

For a single call without keeping a client object:

```python
from runqy_python import enqueue

task = enqueue(
    "inference",
    {"prompt": "a red bicycle"},
    server_url="http://localhost:3000",
    api_key="dev-api-key",
    timeout=0,
)
print(task.task_id)
```

## CLI

Against a remote server, pass the server URL and the API key:

```bash
runqy --server http://localhost:3000 --api-key dev-api-key \
  task enqueue --queue inference --payload '{"prompt": "a red bicycle"}'
```

```text
Task enqueued successfully!
  ID:    0f3c2a9e-6d1b-4f6e-9a57-2f1f0c6f7a10
  Queue: inference.default
  Type:  inference.default
```

| Flag | Default | Description |
|------|---------|-------------|
| `--queue`, `-q` | (required) | Queue name |
| `--payload`, `-p` | `{}` | JSON payload |
| `--timeout`, `-t` | `0` | Maximum execution time per attempt, in seconds. `0` uses the queue's `active_timeout`. |

After `runqy login --server http://localhost:3000 --api-key dev-api-key`, the saved profile is used and the two global flags can be dropped. Without `--server` and without a saved profile, the CLI runs in local mode: it connects to Redis and the database directly, using the same environment variables as the server, so it only works where those are reachable. See the [CLI reference](../reference/cli.md).

## REST API

### One task

```bash
curl -X POST http://localhost:3000/queue/add \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "inference", "data": {"prompt": "a red bicycle"}}'
```

| Field | Required | Description |
|-------|----------|-------------|
| `queue` | yes | Queue name |
| `data` | no | The payload your task function receives, a JSON object. |
| `timeout` | no | Maximum execution time per attempt, in seconds. Overrides the queue's `active_timeout` for this task. `0` or absent: the queue's setting applies. |

If `data` is absent, every other top-level field except `queue` and `timeout` becomes the payload, so `{"queue": "inference", "prompt": "a red bicycle"}` is equivalent to the request above.

The API key can also be sent in an `X-API-Key` header.

The response, HTTP 200:

```json
{
  "info": {
    "id": "0f3c2a9e-6d1b-4f6e-9a57-2f1f0c6f7a10",
    "type": "inference.default",
    "payload": "eyJwcm9tcHQiOiJhIHJlZCBiaWN5Y2xlIn0=",
    "state": "pending",
    "queue": "inference.default",
    "max_retry": 3,
    "retried": 0,
    "LastErr": "",
    "LastFailedAt": "0001-01-01T00:00:00Z",
    "Deadline": "0001-01-01T00:00:00Z",
    "Group": "",
    "NextProcessAt": "0001-01-01T00:00:00Z",
    "IsOrphaned": false,
    "CompletedAt": "0001-01-01T00:00:00Z",
    "Result": null
  },
  "data": {"prompt": "a red bicycle"}
}
```

Keep `info.id`: it is the task id. `info.queue` is the resolved sub-queue, `info.max_retry` the retry budget resolved from the queue config. In this response `info.payload` is the payload encoded in base64, and `data` echoes what you sent. The timestamp fields are not meaningful at this point.

Errors use the same shape for every status:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{"errors": ["queue is required"]}` | No `queue` field |
| 400 | `{"errors": ["prompt is required"]}` | The payload does not match the queue's input schema. See [Payload schemas](payload-schemas.md). |
| 401 | | Missing or unknown API key |
| 403 | | The key is valid but is a worker key |
| 404 | `{"errors": ["queue not found: inference.default"]}` | The resolved queue does not exist |

### Many tasks

`POST /queue/add-batch` enqueues a list of payloads to one queue in a single request. Use it when you submit tasks in bulk: one HTTP round trip instead of one per task.

```bash
curl -X POST http://localhost:3000/queue/add-batch \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "queue": "inference",
    "jobs": [
      {"prompt": "a red bicycle"},
      {"prompt": "a blue kettle"}
    ]
  }'
```

| Field | Required | Description |
|-------|----------|-------------|
| `queue` | yes | Queue name, the same for all tasks |
| `jobs` | yes | Non-empty array. **Each element is the payload of one task**, exactly as your task function receives it. |
| `timeout` | no | Maximum execution time per attempt, in seconds, applied to every task of the batch. `0` or absent: the queue's `active_timeout` applies. |

The response, HTTP 200:

```json
{
  "enqueued": 2,
  "failed": 0,
  "task_ids": [
    "0f3c2a9e-6d1b-4f6e-9a57-2f1f0c6f7a10",
    "b1d5a0c4-0c58-4c0e-8a2e-5f3f3a1c9e77"
  ]
}
```

`task_ids` are in the order of `jobs`, minus the ones that failed. When some tasks could not be enqueued, `failed` counts them and an `errors` array carries the messages; the status is still 200, so check `failed`.

Two differences from the single endpoint:

- The batch endpoint does **not** validate payloads against the queue's input schema and does not apply schema defaults.
- There is no per-task `timeout`.

!!! warning
    `RunqyClient.enqueue_batch()` in runqy-python 0.3.1 wraps each payload before sending it: your task function receives `{"timeout": 300, "data": {...}}` instead of the payload you passed. Until that is fixed, read `payload["data"]` in tasks fed by `enqueue_batch()`, or call the endpoint yourself as shown below.

A batch from Python with the standard library only:

```python
import json
import urllib.request

payloads = [{"prompt": f"image {i}"} for i in range(1000)]

request = urllib.request.Request(
    "http://localhost:3000/queue/add-batch",
    data=json.dumps({"queue": "inference", "jobs": payloads}).encode("utf-8"),
    headers={
        "Authorization": "Bearer dev-api-key",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(request, timeout=60) as response:
    result = json.loads(response.read())

print(result["enqueued"], result["failed"])
```

```text
1000 0
```

## What the server adds to each task

When a task goes through the server (any method above), the server resolves the parent queue's lifecycle limits and stores them with the task: the retry budget, how long the task is kept once completed or archived, and the pending and active timeouts. The worker enforces the values stored with the task, so changing a queue's limits affects only tasks enqueued afterwards. See [Task lifecycle](task-lifecycle.md).

## Writing to Redis directly

!!! warning
    This is an advanced path for systems that cannot call the server. Prefer the batch endpoint.

A worker also accepts tasks written straight into Redis. A task is a hash plus an entry in the sub-queue's pending list. The braces around the queue name are part of the key:

```bash
redis-cli HSET "asynq:{inference.default}:t:my-task-1" \
  type task \
  payload '{"prompt": "a red bicycle"}' \
  max_retry 2

redis-cli LPUSH "asynq:{inference.default}:pending" my-task-1
```

You must use the full sub-queue name; nothing appends `.default` for you. What you give up compared with the server:

- **No queue check.** A task pushed to a name no worker listens on waits forever.
- **No input schema validation** and no defaults.
- **No lifecycle limits from the queue config.** The worker applies its own fallback settings instead (see the [worker configuration reference](../reference/worker-config.md)), and `max_retry` is whatever you wrote in the hash.
- **No lookup by id.** `GET /queue/{id}` answers 404 for these tasks, because the server never recorded which queue the id belongs to. Read the task hash yourself.

## Next steps

- [Getting results](result-delivery.md)
- [Payload schemas](payload-schemas.md)
- [Task lifecycle: TTL, timeouts and retries](task-lifecycle.md)
- [REST API reference](../reference/rest-api.md)
