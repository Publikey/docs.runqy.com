---
title: "Server configuration"
description: "Every environment variable and every runqy serve flag of the runqy server, with defaults and precedence."
---

# Server configuration

The runqy server is configured with environment variables and `runqy serve` flags. This page
lists all of them. Queue definitions are a separate file format, described in
[Queue configuration](queue-config.md).

## Precedence

For each setting, the first source that provides a value wins:

1. A command-line flag.
2. A dotenv file: `../.env.secret` (relative to the working directory). If that file cannot be
   read, `.env` in the working directory is tried instead. Only one of the two is loaded.
3. An exported environment variable.
4. The built-in default.

!!! warning "A dotenv file overrides exported variables"
    Values in `.env.secret` (or `.env`) replace variables that are already set in the
    environment. If a variable you exported seems to be ignored, look for a dotenv file next to
    where the server starts. Container deployments that only set environment variables are not
    affected, as long as no such file is in the image.

## What the server needs to start

The server exits at startup only when:

- the database connection fails (PostgreSQL by default, or the SQLite file with `--sqlite`),
- a `RUNQY_DEFAULT_*` variable is malformed or negative,
- `CONFIG_REPO_URL` is set and the repository cannot be cloned,
- `--watch-interval` is passed with a value of 0 or less.

Everything else has a default or degrades:

- Without `RUNQY_API_KEY` the server starts, logs a warning, and rejects every authenticated
  request. Set it in any real deployment.
- Redis is not checked at startup. If it is unreachable, `GET /healthz` answers `503` and API
  calls fail.
- If the queue config directory does not exist or a file in it is invalid, the error is logged
  and the server starts with the queue configs already stored in the database.

## Environment variables

The **Flag** column gives the `runqy serve` flag that sets the same value, when there is one.

### HTTP

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `PORT` | `3000` | `--port` | HTTP port. The server listens on all interfaces. |
| `RUNQY_MAX_BODY_SIZE` | `52428800` | - | Maximum request body size in bytes (default 50 MB). A value that is not an integer, or is 0 or less, falls back to the default. |

### Redis

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `REDIS_HOST` | `localhost` | `--redis-uri` | Redis host. |
| `REDIS_PORT` | `6379` | `--redis-uri` | Redis port. |
| `REDIS_PASSWORD` | empty | `--redis-uri` | Redis password. |
| `REDIS_TLS` | `false` | `--redis-tls` | Set to `true` to connect with TLS (TLS 1.2 minimum). Any other value means no TLS. |

The server uses Redis database 0. Workers receive this address, password and TLS setting when
they register, so the host must be reachable from the workers under the same name.

### Database

Queue configs, vaults, autoscaling state, alert settings and dashboard accounts are stored in
PostgreSQL, or in a SQLite file when SQLite is enabled. Tables are created at startup.

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `DATABASE_HOST` | `localhost` | `--db-host` | PostgreSQL host. |
| `DATABASE_PORT` | `5432` | `--db-port` | PostgreSQL port. |
| `DATABASE_USER` | `postgres` | `--db-user` | PostgreSQL user. |
| `DATABASE_PASSWORD` | empty | `--db-password` | PostgreSQL password. |
| `DATABASE_DBNAME` | `sdxl_queuing_dev` | `--db-name` | PostgreSQL database name. The default is a historical leftover: always set this. |
| `DATABASE_SSL` | `disable` | `--db-ssl` | PostgreSQL `sslmode` (`disable`, `require`, `verify-full`, ...). |
| `RUNQY_USE_SQLITE` | `false` | `--sqlite` | Set to `true` (case-insensitive) to use SQLite instead of PostgreSQL. Meant for trials and development. |
| `SQLITE_DB_PATH` | `runqy.db` | `--sqlite-path` | SQLite database file, relative to the working directory. |

