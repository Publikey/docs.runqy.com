# Server Configuration

The server is configured via **environment variables** and **CLI flags**. CLI flags take priority over environment variables, which take priority over defaults.

## Configuration Methods

### 1. Environment Variables (`.env.secret` file)

Create a `.env.secret` file in the parent directory of `app/`:

```bash
# .env.secret
RUNQY_API_KEY=your-secret-api-key
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your-db-password
DATABASE_DBNAME=sdxl_queuing_dev
```

### 2. CLI Flags

```bash
runqy serve --port 8080 --api-key my-key --redis-uri redis://:password@localhost:6379
runqy serve --db-host pg.example.com --db-name mydb --db-user admin
runqy serve --sqlite --sqlite-path ./data/runqy.db
```

### 3. Priority Order

```
CLI flags > Environment variables > Defaults
```

## Environment Variables Reference

### Server

| Variable | Default | CLI Flag | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | `--port` | HTTP server port |
| `RUNQY_API_KEY` | — | `--api-key` (global) | API key for authenticated endpoints |

### Redis

| Variable | Default | CLI Flag | Description |
|----------|---------|----------|-------------|
| `REDIS_HOST` | `localhost` | — | Redis hostname |
| `REDIS_PORT` | `6379` | — | Redis port |
| `REDIS_PASSWORD` | — | — | Redis password |
| `REDIS_TLS` | `false` | `--redis-tls` | Enable TLS for Redis connection |
| — | — | `--redis-uri` (global) | Redis URI (overrides host/port/password/tls). Format: `redis[s]://[:password@]host[:port]` |

### PostgreSQL

| Variable | Default | CLI Flag | Description |
|----------|---------|----------|-------------|
| `DATABASE_HOST` | `localhost` | `--db-host` | PostgreSQL hostname |
| `DATABASE_PORT` | `5432` | `--db-port` | PostgreSQL port |
| `DATABASE_USER` | `postgres` | `--db-user` | PostgreSQL username |
| `DATABASE_PASSWORD` | — | `--db-password` | PostgreSQL password |
| `DATABASE_DBNAME` | `sdxl_queuing_dev` | `--db-name` | PostgreSQL database name |
| `DATABASE_SSL` | `disable` | `--db-ssl` | PostgreSQL SSL mode |

### SQLite (alternative to PostgreSQL)

| Variable | Default | CLI Flag | Description |
|----------|---------|----------|-------------|
| `SQLITE_DB_PATH` | `runqy.db` | `--sqlite-path` | SQLite database file path |
| — | — | `--sqlite` | Use SQLite instead of PostgreSQL |

### Monitoring & Security

| Variable | Default | CLI Flag | Description |
|----------|---------|----------|-------------|
| `ASYNQ_READ_ONLY` | `false` | — | Restrict monitoring UI to read-only mode |
| `PROMETHEUS_ADDRESS` | — | — | Prometheus server URL for time-series charts |
| `RUNQY_JWT_SECRET` | (auto-generated) | — | JWT secret for dashboard authentication. If not set, a random secret is generated on each restart (sessions won't survive restarts) |
| `RUNQY_VAULT_MASTER_KEY` | — | — | Base64-encoded 32-byte key for vault encryption. If not set, the vaults feature is disabled |

### Additional Server Flags

| Flag | Description |
|------|-------------|
| `--config <dir>` | Path to queue workers config directory (overrides `QUEUE_WORKERS_DIR`) |
| `--watch` | Enable file/git watching for config auto-reload |
| `--config-repo <url>` | GitHub repo URL for configs |
| `--config-branch <branch>` | Git branch (default: main) |
| `--no-ui` | Disable the monitoring web dashboard |
| `--debug` | Enable verbose logging |

## Queue Worker Definitions (YAML)

!!! note "Optional"
    YAML-based queue definitions are optional. In most cases, queues are created and managed after startup using the CLI (`runqy config create`) or the monitoring dashboard GUI.

YAML files in the `deployment/` directory (or a custom directory specified with `--config`) allow you to pre-configure queues so that a fresh server starts with all queues already set up — useful for automated deployments or spinning up new environments.

```yaml
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

### Queue Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `priority` | int | Yes | Queue priority (higher = more important) |
| `mode` | string | No | Execution mode: `long_running` (default) or `one_shot` |
| `deployment` | object | Yes | Deployment configuration |

### Deployment Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `git_url` | string | Yes | Git repository URL for task code |
| `branch` | string | Yes | Git branch to clone |
| `code_path` | string | No | Path of the task code within the repository (e.g., `simple-task`)  |
| `startup_cmd` | string | Yes | Command to start the Python process |
| `startup_timeout_secs` | int | Yes | Timeout for process startup |
| `requirements_file` | string | No | Path to requirements.txt (default: `requirements.txt`) |
| `vaults` | list | No | List of vault names to inject as environment variables |
| `redis_storage` | bool | No | If `true`, task results are written to Redis. If `false`, results are not stored in Redis and must be managed by the task itself (e.g., via webhook). Default: `false` |
| `git_token` | string | No | Path to your github PAT's. Use the following format `vault://{VAULT-NAME}/{KEY}` (e.g., `vault://github_pats/SIMPLE_TASK`) |

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

### Queue Creation Behavior

When you define a queue in the configuration, the sub-queues created depend on whether you explicitly define them:

| Configuration | Sub-queues created |
|---------------|-------------------|
| No `sub_queues` defined | `.default` is created automatically |
| `sub_queues` explicitly defined | Only the listed sub-queues are created (NO `.default`) |

**Example 1: No sub-queues → `.default` is created**
```yaml
queues:
  myqueue:
    deployment: ...
# Creates: myqueue.default
```

**Example 2: Explicit sub-queues → only those are created**
```yaml
queues:
  myqueue:
    sub_queues:
      - name: high
        priority: 10
      - name: low
        priority: 3
    deployment: ...
# Creates: myqueue.high, myqueue.low
# Does NOT create: myqueue.default
```

!!! warning "Fallback to `.default` may fail"
    If you reference `myqueue` (without sub-queue suffix) and `.default` doesn't exist (because you defined explicit sub-queues), the operation will fail. Always use the full queue name when sub-queues are explicitly defined.

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

## Monitoring

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PROMETHEUS_ADDRESS` | No | Prometheus server URL (e.g., `http://localhost:9090`). Enables time-series charts in the dashboard. If not set, the dashboard uses Redis-based historical data. |

The server always exposes Prometheus metrics at `/metrics` regardless of this setting. See the [Monitoring Guide](../guides/monitoring.md) for full setup instructions including dashboard authentication.

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
