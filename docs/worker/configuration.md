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

recovery:
  enabled: true        # Auto-restart crashed Python processes (default: true)
  max_restarts: 5      # Circuit breaker threshold (default: 5)
  cooldown_period: 10m # Stable run time to reset counter (default: 10m)
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

### `recovery`

Controls auto-recovery when a supervised Python process crashes. Enabled by default.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | bool | No | Enable auto-recovery (default: `true`) |
| `max_restarts` | int | No | Max consecutive restarts before entering degraded state (default: `5`) |
| `initial_delay` | duration | No | Delay before the first restart attempt (default: `1s`) |
| `max_delay` | duration | No | Maximum delay between restart attempts (default: `5m`) |
| `backoff_factor` | float | No | Multiplier for exponential backoff between restarts (default: `2.0`) |
| `cooldown_period` | duration | No | Time without crash to reset the failure counter (default: `10m`) |

```yaml
recovery:
  enabled: true
  max_restarts: 5
  initial_delay: "1s"
  max_delay: "5m"
  backoff_factor: 2.0
  cooldown_period: "10m"
```

!!! info "How auto-recovery works"
    When a Python process crashes, the worker automatically restarts it with exponential backoff.
    If the process keeps crashing (reaching `max_restarts` without a stable run), the worker enters
    **degraded state** and stops retrying — manual restart is required. If the process runs
    successfully for `cooldown_period`, the failure counter resets to zero.

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
| `RUNQY_RECOVERY_ENABLED` | Enable process auto-recovery (`true`/`false`) | `true` |
| `RUNQY_RECOVERY_MAX_RESTARTS` | Max consecutive restarts before degraded state | `5` |
| `RUNQY_RECOVERY_INITIAL_DELAY` | Initial delay before restart attempt | `1s` |
| `RUNQY_RECOVERY_MAX_DELAY` | Maximum backoff delay between restarts | `5m` |
| `RUNQY_RECOVERY_COOLDOWN` | Stable run time to reset failure counter | `10m` |

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

## Degraded State

If the supervised Python process crashes repeatedly and exceeds `max_restarts` without a stable run:

1. Worker enters **degraded state** — no more restart attempts
2. Heartbeat reports `healthy: false` with recovery state `degraded`
3. Tasks are returned to queue for retry (but will keep failing on this worker)
4. **Manual restart of the worker is required** to recover

To disable auto-recovery entirely and revert to the old behavior (immediate degraded state on first crash), set `recovery.enabled: false`.
