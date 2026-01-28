# CLI Reference

The runqy server includes a comprehensive command-line interface for managing queues, tasks, workers, and configurations. The CLI can operate locally (direct database access) or remotely (via HTTP API).

## Installation

Build the CLI from source:

```bash
cd runqy/app
go build -o runqy .
```

## Command Overview

| Command | Description |
|---------|-------------|
| `runqy` | Start the HTTP server (default, same as `runqy serve`) |
| `runqy serve` | Start the HTTP server |
| `runqy queue` | Queue management commands |
| `runqy task` | Task management commands |
| `runqy worker` | Worker management commands |
| `runqy config` | Configuration management commands |
| `runqy vault` | Vault management commands (secrets) |
| `runqy login` | Save server credentials for remote mode |
| `runqy logout` | Remove saved credentials |
| `runqy auth` | Authentication management (status, list, switch) |

## Server Commands

### Start the Server

```bash
# Start with defaults
runqy serve

# Or simply (serve is the default command)
runqy

# Start with custom config directory
runqy serve --config ./my-deployment

# Start with git-based config and auto-reload
runqy serve --config-repo https://github.com/org/configs.git --watch
```

**Serve Flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `--config` | Path to queue workers config directory | `QUEUE_WORKERS_DIR` env |
| `--watch` | Enable file/git watching for config auto-reload | `false` |
| `--config-repo` | GitHub repo URL for configs | - |
| `--config-branch` | Git branch | `main` |
| `--config-path` | Path within repo to YAML files | - |
| `--clone-dir` | Directory to clone repo into | - |
| `--watch-interval` | Git polling interval in seconds | - |

## Queue Commands

### List Queues

```bash
runqy queue list
```

Output:
```
QUEUE              PENDING  ACTIVE  SCHEDULED  RETRY  ARCHIVED  COMPLETED  PAUSED
inference_high     5        2       0          1      0         150        no
inference_low      12       0       3          0      0         89         no
```

### Inspect Queue

```bash
runqy queue inspect inference_high
```

Shows detailed queue information including status, pause state, memory usage, and task counts.

### Pause/Unpause Queue

```bash
# Pause a queue (stops processing new tasks)
runqy queue pause inference_high

# Resume a paused queue
runqy queue unpause inference_high
```

## Task Commands

### Enqueue a Task

```bash
# Enqueue a task with JSON payload
runqy task enqueue --queue inference_high --payload '{"prompt":"Hello world","width":1024}'

# Short flags
runqy task enqueue -q inference_high -p '{"msg":"test"}'

# With custom timeout (seconds)
runqy task enqueue -q inference_high -p '{"data":"value"}' --timeout 300
```

**Enqueue Flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `-q, --queue` | Queue name (required) | - |
| `-p, --payload` | JSON payload | `{}` |
| `-t, --timeout` | Task timeout in seconds | `600` |

### List Tasks

```bash
# List pending tasks in a queue
runqy task list inference_high

# List tasks by state
runqy task list inference_high --state pending
runqy task list inference_high --state active
runqy task list inference_high --state scheduled
runqy task list inference_high --state retry
runqy task list inference_high --state archived
runqy task list inference_high --state completed

# Limit number of results
runqy task list inference_high --state pending --limit 20
```

### Get Task Details

```bash
runqy task get inference_high abc123-task-id
```

Output:
```
Task ID:     abc123-task-id
Type:        task
Queue:       inference_high
State:       completed
Max Retry:   3
Retried:     0
Timeout:     10m0s
...
```

### Cancel and Delete Tasks

```bash
# Cancel a running task
runqy task cancel abc123-task-id

# Delete a task from a queue
runqy task delete inference_high abc123-task-id
```

## Worker Commands

### List Workers

```bash
runqy worker list
```

Output:
```
WORKER_ID                              STATUS  QUEUES          CONCURRENCY  LAST_BEAT  STALE
worker-abc123-def456                   ready   inference_high  1            5s         no
worker-xyz789-uvw012                   ready   inference_low   1            3s         no
```

### Get Worker Info

```bash
runqy worker info worker-abc123-def456
```

Output:
```
Worker ID:   worker-abc123-def456
Status:      ready
Queues:      inference_high
Concurrency: 1
Started At:  2024-01-15 10:30:00
Last Beat:   2024-01-15 10:35:45 (5s ago)
```