### Authentication and keys

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `RUNQY_API_KEY` | empty | `--api-key`, `-k` | Admin API key: accepted on every authenticated endpoint. |
| `RUNQY_WORKER_API_KEY` | empty | - | Key limited to worker registration (`POST /worker/register`). Required by autoscaling with a real provider, see below. |
| `RUNQY_CLIENT_API_KEY` | empty | - | Key limited to enqueueing (`POST /queue/add`, `POST /queue/add-batch`). |
| `RUNQY_VAULT_MASTER_KEY` | empty | - | Base64-encoded 32-byte key that encrypts vault entries. Vaults are disabled when it is unset, and also when it is set but invalid (an error is logged). Generate one with `openssl rand -base64 32`. |
| `RUNQY_JWT_SECRET` | random | - | Secret that signs dashboard sessions. When unset, a random secret is generated at each start, so dashboard users are signed out on restart and sessions are not shared between server replicas. |

See [Security](../operate/security.md) for which endpoints each key opens and
[Vaults](../guides/vaults.md) for the vault feature.

### Queue config loading

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `QUEUE_WORKERS_DIR` | `../queueworkers` | `--config` | Directory whose `*.yaml` and `*.yml` files are loaded at startup, relative to the working directory. Not searched recursively. |
| `CONFIG_REPO_URL` | empty | `--config-repo` | Git repository (HTTPS) to clone queue configs from. When set, the clone replaces `QUEUE_WORKERS_DIR`. |
| `CONFIG_REPO_BRANCH` | `main` | `--config-branch` | Branch to clone. |
| `CONFIG_REPO_PATH` | `deployment` | `--config-path` | Directory inside the repository that holds the YAML files. |
| `CONFIG_CLONE_DIR` | `downloads` | `--clone-dir` | Local directory the repository is cloned into (a temporary sub-directory is created, and removed at shutdown). |
| `GITHUB_PAT` | empty | - | Personal access token used for the clone. Without it only public repositories work. |
| `CONFIG_WATCH_INTERVAL` | `60` | `--watch-interval` | Seconds between two pulls of the config repository. Only used with `--watch`. |

!!! note
    The `ghcr.io/publikey/runqy` image does not set `QUEUE_WORKERS_DIR`. To load YAML files in a
    container, mount them and pass `--config <dir>` or set `QUEUE_WORKERS_DIR`.

Watching for changes has no environment variable: pass `--watch`.

### Task lifecycle defaults

