---
title: "CLI reference"
description: "Every command and flag of the runqy command-line tool, in local and remote mode."
---

# CLI reference

The `runqy` binary is both the server (`runqy serve`) and its administration tool. This page lists every command with its flags. Output shown here is taken from the command's own format strings.

## How the CLI reaches the server

Every command except `serve` runs in one of two modes.

| Mode | Selected when | What it does | Needs |
|------|---------------|--------------|-------|
| Remote | A server URL is known: `--server`, `RUNQY_SERVER`, or a profile saved by `runqy login` | Calls the server's [REST API](rest-api.md) | Network access to the server and its admin API key |
| Local | No server URL is known | Reads and writes Redis and the database directly | The same environment variables as the server (`REDIS_*`, `DATABASE_*`, `RUNQY_VAULT_MASTER_KEY`); see [Server configuration](server-config.md) |

In local mode the CLI prints `Warning: No server configured. Using local database. Run 'runqy login' for remote mode.` on stderr.

The server URL and the API key are resolved separately, first match wins:

| Setting | Order |
|---------|-------|
| Server URL | `--server` / `-s`, then `RUNQY_SERVER`, then the active saved profile |
| API key | `--api-key` / `-k`, then `RUNQY_API_KEY`, then the active saved profile |

!!! warning
    At startup the CLI loads `../.env.secret` (relative to the current directory) or, if that file does not exist, `.env` in the current directory. Values in these files replace variables already set in your shell. If such a file sets `RUNQY_API_KEY`, that key is sent to the saved server instead of the profile's key, which usually ends in `401`. Run the CLI from another directory, or pass `-k`.

!!! note
    In local mode, `queue list`, `task enqueue` and `config list`, `reload`, `create` and `remove` always connect to PostgreSQL, even when `RUNQY_USE_SQLITE=true`. With a server that runs on SQLite, use remote mode for these commands.

### Global flags

