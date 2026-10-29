---
title: "Task Queue REST API Reference"
description: "REST API reference for the Runqy server: authentication, enqueueing tasks, the batch API, and queue and worker endpoints."
---

# Server API Reference

## Authentication

Most endpoints require Bearer token authentication:

```
Authorization: Bearer {api_key}
```

The API key is configured via the `RUNQY_API_KEY` environment variable on the server.

### API key roles

Besides the admin key, two optional keys limit what a caller can do:

| Variable | Role | Can call |
|----------|------|----------|
| `RUNQY_API_KEY` | admin | Everything |
| `RUNQY_WORKER_API_KEY` | worker | `POST /worker/register` |
| `RUNQY_CLIENT_API_KEY` | client | `POST /queue/add`, `POST /queue/add-batch` |

`GET /queue/{task_id}` needs no key (the task id acts as the capability).

Give workers the worker key so a compromised machine cannot manage queues or read secrets. The
[autoscaler](../guides/autoscaling.md) requires it: it is the key sent to rented GPU machines.

## Worker Endpoints

### `POST /worker/register`

Registers a worker and returns configuration including Redis credentials and deployment specs.

**Request Headers:**

| Header | Description |
|--------|-------------|
| `Authorization` | `Bearer {api_key}` |
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
  "worker_id": "worker-abc123",
  "queue": "inference"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `worker_id` | string | Unique identifier for this worker |
| `queue` | string | Queue name to process tasks from |

**Response:**

```json
{
  "redis": {
    "addr": "localhost:6379",
    "password": "",
    "db": 0
  },
  "queue": {
    "name": "inference",
    "priority": 6
  },
  "deployment": {
    "git_url": "https://github.com/example/repo.git",
    "branch": "main",
    "startup_cmd": "python main.py",
    "startup_timeout_secs": 300,
    "mode": "long_running",
    "vaults": ["api-keys"]
  },
  "vaults": {
    "OPENAI_API_KEY": "sk-actual-decrypted-key",
    "HF_TOKEN": "hf-actual-decrypted-token"
  }
}
```

The `vaults` field in the response contains decrypted key-value pairs from all vaults referenced in the deployment configuration. These are injected as environment variables by the worker.

**Error Responses:**

| Status | Description |
|--------|-------------|
| 401 | Invalid or missing API key |
| 400 | Invalid request body |
| 404 | Queue not found |
| 500 | Internal server error |

---

## Queue Endpoints

### `POST /queue/add`

Enqueue a new task.

**Request Body:**

```json
{
  "queue": "inference.high",
  "timeout": 300,
  "data": {
    "prompt": "Hello world",
    "width": 1024
  }
}
```

!!! info "`timeout` sets the execution (active) timeout"
    When provided, `timeout` (seconds) is the maximum time the task may **run**; exceeding it fails
    the task and retries it (up to `max_retry`). It overrides the queue's `active_timeout`. Omit it
    to use the queue default. All other lifecycle values (TTL, retries, pending timeout) come from
    the queue config — see [Task Lifecycle](../guides/task-lifecycle.md).

**Response:**

```json
{
  "info": {
    "id": "task-uuid",
    "queue": "inference.high",
    "state": "pending"
  }
}
```

### `POST /queue/add-batch`

Enqueue multiple tasks in a single request. Uses Redis pipelining for high-throughput job submission.

**Request Body:**