## Config Commands

### List Queue Configurations

```bash
runqy config list
```

Output:
```
NAME              PRIORITY  PROVIDER  MODE          GIT_URL
inference_high    10        worker    long_running  https://github.com/org/worker.git
inference_low     5         worker    long_running  https://github.com/org/worker.git
simple_default    1         worker    one_shot      https://github.com/org/simple.git
```

### Reload Configurations

```bash
# Reload configs from default directory (QUEUE_WORKERS_DIR)
runqy config reload

# Reload from a specific directory
runqy config reload --dir ./my-deployment
```

### Validate Configuration Files

```bash
# Validate YAML files without loading into database
runqy config validate

# Validate from a specific directory
runqy config validate --dir ./my-deployment
```

!!! note
    `config validate` is local-only and does not work in remote mode.

### Create Queue Configuration

```bash
# From YAML file
runqy config create -f ./my-queue.yaml

# Inline parameters
runqy config create --name myqueue --priority 5 \
  --git-url https://github.com/org/repo.git \
  --startup-cmd "python main.py"

# Update existing queue (use --force)
runqy config create -f ./queue.yaml --force
```

**Create Flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `-f, --file` | YAML config file path | - |
| `--name` | Queue name | - |
| `--priority` | Queue priority | `1` |
| `--git-url` | Git repository URL | - |
| `--branch` | Git branch | `main` |
| `--startup-cmd` | Startup command | - |
| `--mode` | Mode: `long_running` or `one_shot` | `long_running` |
| `--code-path` | Path within repo to the code | - |
| `--force` | Update existing queue if it already exists | `false` |

### Remove Queue Configuration

```bash
runqy config remove myqueue

# Or with flag
runqy config remove --name myqueue
```

## Vault Commands

Vaults store encrypted secrets that are injected into workers as environment variables.

!!! note "Prerequisite"
    The vaults feature requires the `RUNQY_VAULT_MASTER_KEY` environment variable to be set on the server.

### List Vaults

```bash
runqy vault list
```

Output:
```
NAME         DESCRIPTION                    ENTRIES
api-keys     API keys for external services 3
credentials  Database credentials           2
```

### Create a Vault

```bash
# Create with description
runqy vault create api-keys -d "API keys for external services"

# Create without description
runqy vault create my-secrets
```

### Show Vault Details

```bash
runqy vault show api-keys
```

Output:
```
Vault: api-keys
Description: API keys for external services
Created: 2024-01-15T10:30:00Z
Updated: 2024-01-15T12:45:00Z

Entries (3):
KEY              VALUE           SECRET
OPENAI_API_KEY   sk****yz        yes
HF_TOKEN         hf****ab        yes
DEBUG_MODE       true            no
```

Secret values are masked in the output for security.

### Delete a Vault

```bash
# With confirmation prompt
runqy vault delete api-keys

# Skip confirmation
runqy vault delete api-keys --force
```

### Set a Vault Entry

```bash
# Set a secret entry (default)
runqy vault set api-keys OPENAI_API_KEY sk-your-key-here

# Set a non-secret entry (visible in API responses)
runqy vault set api-keys DEBUG_MODE true --no-secret
```

**Set Flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `--no-secret` | Store as non-secret (visible in API) | `false` |

### Get a Vault Entry

```bash
runqy vault get api-keys OPENAI_API_KEY
```

Output:
```
sk-your-actual-key-here
```

!!! warning "Local Only"
    The `vault get` command only works in local mode for security reasons. It returns the decrypted value.

### Remove a Vault Entry

```bash
runqy vault unset api-keys OPENAI_API_KEY
```

### List Vault Entries

```bash
runqy vault entries api-keys
```

Output:
```
KEY              VALUE           SECRET  UPDATED
OPENAI_API_KEY   sk****yz        yes     2024-01-15T12:45:00Z
HF_TOKEN         hf****ab        yes     2024-01-15T10:30:00Z
DEBUG_MODE       true            no      2024-01-15T11:00:00Z
```

## Remote Mode

The CLI can operate in two modes:

1. **Local mode** (default): Connects directly to Redis/PostgreSQL
2. **Remote mode**: Connects to a runqy server via HTTP API

