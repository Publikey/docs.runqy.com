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
| `vaults` | list | No | List of vault names to inject as environment variables |
| `redis_storage` | bool | No | If `true`, task results are written to Redis. If `false`, results are not stored in Redis and must be managed by the task itself (e.g., via webhook). Default: `false` |

## Sub-Queues

Queues support sub-queue naming using the format `{parent}_{sub_queue}`:

- `inference_high` — High priority inference tasks
- `inference_low` — Low priority inference tasks
- `simple_default` — Default simple tasks

Workers register for a parent queue and can process tasks from any of its sub-queues based on priority.

## Vaults

Vaults provide secure storage for secrets that are injected into workers as environment variables.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RUNQY_VAULT_MASTER_KEY` | No | Base64-encoded 32-byte key for encrypting vault entries. If not set, the vaults feature is disabled. |

### Generating a Master Key

```bash
# Generate a secure 256-bit key
openssl rand -base64 32
# Output: YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=

# Set as environment variable
export RUNQY_VAULT_MASTER_KEY="YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY="
```

### Using Vaults in Queue Configuration

```yaml
queues:
  inference:
    priority: 6
    deployment:
      git_url: "https://github.com/example/repo.git"
      branch: "main"
      startup_cmd: "python main.py"
      startup_timeout_secs: 300
      vaults:
        - api-keys
        - model-credentials
```

When a worker registers for this queue, all entries from the specified vaults are decrypted and sent to the worker. The worker then injects them as environment variables before starting the Python process.

### Accessing Secrets in Python

```python
import os

# Access vault entries as environment variables
openai_key = os.environ.get("OPENAI_API_KEY")
hf_token = os.environ.get("HF_TOKEN")
```

!!! warning "Security Note"
    Vault entries are transmitted to workers during bootstrap. Ensure workers are running in a trusted environment and the connection to the server is secured (HTTPS).
