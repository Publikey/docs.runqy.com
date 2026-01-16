# Server Configuration

The server is configured via a YAML file.

## Configuration File

```yaml
server:
  port: 8081
  api_key: "your-secret-api-key"

redis:
  addr: "localhost:6379"
  password: ""  # Optional
  db: 0         # Optional

queues:
  inference:
    priority: 6
    mode: long_running  # or one_shot
    deployment:
      git_url: "https://github.com/example/repo.git"
      branch: "main"
      startup_cmd: "python main.py"
      startup_timeout_secs: 300
      requirements_file: "requirements.txt"  # Optional

  simple:
    priority: 3
    mode: one_shot
    deployment:
      git_url: "https://github.com/example/simple-tasks.git"
      branch: "main"
      startup_cmd: "python task.py"
      startup_timeout_secs: 60
```

## Configuration Options

### `server`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `port` | int | Yes | HTTP port to listen on |
| `api_key` | string | Yes | API key for worker authentication |

### `redis`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `addr` | string | Yes | Redis server address (host:port) |
| `password` | string | No | Redis password |
| `db` | int | No | Redis database number (default: 0) |

### `queues`

Each queue is defined by its name (key) and the following options:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `priority` | int | Yes | Queue priority (higher = more important) |
| `mode` | string | No | Execution mode: `long_running` (default) or `one_shot` |
| `deployment` | object | Yes | Deployment configuration |

### `deployment`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `git_url` | string | Yes | Git repository URL for task code |
| `branch` | string | Yes | Git branch to clone |
| `startup_cmd` | string | Yes | Command to start the Python process |
| `startup_timeout_secs` | int | Yes | Timeout for process startup |
| `requirements_file` | string | No | Path to requirements.txt (default: `requirements.txt`) |

## Sub-Queues

Queues support sub-queue naming using the format `{parent}:{sub_queue}`:

- `inference:high` — High priority inference tasks
- `inference:low` — Low priority inference tasks
- `simple:default` — Default simple tasks

Workers register for a parent queue and can process tasks from any of its sub-queues based on priority.