Use remote mode to manage a runqy server from a different machine.

### Usage

```bash
# Remote mode - specify server URL and API key
runqy --server https://runqy.example.com:3000 --api-key YOUR_API_KEY queue list

# Short flags
runqy -s https://runqy.example.com:3000 -k YOUR_API_KEY queue list

# API key can also be set via environment variable
export RUNQY_API_KEY=YOUR_API_KEY
runqy -s https://runqy.example.com:3000 queue list
```

### Remote Mode Examples

```bash
# List queues on remote server
runqy -s https://server:3000 -k API_KEY queue list

# Enqueue a task on remote server
runqy -s https://server:3000 -k API_KEY task enqueue -q inference_high -p '{"msg":"hello"}'

# List workers on remote server
runqy -s https://server:3000 -k API_KEY worker list

# Trigger config reload on remote server
runqy -s https://server:3000 -k API_KEY config reload
```

### Remote Mode Support

| Command | Remote Support | Notes |
|---------|---------------|-------|
| `queue list/inspect/pause/unpause` | Yes | Full support |
| `task enqueue/list/get/cancel/delete` | Yes | Full support |
| `worker list/info` | Yes | Full support |
| `config list/reload/create/remove` | Yes | Full support |
| `config validate` | No | Local-only (validates local YAML files) |
| `vault list/create/show/delete` | Yes | Full support |
| `vault set/unset/entries` | Yes | Full support |
| `vault get` | No | Local-only (returns decrypted secrets) |
| `serve` | No | Server command, not applicable |

## Authentication Persistence

Save server credentials so you don't need to specify `--server` and `--api-key` for every command.

### Login and Save Credentials

```bash
# Save credentials for a server (saved as "default" profile)
runqy login -s https://production.example.com:3000 -k prod-api-key

# Save with a custom profile name
runqy login -s https://staging.example.com:3000 -k staging-key --name staging

# API key can be prompted interactively
runqy login -s https://server:3000
# API Key: <enter key>
```

Credentials are stored in `~/.runqy/credentials.json` with restricted permissions (0600).

### Using Saved Credentials

After logging in, commands work without flags:

```bash
# Before (verbose)
runqy --server https://server:3000 --api-key KEY queue list

# After login (simple)
runqy queue list
runqy task enqueue -q myqueue -p '{"msg":"hello"}'
runqy worker list
```

### Manage Multiple Servers

```bash
# List all saved servers
runqy auth list
```

Output:
```
NAME     URL                                    CURRENT
default  https://production.example.com:3000   *
staging  https://staging.example.com:3000
```

```bash
# Show current connection
runqy auth status
```

Output:
```
Current server: default
URL: https://production.example.com:3000
API Key: prod...key
```

```bash
# Switch to different server
runqy auth switch staging
# Switched to "staging"
```

### Logout

```bash
# Remove current profile
runqy logout

# Remove specific profile
runqy logout --name staging

# Remove all saved credentials
runqy logout --all
```

### Credential Priority

Credentials are resolved in this order (highest to lowest):

1. Command-line flags (`--server`, `--api-key`)
2. Environment variables (`RUNQY_SERVER`, `RUNQY_API_KEY`)
3. Saved credentials (`~/.runqy/credentials.json`)
4. Local mode (direct Redis/PostgreSQL access)

## Global Flags

These flags are available for all commands:

| Flag | Description |
|------|-------------|
| `-s, --server` | Remote server URL for CLI-over-HTTP mode |
| `-k, --api-key` | API key for authentication (or set `RUNQY_API_KEY` env var) |
| `--redis-uri` | Redis URI (overrides `REDIS_HOST`/`REDIS_PORT`) |
| `-v, --version` | Print version information |
| `-h, --help` | Help for the command |

## Shell Completion

Generate shell completion scripts for your shell:

=== "Bash"

    ```bash
    runqy completion bash > /etc/bash_completion.d/runqy
    ```

=== "Zsh"

    ```bash
    runqy completion zsh > "${fpath[1]}/_runqy"
    ```

=== "Fish"

    ```bash
    runqy completion fish > ~/.config/fish/completions/runqy.fish
    ```

=== "PowerShell"

    ```powershell
    runqy completion powershell > runqy.ps1
    ```