```json
{
  "queue": "inference.high",
  "timeout": 300,
  "jobs": [
    {"data": {"prompt": "Hello"}},
    {"data": {"prompt": "World"}},
    {"data": {"prompt": "Foo"}}
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `queue` | string | Yes | Target queue name |
| `timeout` | int | No | Execution (active) timeout applied to every job, in seconds. Overrides the queue's `active_timeout`. Omit to use the queue default |
| `jobs` | array | Yes | Array of job objects |
| `jobs[].data` | object | Yes | Task payload |

!!! note "Lifecycle limits come from the queue"
    TTL, retries, and pending timeout are taken from the target queue's configuration; only the
    execution (`active`) timeout can be overridden per request via `timeout`. See
    [Task Lifecycle](../guides/task-lifecycle.md).

**Response:**

```json
{
  "enqueued": 3,
  "failed": 0,
  "task_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "errors": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enqueued` | int | Number of successfully enqueued tasks |
| `failed` | int | Number of failed tasks |
| `task_ids` | array | List of task IDs (in order) |
| `errors` | array | Error messages for failed tasks |

**Performance:**

| Method | Throughput |
|--------|------------|
| Single `POST /queue/add` calls | ~800-1,000 jobs/s |
| Batch endpoint (100 jobs/request) | ~35,000-50,000 jobs/s |

!!! tip "Optimal batch size"
    Batch sizes of 50-200 jobs per request offer the best balance of throughput and latency.

---

### `GET /queue/{task_id}`

Get task status and result. The queue is automatically determined from the task's metadata stored in Redis.

**Response:**

```json
{
  "info": {
    "id": "task-uuid",
    "queue": "inference.high",
    "state": "completed",
    "result": "..."
  }
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 404 | Task not found |
| 400 | Invalid request |
| 500 | Internal server error |

---

## CLI API Endpoints

These endpoints are used by the CLI for remote management. All require Bearer token authentication.

### Queue Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cli/queues` | List all queues with statistics |
| `GET` | `/api/cli/queues/{queue}` | Get detailed queue information |
| `POST` | `/api/cli/queues/{queue}/pause` | Pause a queue |
| `POST` | `/api/cli/queues/{queue}/unpause` | Unpause a queue |

### Task Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/cli/tasks` | Enqueue a new task |
| `GET` | `/api/cli/queues/{queue}/tasks` | List tasks in a queue |
| `GET` | `/api/cli/queues/{queue}/tasks/{task_id}` | Get task details |
| `DELETE` | `/api/cli/tasks/{task_id}` | Cancel a task |
| `DELETE` | `/api/cli/queues/{queue}/tasks/{task_id}` | Delete a task |

### Worker Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cli/workers` | List all workers |
| `GET` | `/api/cli/workers/{worker_id}` | Get worker details |

### Config Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cli/configs` | List all queue configurations |
| `POST` | `/api/cli/configs/reload` | Reload configurations from YAML |
| `POST` | `/api/cli/configs` | Create a new queue configuration |
| `DELETE` | `/api/cli/configs/{name}` | Delete a queue configuration |

---

## Vault Endpoints

Vault endpoints manage encrypted secrets. All require Bearer token authentication.

!!! note "Prerequisite"
    The vaults feature must be enabled by setting the `RUNQY_VAULT_MASTER_KEY` environment variable. If not set, vault endpoints return `503 Service Unavailable`.

### `GET /api/vaults`

List all vaults with entry counts.

**Response:**

```json
{
  "vaults": [
    {
      "name": "api-keys",
      "description": "API keys for external services",
      "entry_count": 3
    }
  ],
  "count": 1
}
```

### `POST /api/vaults`

Create a new vault.

**Request Body:**

```json
{
  "name": "api-keys",
  "description": "API keys for external services"
}
```

**Response:**

```json
{
  "message": "vault created successfully",
  "vault": {
    "name": "api-keys",
    "description": "API keys for external services"
  }
}
```

### `GET /api/vaults/{name}`

Get vault details with entries (secret values masked).

**Response:**

```json
{
  "name": "api-keys",
  "description": "API keys for external services",
  "entries": [
    {
      "key": "OPENAI_API_KEY",
      "value": "sk****yz",
      "is_secret": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T12:45:00Z"
    }
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T12:45:00Z"
}
```

### `DELETE /api/vaults/{name}`

Delete a vault and all its entries.

**Response:**

```json
{
  "message": "vault deleted successfully"
}
```

### `POST /api/vaults/{name}/entries`

Set or update a vault entry.

**Request Body:**

```json
{
  "key": "OPENAI_API_KEY",
  "value": "sk-your-key-here",
  "is_secret": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Entry key (environment variable name) |
| `value` | string | Yes | Entry value |
| `is_secret` | boolean | No | Mask value in API responses (default: `true`) |

**Response:**

```json
{
  "message": "entry set successfully"
}
```

### `GET /api/vaults/{name}/entries`

List all entries in a vault (secret values masked).

**Response:**

```json
{
  "entries": [
    {
      "key": "OPENAI_API_KEY",
      "value": "sk****yz",
      "is_secret": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T12:45:00Z"
    }
  ],
  "count": 1
}
```

### `DELETE /api/vaults/{name}/entries/{key}`

Delete a vault entry.

**Response:**

```json
{
  "message": "entry deleted successfully"
}
```

---

## Autoscale Endpoints

GPU autoscaling status and provider management. Admin key required. Provider endpoints need
`RUNQY_VAULT_MASTER_KEY` (credentials are stored encrypted). See the
[Autoscaling guide](../guides/autoscaling.md).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/autoscale/status` | Tracked instances, states and accumulated cost |
| `POST` | `/api/autoscale/instances/{id}/protect` | Protect an instance from scale-down |
| `POST` | `/api/autoscale/instances/{id}/unprotect` | Remove the protection |
| `GET` | `/api/autoscale/provider-types` | Available provider types (`mock`, `runpod`, `vastai`) |
| `GET` | `/api/autoscale/providers` | List providers (secrets masked) |
| `POST` | `/api/autoscale/providers` | Create a provider |
| `GET` | `/api/autoscale/providers/{name}` | Get a provider (secrets masked) |
| `PUT` | `/api/autoscale/providers/{name}` | Update a provider |
| `DELETE` | `/api/autoscale/providers/{name}` | Delete a provider |

**`POST /api/autoscale/providers` body:**

```json
{
  "name": "gpu-runpod",
  "provider_type": "runpod",
  "config": { "api_key": "rpa_xxx", "gpu_type_id": "NVIDIA GeForce RTX 4090" },
  "enabled": true
}
```

`PUT` is a partial update: omit `config` to keep the stored configuration, omit `enabled` to keep
the current flag. A secret sent back in its masked form (as returned by `GET`) keeps its stored value.

**`GET /api/autoscale/status` response:**

```json
{
  "instances": [
    {
      "instance_id": "as-231d7097-…",
      "provider": "gpu-runpod",
      "queue": "inference",
      "status": "running",
      "worker_id": "a1b2c3:7",
      "protected": false,
      "price_per_hour": 0.6,
      "cost_accumulated": 0.412,
      "created_at": "2026-10-14T10:02:11Z",
      "last_job_at": "2026-10-14T10:20:40Z"
    }
  ],
  "count": 1,
  "total_cost": 0.412
}
```

---

## Alert Endpoints

Email alerting. Admin key required. See the [Alerts guide](../guides/alerting.md).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/alerts?history=50` | Active alerts, recent notifications, evaluator status |
| `GET` | `/api/alerts/settings` | Global alert settings (literal secrets masked) |
| `PUT` | `/api/alerts/settings` | Replace the global alert settings |
| `POST` | `/api/alerts/test` | Send a test email |

**`GET /api/alerts` response:**

```json
{
  "enabled": true,
  "active": [
    {
      "queue": "inference",
      "rule": "no_workers",
      "firing": true,
      "since": "2026-10-14T09:58:21Z",
      "fired_at": "2026-10-14T09:58:21Z",
      "message": "no live worker is serving the queue (3 job(s) pending)"
    }
  ],
  "history": [
    {
      "time": "2026-10-14T09:58:21Z",
      "queue": "inference",
      "rule": "no_workers",
      "status": "firing",
      "message": "no live worker is serving the queue (3 job(s) pending)"
    }
  ],
  "status": {
    "last_eval": "2026-10-14T09:58:51Z",
    "last_sent": "2026-10-14T09:58:21Z"
  }
}
```

`active` lists conditions that are firing, and those still waiting for their `for` duration
(`firing: false`). History statuses are `firing`, `repeat`, `resolved` and `event`.

**`PUT /api/alerts/settings` body:** the same fields as the YAML `alerts` block, in JSON:

```json
{
  "enabled": true,
  "provider": "smtp",
  "from": "runqy <alerts@example.com>",
  "recipients": ["ops@example.com"],
  "smtp": { "host": "smtp.example.com", "port": 587, "tls": "starttls", "username": "alerts@example.com", "password": "vault://mail/smtp_password" },
  "rules": [{ "type": "no_workers", "for": "2m" }, { "type": "latency", "max_latency": "10m" }],
  "repeat_interval": "4h",
  "send_resolved": true
}
```

Invalid settings return `400` with the reason. A secret sent back masked keeps its stored value.

**`POST /api/alerts/test`:** with an empty body, uses the saved settings; with a settings body,
tests those (unsaved) settings. Returns `502` with the delivery error if the email could not be sent.

---

## Control Endpoint

Send a command to workers. Admin key required. See the [Worker Control guide](../guides/worker-control.md).

**`POST /api/control`**

```json
{
  "action": "code_update",
  "target": "inference",
  "timeout": "15m"
}
```

| Field | Description |
|-------|-------------|
| `action` | `drain`, `resume`, `code_update`, `worker_update` or `config_reload` |
| `target` | Worker id or queue name; omitted: every worker |
| `version` | Release to install, e.g. `0.4.1` (`worker_update` only, required) |
| `timeout` | How long to wait for tasks in flight (Go duration) |

**Response `202 Accepted`:**

```json
{
  "id": "2223310d948b29a8",
  "action": "code_update",
  "channel": "runqy:control:inference",
  "target": "queue inference",
  "receivers": 2
}
```

`receivers` is the number of workers that got the command (`0`: none is listening). The outcome
appears in each worker's `last_command` in `GET /workers/{id}`, next to `version`,
`control_actions` and `held`. An unknown action, a missing version or an unknown target returns `400`.

---

## Swagger Documentation

Interactive API documentation is available at:

```
http://localhost:3000/swagger/index.html
```