| Flag | Default | Description |
|------|---------|-------------|
| `-s`, `--server` | none | Server URL; switches to remote mode |
| `-k`, `--api-key` | `RUNQY_API_KEY` | API key |
| `--redis-uri` | none | Redis URI for local mode and `serve`, such as `redis://:password@host:6379`. `rediss://` enables TLS. Replaces `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| `-v`, `--version` | | Print the version |
| `-h`, `--help` | | Help for any command |

```bash
runqy -s https://runqy.example.com -k dev-api-key queue list
```

## serve

```text
runqy serve [flags]
```

Starts the HTTP server: REST API, worker registration, dashboard, autoscaler and alert evaluator. Running `runqy` with no command does the same. Each flag overrides an environment variable described in [Server configuration](server-config.md).

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `PORT`, else `3000` | HTTP port |
| `--config` | `QUEUE_WORKERS_DIR`, else `../queueworkers` | Directory of queue config YAML files |
| `--watch` | off | Reload queue configs when the files change (or when the config repository changes, with `--config-repo`) |
| `--config-repo` | `CONFIG_REPO_URL` | Git repository to load queue configs from, instead of a local directory |
| `--config-branch` | `CONFIG_REPO_BRANCH`, else `main` | Branch of the config repository |
| `--config-path` | `CONFIG_REPO_PATH`, else `deployment` | Directory of the YAML files inside the repository |
| `--clone-dir` | `CONFIG_CLONE_DIR`, else `downloads` | Where the config repository is cloned |
| `--watch-interval` | `CONFIG_WATCH_INTERVAL`, else `60` | Seconds between pulls of the config repository. Must be positive |
| `--sqlite` | off | Use SQLite instead of PostgreSQL. For tests, not for production |
| `--sqlite-path` | `SQLITE_DB_PATH`, else `runqy.db` | SQLite database file |
| `--db-host` | `DATABASE_HOST`, else `localhost` | PostgreSQL host |
| `--db-port` | `DATABASE_PORT`, else `5432` | PostgreSQL port |
| `--db-user` | `DATABASE_USER`, else `postgres` | PostgreSQL user |
| `--db-password` | `DATABASE_PASSWORD` | PostgreSQL password |
| `--db-name` | `DATABASE_DBNAME`, else `sdxl_queuing_dev` | PostgreSQL database |
| `--db-ssl` | `DATABASE_SSL`, else `disable` | PostgreSQL SSL mode |
| `--redis-tls` | `REDIS_TLS` | Use TLS for Redis |
| `--no-ui` | off | Do not serve the dashboard at `/monitoring` |
| `--debug` | off | Verbose startup logs and HTTP request logs |

```bash
runqy serve --sqlite --config ./deployment --watch
```

## login, auth, logout

Saved profiles live in `~/.runqy/credentials.json` (file mode `0600`). One profile is active at a time.

### login

```text
runqy login --server <url> [flags]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-s`, `--server` | required | Server URL |
| `-k`, `--api-key` | `RUNQY_API_KEY`, else prompt | API key to save |
| `-n`, `--name` | `default` | Profile name |
| `--no-switch` | off | Save the profile without making it active |

`login` saves the profile without contacting the server.

```bash
runqy login --server https://runqy.example.com --api-key dev-api-key --name production
```

```text
Logged in to https://runqy.example.com (saved as "production")
Active profile: "production"
```

### auth status

```text
runqy auth status
```

Shows the active profile, its URL and its key with the middle masked.

```text
Current server: production
URL: https://runqy.example.com
API Key: dev-...-key
```

### auth list

```text
runqy auth list
```

Lists the saved profiles in columns `NAME`, `URL`, `CURRENT`; the active one is marked `*`.

### auth switch

```text
runqy auth switch <name>
```

```bash
runqy auth switch staging
```

### logout

```text
runqy logout [flags]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-n`, `--name` | active profile | Profile to remove |
| `--all` | off | Remove every saved profile |

```bash
runqy logout --name staging
```

## queue

Queue names are full names such as `inference.high`.

### queue list

```text
runqy queue list
```

```text
QUEUE           PENDING  ACTIVE  SCHEDULED  RETRY  ARCHIVED  COMPLETED  PAUSED
inference.high  4        1       0          0      2         118        no
inference.low   0        0       0          0      0         12         no
```

### queue inspect

```text
runqy queue inspect <queue>
```

Prints the pause state, memory usage and task counts of one queue. Local mode adds the processed and failed totals and the last 7 days of history.

```bash
runqy queue inspect inference.high
```

### queue pause, queue unpause

```text
runqy queue pause <queue>
runqy queue unpause <queue>
```

Workers stop taking tasks from a paused queue; tasks can still be enqueued.

```bash
runqy queue pause inference.high
```

```text
Queue 'inference.high' paused successfully.
```

## task

### task enqueue

```text
runqy task enqueue --queue <queue> [flags]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-q`, `--queue` | required | Queue name. `inference` means `inference.default` |
| `-p`, `--payload` | `{}` | Payload as JSON |
| `-t`, `--timeout` | `0` | Maximum execution time per attempt, in seconds. `0` uses the queue's `active_timeout` |

```bash
runqy task enqueue -q inference.high -p '{"prompt":"hello"}' --timeout 60
```

```text
Task enqueued successfully!
  ID:    6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11
  Queue: inference.high
  Type:  inference.high
