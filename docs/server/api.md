# Server API Reference

## Authentication

Most endpoints require Bearer token authentication:

```
Authorization: Bearer {api_key}
```

The API key is configured via the `RUNQY_API_KEY` environment variable on the server.

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
    "priority": 6,
    "mode": "long_running"
  },
  "deployment": {
    "git_url": "https://github.com/example/repo.git",
    "branch": "main",
    "startup_cmd": "python main.py",
    "startup_timeout_secs": 300,
    "requirements_file": "requirements.txt",
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
  "queue": "inference_high",
  "timeout": 300,
  "data": {
    "prompt": "Hello world",
    "width": 1024
  }
}
```

**Response:**

```json
{
  "info": {
    "id": "task-uuid",
    "queue": "inference_high",
    "state": "pending"
  }
}
```

### `GET /queue/{task_id}`

Get task status and result. The queue is automatically determined from the task's metadata stored in Redis.

**Response:**

```json
{
  "info": {
    "id": "task-uuid",
    "queue": "inference_high",
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

## Swagger Documentation

Interactive API documentation is available at:

```
http://localhost:3000/swagger/index.html
```
