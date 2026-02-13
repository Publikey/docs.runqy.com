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
  use_system_site_packages: true  # Set to false for isolated virtualenv
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
| `use_system_site_packages` | bool | No | Inherit packages from base Python environment (default: `true`). Set to `false` for isolated virtualenv |

## Environment Variables

All configuration values can be set via environment variables, which take priority over `config.yml`:

| Variable | Description | Default |
|----------|-------------|---------|
| `RUNQY_SERVER_URL` | Server URL | - |
| `RUNQY_API_KEY` | API key for authentication | - |
| `RUNQY_QUEUES` | Queues to listen on (comma-separated) | - |
| `RUNQY_CONCURRENCY` | Number of concurrent tasks | `1` |
| `RUNQY_SHUTDOWN_TIMEOUT` | Graceful shutdown timeout | `30s` |
| `RUNQY_BOOTSTRAP_RETRIES` | Number of bootstrap retry attempts | `3` |
| `RUNQY_BOOTSTRAP_RETRY_DELAY` | Delay between bootstrap retries | `5s` |
| `RUNQY_GIT_SSH_KEY` | Path to SSH private key for git clone | - |
| `RUNQY_GIT_TOKEN` | Git PAT token for HTTPS clone | - |
| `RUNQY_DEPLOYMENT_DIR` | Local deployment directory | `./deployment` |
| `RUNQY_USE_SYSTEM_SITE_PACKAGES` | Inherit packages from base Python (`true`/`false`) | `true` |
| `RUNQY_MAX_RETRY` | Max task retries | `3` |

### Examples

=== "PowerShell"

    ```powershell
    $env:RUNQY_SERVER_URL = "http://localhost:3000"
    $env:RUNQY_API_KEY = "your-api-key"
    $env:RUNQY_QUEUES = "inference"
    runqy-worker
    ```

=== "Bash"

    ```bash
    export RUNQY_SERVER_URL="http://localhost:3000"
    export RUNQY_API_KEY="your-api-key"
    export RUNQY_QUEUES="inference"
    runqy-worker
    ```

=== "Docker"

    ```bash
    docker run \
      -e RUNQY_SERVER_URL=http://host.docker.internal:3000 \
      -e RUNQY_API_KEY=your-api-key \
      -e RUNQY_QUEUES=inference \
      runqy-worker
    ```

!!! tip "No config.yml needed"
    When using environment variables, you can run the worker without any `config.yml` file.

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