```

### task list

```text
runqy task list <queue> [flags]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--state` | `pending` | `pending`, `active`, `scheduled`, `retry`, `archived` or `completed` |
| `-l`, `--limit` | `10` | Maximum number of tasks shown |

The columns depend on the state: `ID TYPE PAYLOAD` for pending, `ID TYPE ERROR` for archived, `ID TYPE COMPLETED_AT` for completed.

```bash
runqy task list inference.high --state archived --limit 20
```

### task get

```text
runqy task get <queue> <task_id>
```

Prints the task's state, retry counters, timeout, payload, last error and result.

```bash
runqy task get inference.high 6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11
```

### task cancel

```text
runqy task cancel <task_id>
```

Publishes a cancellation signal and prints `Task '<task_id>' cancelled.` whether or not anything received it. The runqy worker does not listen for this signal, so a running task is not interrupted; use `--timeout` or the queue's `active_timeout` to bound execution time.

### task delete

```text
runqy task delete <queue> <task_id>
```

```bash
runqy task delete inference.high 6f1c9c0e-3a54-4c1e-9d0b-2f6d8a4d7b11
```

## worker

### worker list

```text
runqy worker list
```

```text
WORKER_ID     STATUS   VERSION  QUEUES               CONCURRENCY  LAST_BEAT  STALE
gpu-node-1:1  running  0.4.2    inference.default:1  1            3s         no
```

`QUEUES` lists each sub-queue with its priority, cut at 30 characters. `STALE` is `yes` when the last heartbeat is more than 30 seconds old. Workers older than v0.4.0 show `<0.4.0` as version.

### worker info

```text
runqy worker info <worker_id>
```

Prints the worker's status, queues, concurrency, start time, last heartbeat, version, held queues and the outcome of its last control command. Local mode also dumps every heartbeat field.

```bash
runqy worker info gpu-node-1:1
```

## config

Manages queue configs in the server's database. The YAML format is described in [Queue configuration](queue-config.md).

### config list

```text
runqy config list
```

Lists queue configs. Local mode shows `NAME PRIORITY MODE GIT_URL`; remote mode shows `NAME PRIORITY`.

### config reload

```text
runqy config reload [--dir <directory>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--dir` | `QUEUE_WORKERS_DIR` | Directory of YAML files to load. Local mode only |

In remote mode the server reloads its own config directory and `--dir` is ignored.

```bash
runqy config reload
```

```text
Reloaded 2 queue configuration(s):
  - inference.high
  - inference.low
```

### config validate

```text
runqy config validate [--dir <directory>]
```

Parses and validates the YAML files without saving anything. It needs neither Redis nor the database, and refuses to run in remote mode.

| Flag | Default | Description |
|------|---------|-------------|
| `--dir` | `QUEUE_WORKERS_DIR` | Directory of YAML files to check |

```bash
runqy config validate --dir ./deployment
```

```text
Validated 1 YAML file(s) from ./deployment
  - inference.high (priority=10)
  - inference.low (priority=1)

Total: 2 queue configuration(s)
Validation successful!
```

### config create

```text
runqy config create -f <file> [--force]
runqy config create --name <queue> --git-url <url> --startup-cmd <command> [flags]
```

Creates queue configs from a YAML file, or one queue from flags. The file is either a queue config file with a top-level `queues` map, or a single queue with top-level `name`, `priority` and `deployment`.

| Flag | Default | Description |
|------|---------|-------------|
| `-f`, `--file` | none | YAML file. The inline flags below are ignored when set |
| `--name` | none | Queue name. Required without `--file` |
| `--git-url` | none | Repository of the task code. Required without `--file` |
| `--startup-cmd` | none | Command that starts the task process. Required without `--file` |
| `--priority` | `1` | Queue priority |
| `--branch` | `main` | Git branch |
| `--code-path` | none | Directory of the code inside the repository |
| `--mode` | `long_running` | `long_running` or `one_shot` |
| `--force` | off | Update queues that already exist instead of failing |

```bash
runqy config create --name inference.high --priority 10 \
  --git-url https://github.com/example/inference-task.git \
  --startup-cmd "python main.py"
```

### config remove

```text
runqy config remove <queue>
```

Disables a queue config; the tasks in Redis are kept. A parent name (`inference`) removes the queue with all its sub-queues, a full name (`inference.low`) removes one sub-queue. The name can also be given with `--name`.

```bash
runqy config remove inference.low
```

```text
Queue 'inference.low' deleted successfully
```

## vault

Vault commands need `RUNQY_VAULT_MASTER_KEY` on the server (remote mode) or in the CLI's environment (local mode). See [Vaults](../guides/vaults.md).

| Command | Description |
|---------|-------------|
| `runqy vault list` | List vaults with their entry counts |
| `runqy vault create <name> [-d <description>]` | Create a vault |
| `runqy vault show <name>` | Show a vault and its entries, secrets masked |
| `runqy vault entries <vault>` | List entries, secrets masked |
| `runqy vault set <vault> <key> <value> [--no-secret]` | Create or replace an entry |
| `runqy vault get <vault> <key>` | Print the decrypted value. Local mode only |
| `runqy vault unset <vault> <key>` | Remove an entry |
| `runqy vault delete <name> [--force]` | Delete a vault and all its entries |

| Flag | Command | Description |
|------|---------|-------------|
| `-d`, `--description` | `create` | Vault description |
| `--no-secret` | `set` | Store the value as non-secret: it is shown in clear by `show`, `entries` and the API |
| `--force` | `delete` | Skip the confirmation prompt |

```bash
runqy vault create api-keys -d "Keys for external services"
runqy vault set api-keys OPENAI_API_KEY sk-example
```

```text
Vault 'api-keys' created successfully.
Entry 'OPENAI_API_KEY' set in vault 'api-keys'.
```

`vault get` fails in remote mode with `vault get is not supported in remote mode for security reasons`.

## autoscale

Provider commands need `RUNQY_VAULT_MASTER_KEY`, like vaults. See [GPU autoscaling](../guides/autoscaling.md).

### autoscale status

```text
runqy autoscale status [--all]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--all` | off | Also list failed and terminated instances, with the reason |

Shows the instances in columns `INSTANCE ID`, `QUEUE`, `PROVIDER`, `GPU`, `STATUS`, `WORKER`, `PROTECTED`, `PRICE/HR`, `COST`, `REASON`, then the queues whose provisioning is paused, then the total accumulated cost. With no active instance:

```text
No active autoscaler instances.

Total accumulated cost: $0.0000
```

### autoscale logs

```text
runqy autoscale logs <instance-id>
```

Prints the machine's logs: fetched live from the provider while the instance exists, otherwise the logs saved when it failed. A header line on stderr says which.

```bash
runqy autoscale logs as-1234
```

### autoscale resume

```text
runqy autoscale resume <queue>
```

Lifts the provisioning pauses of a parent queue and resets its failure counts, so the next evaluation rents a machine again.

```bash
runqy autoscale resume inference
```

```text
Provisioning resumed for queue 'inference' (1 pause(s) lifted).
```

### autoscale protect, autoscale unprotect

```text
runqy autoscale protect <instance-id>
runqy autoscale unprotect <instance-id>
```

A protected instance is never destroyed by scale-down.

```bash
runqy autoscale protect as-1234
```

```text
Instance 'as-1234' protected.
```

### autoscale provider-types

```text
runqy autoscale provider-types
```

```text
mock
runpod
vastai
```

### autoscale providers

| Command | Description |
|---------|-------------|
| `runqy autoscale providers list` | List providers: `NAME`, `TYPE`, `ENABLED` |
| `runqy autoscale providers show <name>` | Show one provider, secrets masked |
| `runqy autoscale providers create <name> --type <type> [flags]` | Create a provider |
| `runqy autoscale providers update <name> [flags]` | Change a provider. Only the flags given are changed |
| `runqy autoscale providers delete <name> [--force]` | Delete a provider |

| Flag | Command | Description |
|------|---------|-------------|
| `--type` | `create` (required), `update` | Provider type |
| `--config` | `create`, `update` | Provider settings as JSON, or `@<file>` to read them from a file. Default on create: `{}` |
| `--disabled` | `create` | Create the provider disabled |
| `--enable`, `--disable` | `update` | Enable or disable the provider. Mutually exclusive |
| `--force` | `delete` | Skip the confirmation prompt |

```bash
runqy autoscale providers create my-mock --type mock
```

```text
Provider 'my-mock' created.
```

## alerts

Alert settings are edited in a queue YAML file or on the dashboard, not with the CLI. See [Email alerts](../guides/alerting.md).

### alerts status

```text
runqy alerts status [--history <n>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--history` | `20` | Number of recent notifications to show |

Shows whether alerting is enabled, the last evaluation, the active alerts (`STATE`, `QUEUE`, `RULE`, `SINCE`, `DETAILS`) and the recent notifications.

```text
Alerting: enabled
Last evaluation: 2026-11-12T10:15:00Z

No active alerts.
```

### alerts test

```text
runqy alerts test
```

Sends a test email with the saved settings. Remote mode prints `Test email sent.`; local mode adds the recipients.

## control

```text
runqy control <action> [flags]
```

Sends a command to workers (runqy worker v0.4.0 or later). Effects and prerequisites of each action are in [Worker control](../guides/worker-control.md).

| Action | Description |
|--------|-------------|
| `drain` | Stop taking new tasks; in-flight tasks finish |
| `resume` | Take tasks again after a drain |
| `code-update` | Update the task code, reinstall dependencies and restart the task process |
| `worker-update` | Install a runqy worker release and restart in place |
| `config-reload` | Ask the task process to reload its configuration |

| Flag | Default | Description |
|------|---------|-------------|
| `-t`, `--target` | all workers | A worker id, or a queue name (every worker of that parent queue) |
| `--timeout` | `30m` for `code-update` and `worker-update` | How long to wait for in-flight tasks, such as `10m` |
| `--version` | required | `worker-update` only: release to install, such as `0.4.2` |

```bash
runqy control drain --target inference
```

```text
Sent drain to queue inference (id 9f2c4e6a8b0d1f35, 1 receiver(s)).
Check the outcome with: runqy worker info <worker_id>
```

With `0 receiver(s)`, no worker was listening: the command is lost, not queued.

## version

There is no `version` command; use the flag.

```bash
runqy --version
```

```text
runqy version 0.4.5 (commit: <commit>, built: <date>)
```