Server-wide defaults for the five task limits. A queue overrides them in its `limits` block
(see [Queue configuration](queue-config.md#limits)); behaviour is explained in
[Task lifecycle](../guides/task-lifecycle.md). Durations are Go duration strings such as `90s`,
`30m`, `24h`. An invalid or negative value stops the server at startup.

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `RUNQY_DEFAULT_MAX_RETRY` | `3` | - | Retries before a failed task is archived. `0` means no retry. |
| `RUNQY_DEFAULT_TTL_COMPLETED` | `24h` | - | How long a completed task is kept. `0` means no expiry. |
| `RUNQY_DEFAULT_TTL_ARCHIVED` | `72h` | - | How long an archived (failed) task is kept. `0` means no expiry. |
| `RUNQY_DEFAULT_PENDING_TIMEOUT` | `0` | - | Maximum time a task may wait before it is archived without running. `0` disables it. |
| `RUNQY_DEFAULT_ACTIVE_TIMEOUT` | `0` | - | Maximum execution time of one attempt. `0` disables it. |

### Autoscaling and alerting

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `RUNQY_PUBLIC_URL` | empty | - | URL that remote machines use to reach this server, for example `https://runqy.example.com`. Required to provision instances with a real autoscaling provider (`runpod`, `vastai`); also used for dashboard links in alert emails. |
| `RUNQY_SMTP_PASSWORD` | empty | - | SMTP password used for alert emails when the alert settings leave `smtp.password` empty. |
| `RUNQY_SENDGRID_API_KEY` | empty | - | SendGrid API key used for alert emails when the alert settings leave `sendgrid.api_key` empty. |

With a real autoscaling provider, the server refuses to provision unless both `RUNQY_PUBLIC_URL`
and `RUNQY_WORKER_API_KEY` are set: the admin key is never sent to a rented machine. See
[GPU autoscaling](../guides/autoscaling.md) and [Email alerts](../guides/alerting.md).

### Dashboard

| Variable | Default | Flag | Description |
|----------|---------|------|-------------|
| `ASYNQ_READ_ONLY` | `false` | - | Set to `true` to make the dashboard read-only: its API then accepts only `GET` requests. |
| `PROMETHEUS_ADDRESS` | empty | - | Legacy. Address of a Prometheus server for an older metrics view; the current dashboard does not use it. Scrape `/metrics` instead, see [Monitoring](../guides/monitoring.md). |

The dashboard itself is turned off with `--no-ui`.

## `runqy serve` flags

```bash
runqy serve [flags]
```

Running `runqy` with no command also starts the server, but accepts only the global flags.

| Flag | Default | Description |
|------|---------|-------------|
| `--config <dir>` | `QUEUE_WORKERS_DIR` | Directory of queue config YAML files. |
| `--watch` | off | Reload queue configs when they change: file changes in the config directory, or new commits when a config repository is used. |
| `--config-repo <url>` | `CONFIG_REPO_URL` | Git repository to clone queue configs from. |
| `--config-branch <branch>` | `CONFIG_REPO_BRANCH` | Branch of the config repository. |
| `--config-path <path>` | `CONFIG_REPO_PATH` | Directory inside the config repository. |
| `--clone-dir <dir>` | `CONFIG_CLONE_DIR` | Directory the config repository is cloned into. |
| `--watch-interval <seconds>` | `CONFIG_WATCH_INTERVAL` | Seconds between two pulls of the config repository. Must be positive. |
| `--sqlite` | off | Use SQLite instead of PostgreSQL. |
| `--sqlite-path <file>` | `SQLITE_DB_PATH` | SQLite database file. |
| `--no-ui` | off | Do not serve the dashboard at `/monitoring`. The API stays available. |
| `--debug` | off | Verbose logs: HTTP request log and detailed startup messages. |
| `--port <port>` | `PORT` | HTTP port. |
| `--db-host <host>` | `DATABASE_HOST` | PostgreSQL host. |
| `--db-port <port>` | `DATABASE_PORT` | PostgreSQL port. |
| `--db-user <user>` | `DATABASE_USER` | PostgreSQL user. |
| `--db-password <password>` | `DATABASE_PASSWORD` | PostgreSQL password. |
| `--db-name <name>` | `DATABASE_DBNAME` | PostgreSQL database name. |
| `--db-ssl <mode>` | `DATABASE_SSL` | PostgreSQL `sslmode`. |
| `--redis-tls` | `REDIS_TLS` | Connect to Redis with TLS. `--redis-tls=false` forces it off. |

### Global flags

These flags belong to the `runqy` command and work with `serve` too.

| Flag | Default | Description |
|------|---------|-------------|
| `--redis-uri <uri>` | - | Redis connection as one URI: `redis://[:password@]host[:port]`, or `rediss://` for TLS. The host, port and password present in the URI replace `REDIS_HOST`, `REDIS_PORT` and `REDIS_PASSWORD`; the scheme sets TLS on or off unless `--redis-tls` is also passed. An invalid URI prints a warning and is ignored. |
| `--api-key <key>`, `-k` | `RUNQY_API_KEY` | Admin API key. |

The other global flag, `--server`, makes the CLI talk to a remote server and does not configure
`serve`. See the [CLI reference](cli.md).

## Example

A dotenv file for a server with PostgreSQL, vaults and role-scoped keys:

```bash
PORT=3000

REDIS_HOST=redis.internal
REDIS_PORT=6379
REDIS_PASSWORD=change-me

DATABASE_HOST=postgres.internal
DATABASE_USER=runqy
DATABASE_PASSWORD=change-me
DATABASE_DBNAME=runqy

RUNQY_API_KEY=dev-api-key
RUNQY_WORKER_API_KEY=dev-worker-key
RUNQY_CLIENT_API_KEY=dev-client-key
RUNQY_VAULT_MASTER_KEY=<output of: openssl rand -base64 32>
RUNQY_JWT_SECRET=<a long random string>

QUEUE_WORKERS_DIR=/etc/runqy/queues
```
