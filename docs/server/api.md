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
    "requirements_file": "requirements.txt"
  }
}
```

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

### `GET /queue/{task_id}/{queue_name}`

Get task status and result.

**Response:**

```json
{
  "info": {
    "id": "task-uuid",
    "state": "completed",
    "result": "..."
  }
}
```

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

## Swagger Documentation

Interactive API documentation is available at:

```
http://localhost:3000/swagger/index.html
```
