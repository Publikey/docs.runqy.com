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

Sub-queues allow you to assign different priorities to the same task type based on the caller's tier or urgency. This is useful when multiple clients submit identical tasks but require different service levels.

### Use Case: Paid vs Free Users

A common pattern is routing tasks from paid users to a high-priority sub-queue while free users go to a lower-priority sub-queue:

```yaml
queues:
  inference:
    sub_queues:
      - name: premium    # Paid users — processed first
        priority: 10
      - name: standard   # Free users — processed when premium queue is empty
        priority: 3
    deployment:
      git_url: "https://github.com/example/inference.git"
      branch: "main"
      startup_cmd: "python main.py"
      startup_timeout_secs: 300
```

Your API backend then routes tasks based on user tier:

```python
# In your API backend
if user.is_premium:
    client.enqueue("inference.premium", payload)
else:
    client.enqueue("inference.standard", payload)
```

Both sub-queues run the **same task code** (same deployment), but workers prioritize `inference.premium` tasks over `inference.standard` tasks.

### Naming Format

Queues use the format `{parent}.{sub_queue}`:

- `inference.premium` — High priority inference tasks
- `inference.standard` — Standard priority inference tasks
- `simple.default` — Default simple tasks

Workers register for a parent queue and can process tasks from any of its sub-queues based on priority.

### Automatic Default Fallback

When a queue name is referenced without a sub-queue suffix, runqy automatically appends `.default`:

| You provide | Resolves to |
|-------------|-------------|
| `inference` | `inference.default` |
| `simple` | `simple.default` |
| `inference.high` | `inference.high` (unchanged) |

This applies to:

- **Workers:** When a worker registers for queue `inference`, it actually registers for `inference.default`
- **Task enqueueing:** When you enqueue a task to `inference`, it goes to `inference.default`
- **Task retrieval:** When you query queue `inference`, it looks up `inference.default`

!!! warning "Queue must exist"
    If the resolved queue (e.g., `inference.default`) doesn't exist in the configuration, an error is returned. The fallback only adds the `.default` suffix—it doesn't create the queue automatically.

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
