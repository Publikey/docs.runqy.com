# Server API Reference

## Endpoints

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
