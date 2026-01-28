# Worker Configuration

The worker is configured via a YAML file.

## Configuration File

```yaml
server:
  url: "http://localhost:8081"
  api_key: "your-secret-api-key"

worker:
  queue: "inference"
  concurrency: 1
  shutdown_timeout: 30s

deployment:
  dir: "./deployment"
```

## Configuration Options

### `server`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `url` | string | Yes | runqy server URL |
| `api_key` | string | Yes | API key for authentication |

### `worker`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `queue` | string | Yes | Queue name to process tasks from |
| `concurrency` | int | No | Number of concurrent task processors (default: 1) |
| `shutdown_timeout` | duration | No | Graceful shutdown timeout (default: 30s) |

### `deployment`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `dir` | string | Yes | Directory for cloning task code |

## Environment Variables

Configuration values can also be set via environment variables:

| Variable | Config Path |
|----------|-------------|
| `RUNQY_SERVER_URL` | `server.url` |
| `RUNQY_API_KEY` | `server.api_key` |
| `RUNQY_QUEUE` | `worker.queue` |

## Vault Injection

If the queue's deployment configuration references vaults, the worker automatically:

1. Receives decrypted vault entries from the server during bootstrap
2. Injects them as environment variables before starting the Python process
3. Python code can access secrets via `os.environ`

```python
import os

# Access secrets from vaults
api_key = os.environ.get("OPENAI_API_KEY")
db_password = os.environ.get("DB_PASSWORD")
```

Vaults are configured on the server side in the queue's deployment YAML. See the [Vaults Guide](../guides/vaults.md) for details.

## Key Constraint

**One worker = one queue = one supervised Python process**

Each worker instance:

- Processes tasks from a single queue
- Runs a single Python process
- Has a concurrency of 1 for the Python process (though the worker can manage queue operations concurrently)

To scale, run multiple worker instances.
