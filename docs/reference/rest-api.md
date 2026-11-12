---
title: "REST API reference"
description: "Every HTTP endpoint of the runqy server: authentication, request bodies, responses and error codes."
---

# REST API reference

This page lists every HTTP endpoint the runqy server exposes, with the request and response fields as the server sends them. Examples assume a server on `http://localhost:3000` and an admin key `dev-api-key`.

## Conventions

- Request and response bodies are JSON. Request bodies are limited to 50 MB (`RUNQY_MAX_BODY_SIZE`, in bytes).
- Errors are returned as `{"errors": ["<message>"]}`. The only exception is `POST /worker/register`, which returns `{"error": "<message>"}` for its own validation errors.
- A queue name without a sub-queue is normalised to `<queue>.default` by the enqueue endpoints. Endpoints under `/api/queues/` take the full name (`inference.high`) and do not normalise it.
- The dashboard has its own API under `/monitoring/api/`. It is internal, authenticated by the dashboard session, and not a stable public API.

## Authentication

Send the API key in one of two headers. `Authorization` wins when both are present.

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/api/queues
curl -H "X-API-Key: dev-api-key" http://localhost:3000/api/queues
```

The server knows up to three keys. The worker and client keys are optional; when they are not set, only the admin key is accepted.

| Key | Environment variable | May call |
|-----|----------------------|----------|
| Admin | `RUNQY_API_KEY` | Every endpoint |
| Worker | `RUNQY_WORKER_API_KEY` | `POST /worker/register` only |
| Client | `RUNQY_CLIENT_API_KEY` | `POST /queue/add` and `POST /queue/add-batch` only |

These endpoints need no key: `GET /queue/{id}`, `GET /health`, `GET /healthz`, `GET /metrics`, `GET /swagger/*`.

| Status | Body | Meaning |
|--------|------|---------|
| `401` | `{"errors":["access unauthorized"]}` | No key sent, or the key matches none of the configured keys |
| `403` | `{"errors":["insufficient permissions"]}` | Valid worker or client key on an endpoint that role may not call |

If `RUNQY_API_KEY` is empty, every authenticated endpoint answers `401`.

## Endpoint summary

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/queue/add` | client, admin |
| `POST` | `/queue/add-batch` | client, admin |
| `GET` | `/queue/{id}` | none |
| `GET` | `/api/queues` | admin |
| `GET` | `/api/queues/{queue}` | admin |
| `POST` | `/api/queues/{queue}/pause` | admin |
| `POST` | `/api/queues/{queue}/unpause` | admin |
| `DELETE` | `/api/queues/{queue}` | admin |
| `GET` | `/api/queues/{queue}/tasks` | admin |
| `GET` | `/api/queues/{queue}/tasks/{id}` | admin |
| `DELETE` | `/api/queues/{queue}/tasks/{id}` | admin |
| `POST` | `/api/tasks/{id}/cancel` | admin |
| `GET` | `/workers/queues` | admin |
| `POST` | `/workers/queues` | admin |
| `GET` | `/workers/config/{queue}` | admin |
| `DELETE` | `/workers/queues/{queue}` | admin |
| `POST` | `/workers/queues/{queue}/restore` | admin |
| `POST` | `/workers/reload` | admin |
| `GET` | `/workers` | admin |
| `GET` | `/workers/{worker_id}` | admin |
| `POST` | `/worker/register` | worker, admin |
| `POST` | `/api/control` | admin |
| `GET` | `/api/autoscale/status` | admin |
| `GET` | `/api/autoscale/instances/{id}/logs` | admin |
| `POST` | `/api/autoscale/instances/{id}/protect` | admin |
| `POST` | `/api/autoscale/instances/{id}/unprotect` | admin |
| `POST` | `/api/autoscale/queues/{queue}/resume` | admin |
| `GET` | `/api/autoscale/provider-types` | admin |
| `GET` `POST` | `/api/autoscale/providers` | admin |
| `GET` `PUT` `DELETE` | `/api/autoscale/providers/{name}` | admin |
| `GET` | `/api/alerts` | admin |
| `GET` `PUT` | `/api/alerts/settings` | admin |
| `POST` | `/api/alerts/test` | admin |
| `GET` `POST` | `/api/vaults` | admin |
| `GET` `DELETE` | `/api/vaults/{name}` | admin |
| `GET` `POST` | `/api/vaults/{name}/entries` | admin |
| `DELETE` | `/api/vaults/{name}/entries/{key}` | admin |
| `GET` | `/health`, `/healthz`, `/metrics` | none |

## Tasks

### Enqueue a task

`POST /queue/add` (client or admin key)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `queue` | string | yes | Queue name. `inference` becomes `inference.default` |
| `timeout` | integer | no | Maximum execution time per attempt, in seconds. `0` or absent: the queue's `active_timeout` |
| `data` | object | no | The task payload |

If `data` is absent, every other top-level field except `queue` and `timeout` becomes the payload. When the queue config declares an input schema, the payload is validated against it; see [Payload schemas](../guides/payload-schemas.md).

```bash
curl -X POST http://localhost:3000/queue/add \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "inference", "timeout": 60, "data": {"prompt": "hello"}}'
```

```json
{
  "info": {
    "id": "6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11",
    "type": "inference.default",
    "payload": "eyJwcm9tcHQiOiJoZWxsbyJ9",
    "state": "pending",
    "queue": "inference.default",
    "max_retry": 3,
    "retried": 0,
    "LastErr": "",
    "LastFailedAt": "0001-01-01T00:00:00Z",
    "Deadline": "0001-01-01T00:00:00Z",
    "Group": "",
    "NextProcessAt": "2026-11-12T10:15:00.123456789Z",
    "IsOrphaned": false,
    "CompletedAt": "0001-01-01T00:00:00Z",
    "Result": null
  },
  "data": {"prompt": "hello"}
}
```

`info.id` is the task id. In this response `info.payload` is the payload JSON encoded in base64, `info.type` is the queue name, and `data` echoes the payload sent. Unset timestamps are `0001-01-01T00:00:00Z`.

| Status | When |
|--------|------|
| `400` | Invalid JSON, missing `queue`, payload rejected by the input schema, enqueue failure |
| `404` | `queue not found: <queue>` |
| `500` | The queue lookup failed |

### Enqueue a batch

`POST /queue/add-batch` (client or admin key)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `queue` | string | yes | Queue name, normalised as above. All tasks go to this queue |
| `timeout` | integer | no | Maximum execution time per attempt, in seconds, applied to every task. `0` or absent: the queue's `active_timeout` |
| `jobs` | array | yes | One payload object per task. Must not be empty |

The batch endpoint does not validate payloads against the queue's input schema.

```bash
curl -X POST http://localhost:3000/queue/add-batch \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "inference", "jobs": [{"prompt": "one"}, {"prompt": "two"}]}'
```

```json
{
  "enqueued": 2,
  "failed": 0,
  "task_ids": [
    "0b7f5c1a-93a4-4f0e-8f6a-0c1d2e3f4a5b",
    "c2a9e7d4-5b6f-4a1c-9e8d-7f6a5b4c3d2e"
  ]
}
```

The status is `200` even when some tasks failed: check `failed` and the `errors` array (present only when not empty).

| Status | When |
|--------|------|
| `400` | Invalid JSON, missing `queue` or `jobs`, empty `jobs` |
| `404` | `queue not found: <queue>` |
| `500` | The queue lookup failed |

### Get a task's status and result

`GET /queue/{id}` (no key: the task id is the secret)

| Query parameter | Description |
|-----------------|-------------|
| `wait=true` | Long-poll: the server checks the task every second and answers when it is `completed` or `archived`, or after 30 seconds |

```bash
curl "http://localhost:3000/queue/6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11?wait=true"
```

```json
{
  "Info": {
    "id": "6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11",
    "type": "inference.default",
    "payload": "{\"prompt\":\"hello\"}",
    "state": "completed",
    "queue": "inference.default",
    "max_retry": 3,
    "retried": 0,
    "LastErr": "",
    "LastFailedAt": "0001-01-01T00:00:00Z",
    "Deadline": "0001-01-01T00:00:00Z",
    "Group": "",
    "NextProcessAt": "0001-01-01T00:00:00Z",
    "IsOrphaned": false,
    "CompletedAt": "2026-11-12T10:15:02Z",
    "Result": "{\"text\":\"HELLO\"}"
  }
}
```

The top-level key is `Info` with a capital I. `payload` and `Result` are strings that contain JSON: parse them a second time. `state` is one of `pending`, `active`, `scheduled`, `retry`, `completed`, `archived`. `Result` is empty unless the queue stores results in Redis; see [Getting results](../guides/result-delivery.md).

| Status | When |
|--------|------|
| `404` | `task not found`: unknown id, or the task has expired |
| `408` | With `wait=true`: the task did not finish within 30 seconds (`timeout waiting for task result`), or the lookup failed while waiting |
| `500` | Redis error, or the task data is gone while its id is still known |

### List tasks in a queue

`GET /api/queues/{queue}/tasks` (admin key)

| Query parameter | Default | Description |
|-----------------|---------|-------------|
| `state` | `pending` | `pending`, `active`, `scheduled`, `retry`, `archived` or `completed` |
| `limit` | `10` | Maximum number of tasks returned |

```bash
curl -H "Authorization: Bearer dev-api-key" \
  "http://localhost:3000/api/queues/inference.default/tasks?state=completed&limit=1"
```

```json
{
  "tasks": [
    {
      "id": "6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11",
      "type": "inference.default",
      "queue": "inference.default",
      "state": "completed",
      "payload": "{\"prompt\":\"hello\"}",
      "max_retry": 3,
      "retried": 0,
      "timeout": "",
      "completed_at": "2026-11-12 10:15:02",
      "result": "{\"text\":\"HELLO\"}"
    }
  ]
}
```

`last_err`, `next_process_at`, `completed_at` and `result` appear only for the states they apply to. `tasks` is `null` when the list is empty. An unknown `state` returns `400`.

### Get one task

`GET /api/queues/{queue}/tasks/{id}` (admin key)

Returns one object with the fields of the list above, plus `timeout` (a Go duration such as `1m0s`) and `deadline`. Unknown queue or task: `404`.

```bash
curl -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/api/queues/inference.default/tasks/6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11
```

### Delete a task

`DELETE /api/queues/{queue}/tasks/{id}` (admin key)

```bash
curl -X DELETE -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/api/queues/inference.default/tasks/6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11
```

```json
{"message": "task deleted", "task_id": "6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11"}
```

Failure (for example an unknown task) returns `500`.

### Cancel a task

`POST /api/tasks/{id}/cancel` (admin key)

```bash
curl -X POST -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/api/tasks/6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11/cancel
```

```json
{"message": "task cancelled", "task_id": "6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11"}
```

!!! warning
    This publishes a cancellation signal and reports success whether or not anything received it. The runqy worker does not listen for this signal, so a running task is not interrupted. To bound execution time, use `timeout` or the queue's `active_timeout`; see [Task lifecycle](../guides/task-lifecycle.md).

## Queues

These endpoints act on the live queues in Redis. `{queue}` is the full name, such as `inference.high`.

### List queues

`GET /api/queues` (admin key)

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/api/queues
```

```json
{
  "queues": [
    {
      "queue": "inference.high",
      "pending": 4,
      "active": 1,
      "scheduled": 0,
      "retry": 0,
      "archived": 2,
      "completed": 118,
      "paused": false,
      "memory_usage": 51234
    }
  ]
}
```

`memory_usage` is in bytes. A `warnings` array is added when a queue could not be read.

### Get one queue

`GET /api/queues/{queue}` (admin key)

Returns one object with the same fields. Unknown queue: `404`.

### Pause and unpause a queue

`POST /api/queues/{queue}/pause` and `POST /api/queues/{queue}/unpause` (admin key)

A paused queue keeps accepting tasks; workers stop taking them.

```bash
curl -X POST -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/api/queues/inference.high/pause
```

```json
{"message": "queue paused", "queue": "inference.high"}
```

Unpause answers `{"message": "queue unpaused", "queue": "inference.high"}`. Pausing a queue that is already paused, or unpausing one that is not, returns `500`.

### Delete a queue and its tasks

`DELETE /api/queues/{queue}` (admin key)

Deletes the queue's tasks from Redis and removes its queue config.

| Query parameter | Description |
|-----------------|-------------|
| `force=true` | Delete even if the queue still holds tasks |

```bash
curl -X DELETE -H "Authorization: Bearer dev-api-key" \
  "http://localhost:3000/api/queues/inference.low?force=true"
```

```json
{"message": "queue deleted", "queue": "inference.low"}
```

Without `force=true`, a queue that is not empty returns `400`.

!!! note
    `GET /api/queue_stats`, `GET /api/workers` and `GET /api/servers` exist but always return empty lists. Use `GET /api/queues` and `GET /workers` instead.

## Queue configs

Queue configs live in the server's database. The fields of `deployment` are described in [Queue configuration](queue-config.md).

### List queue configs

`GET /workers/queues` (admin key)

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/workers/queues
```

```json
{
  "queues": [
    {"name": "inference.high", "priority": 10},
    {"name": "inference.low", "priority": 1}
  ],
  "count": 2
}
```

### Get a queue config

`GET /workers/config/{queue}` (admin key)

`{queue}` is a full name; a name without sub-queue is read as `<queue>.default`. Unknown queue: `404`.

```bash
curl -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/workers/config/inference.high
```

```json
{
  "name": "inference.high",
  "priority": 10,
  "deployment": {
    "git_url": "https://github.com/example/inference-task.git",
    "branch": "main",
    "startup_cmd": "python main.py",
    "mode": "long_running",
    "startup_timeout_secs": 300
  },
  "created_at": 1794478500,
  "updated_at": 1794478500
}
```

### Create or update a queue config

`POST /workers/queues` (admin key)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Queue name. `inference.high` creates sub-queue `high` of `inference`; `inference` creates `inference.default` |
| `priority` | integer | yes | Sub-queue priority, 1 or more |
| `deployment` | object | no | Applies to the parent queue. `git_url` and `startup_cmd` are required when present. Other keys: `branch`, `code_path`, `mode`, `startup_timeout_secs`, `redis_storage`, `vaults`, `git_token`, `limits`, `autoscale`, `alerts`, `strict_priority` |

| Query parameter | Description |
|-----------------|-------------|
| `force=true` | Update the queue if it already exists |

```bash
curl -X POST http://localhost:3000/workers/queues \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "inference.high",
    "priority": 10,
    "deployment": {
      "git_url": "https://github.com/example/inference-task.git",
      "branch": "main",
      "startup_cmd": "python main.py",
      "mode": "long_running"
    }
  }'
```

Response, status `201`:

```json
{
  "queue": {
    "name": "inference.high",
    "priority": 10,
    "deployment": {
      "git_url": "https://github.com/example/inference-task.git",
      "branch": "main",
      "startup_cmd": "python main.py",
      "mode": "long_running",
      "startup_timeout_secs": 0
    },
    "created_at": 1794478500,
    "updated_at": 1794478500
  },
  "message": "Queue created successfully"
}
```

With `force=true` on an existing queue, `message` is `Queue updated successfully`. Input and output schemas cannot be set through this endpoint; define them in the queue YAML.

| Status | When |
|--------|------|
| `400` | Missing `name` or `priority`, missing `git_url` or `startup_cmd`, invalid `limits`, `autoscale` or `alerts` |
| `409` | The queue exists and `force=true` was not given |
| `500` | Database error |

### Delete a queue config

`DELETE /workers/queues/{queue}` (admin key)

Disables the config without touching the tasks in Redis. A parent name (`inference`) disables the queue and all its sub-queues; a full name (`inference.low`) disables that sub-queue. Unknown queue: `404`.

```bash
curl -X DELETE -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/workers/queues/inference.low
```

```json
{"message": "Queue 'inference.low' deleted successfully"}
```

### Restore a deleted queue config

`POST /workers/queues/{queue}/restore` (admin key)

Re-enables a config removed by the previous endpoint. A parent name restores the queue and its sub-queues.

```bash
curl -X POST -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/workers/queues/inference.low/restore
```

```json
{"message": "Queue 'inference.low' restored successfully"}
```

A queue that does not exist or is not deleted returns `400`.

### Reload queue configs from YAML

`POST /workers/reload` (admin key)

Reads the YAML files of the server's config directory again and saves them to the database.

```bash
curl -X POST -H "Authorization: Bearer dev-api-key" http://localhost:3000/workers/reload
```

```json
{
  "reloaded": ["inference.high", "inference.low"],
  "errors": null,
  "timestamp": 1794478500
}
```

The status is always `200`: read `errors` to find the files or queues that were rejected.

## Workers

### List workers

`GET /workers` (admin key)

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/workers
```

```json
{
  "workers": [
    {
      "worker_id": "gpu-node-1:1",
      "started_at": 1794478000,
      "last_beat": 1794478495,
      "concurrency": 1,
      "queues": "{\"inference.high\":10,\"inference.low\":1}",
      "status": "running",
      "is_stale": false,
      "protected": false,
      "version": "0.4.2",
      "control_actions": ["drain", "resume", "code_update", "worker_update", "config_reload"],
      "last_command": {
        "id": "9f2c4e6a8b0d1f35",
        "action": "drain",
        "state": "done",
        "at": 1794478300
      }
    }
  ],
  "count": 1
}
```

| Field | Description |
|-------|-------------|
| `started_at`, `last_beat` | Unix seconds |
| `queues` | A string holding a JSON object: sub-queue name to priority |
| `is_stale` | `true` when the last heartbeat is more than 30 seconds old |
| `instance_id` | Present when the worker runs on an autoscaled instance |
| `protected` | The worker asked not to be scaled down |
| `version`, `control_actions`, `held`, `last_command` | Reported by workers that support [worker control](../guides/worker-control.md); absent otherwise. `held` lists the parent queues the worker is not taking tasks from. `last_command.state` is `running`, `done` or `failed`, with an optional `message` |

### Get one worker

`GET /workers/{worker_id}` (admin key)

Returns one worker object. Unknown or expired worker: `404`.

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/workers/gpu-node-1:1
```

## Worker registration

`POST /worker/register` (worker or admin key)

The runqy worker calls this once at startup to receive its Redis credentials and the deployment of its queue. You only need it to write your own worker.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `queue` | string | yes | Parent queue (`inference`) or one sub-queue. 1 to 128 characters: letters, digits, `.`, `-`, `_` |
| `hostname` | string | no | Informational |
| `os` | string | no | Informational |
| `version` | string | no | Informational |

```bash
curl -X POST http://localhost:3000/worker/register \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "inference", "hostname": "gpu-node-1", "os": "linux", "version": "0.4.2"}'
```

```json
{
  "redis": {
    "addr": "localhost:6379",
    "password": "redis-password",
    "use_tls": false,
    "db": 0
  },
  "queue": {"name": "inference", "priority": 10},
  "sub_queues": [
    {"name": "inference.high", "priority": 10},
    {"name": "inference.low", "priority": 1}
  ],
  "deployment": {
    "git_url": "https://github.com/example/inference-task.git",
    "branch": "main",
    "startup_cmd": "python main.py",
    "mode": "long_running",
    "startup_timeout_secs": 300,
    "redis_storage": false,
    "vaults": ["api-keys"]
  },
  "vaults": {"OPENAI_API_KEY": "sk-example"},
  "git_token": "ghp_example"
}
```

| Field | Description |
|-------|-------------|
| `redis` | Connection the worker must use. `addr` is the server's own `REDIS_HOST:REDIS_PORT` |
| `queue` | The name requested, the priority of its first sub-queue, and `strict_priority: true` when the queue polls sub-queues in strict order |
| `sub_queues` | Sub-queues to listen on, with full names |
| `deployment` | Code to deploy and how to start it. `code_path`, `mode` and `vaults` are omitted when empty |
| `vaults` | Decrypted entries of the vaults listed in `deployment.vaults`, to inject as environment variables. Omitted when the queue uses no vault |
| `git_token` | Token resolved from the queue's `git_token` vault reference. Omitted when not set |

!!! warning
    The response contains the Redis password and decrypted secrets. Give workers the worker key, not the admin key, and serve the API over TLS.

| Status | Body | When |
|--------|------|------|
| `400` | `{"error": "..."}` | Invalid JSON, missing or invalid `queue` |
| `404` | `{"error": "queue 'x' not found (also tried 'x.default')"}` | No such queue |
| `500` | `{"error": "..."}` | Database error; the queue uses vaults but `RUNQY_VAULT_MASTER_KEY` is not set, or a vault could not be read |

## Worker control

`POST /api/control` (admin key)

Sends a command to workers. Commands and their effects are described in [Worker control](../guides/worker-control.md).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | yes | `drain`, `resume`, `code_update`, `worker_update` or `config_reload` |
| `target` | string | no | A worker id, or a queue name (reaches every worker of the parent queue). Empty: all workers |
| `version` | string | `worker_update` only | Release to install, such as `0.4.2`. Rejected for other actions |
| `timeout` | string | no | How long to wait for in-flight tasks, as a Go duration such as `10m` |

```bash
curl -X POST http://localhost:3000/api/control \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"action": "drain", "target": "inference"}'
```

Response, status `202`:

```json
{
  "id": "9f2c4e6a8b0d1f35",
  "action": "drain",
  "channel": "runqy:control:inference",
  "target": "queue inference",
  "receivers": 1
}
```

`target` is `all`, `queue <name>` or `worker <id>`. `receivers` counts the workers that were listening; `0` means nobody received the command. Delivery is not confirmed: read each worker's `last_command` from `GET /workers/{worker_id}` for the outcome.

`400` is returned for invalid JSON, an unknown action, a missing or malformed `version`, an invalid `timeout`, or a `target` that is neither a live worker nor a queue.

## Autoscaling

Concepts and provider settings are in [GPU autoscaling](../guides/autoscaling.md). The provider endpoints and the logs endpoint return `503` when `RUNQY_VAULT_MASTER_KEY` is not set, because provider configs are stored encrypted.

### Status

`GET /api/autoscale/status` (admin key)

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/api/autoscale/status
```

```json
{
  "instances": [
    {
      "id": 12,
      "instance_id": "as-1234",
      "provider": "my-vast",
      "queue": "inference",
      "status": "running",
      "worker_id": "gpu-node-1:1",
      "protected": false,
      "price_per_hour": 0.31,
      "cost_accumulated": 0.0775,
      "created_at": "2026-11-12T10:00:00Z",
      "last_job_at": "2026-11-12T10:14:00Z",
      "updated_at": "2026-11-12T10:15:00Z",
      "gpu": "RTX 4090",
      "provider_instance_id": "18273645"
    }
  ],
  "count": 1,
  "total_cost": 0.0775,
  "pauses": [
    {
      "queue": "inference",
      "kind": "provision",
      "failures": 3,
      "until": "2026-11-12T10:25:00Z",
      "cause": "the provider refused to rent a machine"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `instances[].status` | `provisioning`, `running`, `draining`, `destroying`, `terminated` or `failed` |
| `instances[].gpu`, `provider_instance_id`, `last_job_at` | Omitted when unknown |
| `instances[].reason` | Why the instance was torn down. Omitted when empty |
| `instances[].error` | Provider error when the machine could not be rented. Omitted when empty |
| `total_cost` | Sum of `cost_accumulated` over all listed instances, ended ones included |
| `pauses` | Queues whose provisioning is on hold. `kind` is `provision`, `boot` or `host`; `suspended: true` marks a suspension after repeated boot failures |

### Instance logs

`GET /api/autoscale/instances/{id}/logs` (admin key)

`{id}` is the `instance_id` from the status.

```bash
curl -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/api/autoscale/instances/as-1234/logs
```

```json
{
  "instance_id": "as-1234",
  "logs": "Cloning into 'deployment'...\n",
  "source": "live",
  "fetched_at": "2026-11-12T10:15:00Z"
}
```

`source` is `live` while the machine exists and `saved` for logs captured when it was destroyed. `error` explains why a capture failed.

| Status | When |
|--------|------|
| `404` | `instance not found` |
| `501` | The instance's provider cannot return logs |
| `502` | The provider call failed |

### Protect and unprotect an instance

`POST /api/autoscale/instances/{id}/protect` and `POST /api/autoscale/instances/{id}/unprotect` (admin key)

A protected instance is never destroyed by scale-down.

```bash
curl -X POST -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/api/autoscale/instances/as-1234/protect
```

```json
{"message": "instance protected", "instance_id": "as-1234", "protected": true}
```

Unknown instance: `404`.

### Resume provisioning for a queue

`POST /api/autoscale/queues/{queue}/resume` (admin key)

Lifts the provisioning pauses of a parent queue so the next evaluation can rent a machine again.

```bash
curl -X POST -H "Authorization: Bearer dev-api-key" \
  http://localhost:3000/api/autoscale/queues/inference/resume
```

```json
{"queue": "inference", "resumed": 1}
```

`resumed` is the number of pauses lifted; `0` means the queue was not paused.

### Provider types

`GET /api/autoscale/provider-types` (admin key)

```json
{"types": ["mock", "runpod", "vastai"]}
```

### Providers

All provider endpoints need the admin key. Responses never contain secrets in clear: string values whose key looks like a secret are masked.

| Method and path | Purpose | Success |
|-----------------|---------|---------|
| `GET /api/autoscale/providers` | List providers | `200` `{"providers": [...], "count": n}` |
| `GET /api/autoscale/providers/{name}` | Get one provider | `200` provider object |
| `POST /api/autoscale/providers` | Create a provider | `201` `{"message": "provider created", "provider": {...}}` |
| `PUT /api/autoscale/providers/{name}` | Update a provider | `200` `{"message": "provider updated", "provider": {...}}` |
| `DELETE /api/autoscale/providers/{name}` | Delete a provider | `200` `{"message": "provider deleted"}` |

Request body for create and update:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Create only. Starts with a letter or digit; letters, digits, `-`, `_`; 64 characters at most |
| `provider_type` | string | One of the provider types |
| `config` | object | Provider settings. On update, omit it to keep the stored config |
| `enabled` | boolean | Default `true` on create. On update, omit it to keep the current value |

```bash
curl -X POST http://localhost:3000/api/autoscale/providers \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-mock", "provider_type": "mock", "config": {}}'
```

```json
{
  "message": "provider created",
  "provider": {
    "name": "my-mock",
    "provider_type": "mock",
    "config": {},
    "enabled": true,
    "created_at": "2026-11-12T10:15:00Z",
    "updated_at": "2026-11-12T10:15:00Z"
  }
}
```

| Status | When |
|--------|------|
| `400` | Invalid JSON, invalid name, unknown provider type |
| `404` | `provider not found` (get, update, delete) |
| `409` | A provider with this name already exists (create) |
| `503` | `RUNQY_VAULT_MASTER_KEY` is not set |

## Alerts

Rules and delivery settings are explained in [Email alerts](../guides/alerting.md).

### Active alerts and history

`GET /api/alerts` (admin key)

| Query parameter | Default | Description |
|-----------------|---------|-------------|
| `history` | `50` | Number of past notifications to return |

```bash
curl -H "Authorization: Bearer dev-api-key" "http://localhost:3000/api/alerts?history=10"
```

```json
{
  "enabled": true,
  "active": [
    {
      "queue": "inference",
      "rule": "no_workers",
      "firing": true,
      "since": "2026-11-12T10:00:00Z",
      "fired_at": "2026-11-12T10:00:30Z",
      "message": "no live worker is serving the queue (4 job(s) pending)"
    }
  ],
  "history": [
    {
      "time": "2026-11-12T10:00:30Z",
      "queue": "inference",
      "rule": "no_workers",
      "status": "firing",
      "message": "no live worker is serving the queue (4 job(s) pending)"
    }
  ],
  "status": {
    "last_eval": "2026-11-12T10:15:00Z",
    "last_sent": "2026-11-12T10:00:30Z"
  }
}
```

An alert with `firing: false` is pending: its condition holds but its `for` delay has not elapsed. `status.last_error` and `status.last_error_at` appear after a failed evaluation or send.

### Read settings

`GET /api/alerts/settings` (admin key)

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/api/alerts/settings
```

```json
{
  "settings": {
    "enabled": true,
    "provider": "smtp",
    "from": "runqy@example.com",
    "recipients": ["ops@example.com"],
    "smtp": {
      "host": "smtp.example.com",
      "port": 587,
      "username": "runqy",
      "password": "vault://mail/smtp-password",
      "tls": "starttls"
    },
    "rules": [
      {"type": "no_workers"},
      {"type": "latency", "max_latency": "5m", "for": "2m"}
    ],
    "repeat_interval": "4h",
    "send_resolved": true
  }
}
```

Literal secrets are masked in the response.

### Save settings

`PUT /api/alerts/settings` (admin key)

The body is the settings object itself, not wrapped in `settings`. It replaces the stored settings. A masked secret sent back unchanged keeps the stored value.

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Turn alerting on |
| `provider` | string | `smtp` or `sendgrid` |
| `from` | string | Sender address. Required when enabled |
| `recipients` | array of strings | At least one when enabled |
| `smtp` | object | `host` (required for `smtp`), `port`, `username`, `password`, `tls` (`starttls`, `tls` or `none`) |
| `sendgrid` | object | `api_key` |
| `rules` | array | Each rule: `type` (`no_workers`, `latency`, `pending`, `worker_unhealthy`, `autoscale_failure`), and optionally `for`, `resolve_after`, `max_latency`, `threshold`, `when_idle`, `disabled` |
| `repeat_interval` | string | Go duration. Default `4h`; `0` notifies once |
| `send_resolved` | boolean | Default `true` |

```bash
curl -X PUT http://localhost:3000/api/alerts/settings \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "provider": "sendgrid",
    "from": "runqy@example.com",
    "recipients": ["ops@example.com"],
    "sendgrid": {"api_key": "vault://mail/sendgrid-key"},
    "rules": [{"type": "no_workers"}, {"type": "pending", "threshold": 100}]
  }'
```

The response is `{"message": "alert settings saved", "settings": {...}}`. An empty body, invalid JSON or invalid settings return `400`.

### Send a test email

`POST /api/alerts/test` (admin key)

With an empty body, the stored settings are used. With a settings object as body, those settings are tested without being saved.

```bash
curl -X POST -H "Authorization: Bearer dev-api-key" http://localhost:3000/api/alerts/test
```

```json
{"message": "test email sent"}
```

| Status | When |
|--------|------|
| `400` | Invalid JSON, or `alerting is not configured` |
| `502` | `test email failed: <reason>` |

## Vaults

Vaults are explained in [Vaults](../guides/vaults.md). Every vault endpoint needs the admin key and returns `503` when `RUNQY_VAULT_MASTER_KEY` is not set. No endpoint returns the clear value of a secret entry.

| Method and path | Purpose | Success |
|-----------------|---------|---------|
| `GET /api/vaults` | List vaults | `200` |
| `POST /api/vaults` | Create a vault | `201` |
| `GET /api/vaults/{name}` | Get a vault with its entries | `200` |
| `DELETE /api/vaults/{name}` | Delete a vault and its entries | `200` `{"message": "vault deleted successfully"}` |
| `GET /api/vaults/{name}/entries` | List entries | `200` |
| `POST /api/vaults/{name}/entries` | Set an entry | `200` `{"message": "entry set successfully"}` |
| `DELETE /api/vaults/{name}/entries/{key}` | Remove an entry | `200` `{"message": "entry deleted successfully"}` |

### List vaults

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/api/vaults
```

```json
{
  "vaults": [
    {"name": "api-keys", "description": "Keys for external services", "entry_count": 2}
  ],
  "count": 1
}
```

### Create a vault

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Vault name |
| `description` | string | no | Free text |

```bash
curl -X POST http://localhost:3000/api/vaults \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "api-keys", "description": "Keys for external services"}'
```

```json
{
  "message": "vault created successfully",
  "vault": {"name": "api-keys", "description": "Keys for external services"}
}
```

An existing name returns `409`.

### Get a vault

```bash
curl -H "Authorization: Bearer dev-api-key" http://localhost:3000/api/vaults/api-keys
```

```json
{
  "name": "api-keys",
  "description": "Keys for external services",
  "entries": [
    {
      "key": "OPENAI_API_KEY",
      "value": "sk****le",
      "is_secret": true,
      "created_at": "2026-11-12T10:15:00Z",
      "updated_at": "2026-11-12T10:15:00Z"
    }
  ],
  "created_at": "2026-11-12T10:15:00Z",
  "updated_at": "2026-11-12T10:15:00Z"
}
```

Secret values are masked: the first two and last two characters around `****`, or `****` alone for values of four characters or fewer. `GET /api/vaults/{name}/entries` returns `{"entries": [...], "count": n}` with the same entry objects. Unknown vault: `404`.

### Set an entry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Entry name; becomes the environment variable name in the task process |
| `value` | string | yes | Entry value |
| `is_secret` | boolean | no | Default `true`. `false` shows the value in API responses |

```bash
curl -X POST http://localhost:3000/api/vaults/api-keys/entries \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"key": "OPENAI_API_KEY", "value": "sk-example"}'
```

Setting an existing key replaces its value. Unknown vault: `404`.

## Health and metrics

None of these endpoints needs a key.

### Liveness

`GET /health` always answers `200` while the process runs.

```bash
curl http://localhost:3000/health
```

```json
{"status": "ok", "timestamp": "2026-11-12T10:15:00Z"}
```

### Readiness

`GET /healthz` pings Redis. It answers `200` with `"status": "ok"`, or `503` with `"status": "degraded"` when Redis is unreachable.

```json
{"status": "ok", "redis": true, "timestamp": "2026-11-12T10:15:00Z"}
```

### Prometheus metrics

`GET /metrics` returns metrics in the Prometheus text format. The metric names and example queries are in [Monitoring](../guides/monitoring.md).

```bash
curl http://localhost:3000/metrics
```

### Swagger UI

`GET /swagger/index.html` serves a Swagger UI generated from annotations in the server code. It covers only the `/queue`, `/worker`, `/workers` and `/api/vaults` endpoints and lists a `/workers/handshake` route that the server does not serve. Where it differs from this page, this page describes the actual behaviour.
