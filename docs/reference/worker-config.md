---
title: "Worker configuration"
description: "Every setting of the runqy worker: config.yml keys, environment variables, defaults and command-line flags."
---

# Worker configuration

The runqy worker needs three things to start: the server URL, an API key and the queues to
serve. Everything else (Redis credentials, the code to deploy, the startup command) comes from
the runqy server when the worker registers. This page lists every worker setting and its
default.

## Two ways to configure

The worker reads its settings from **one** source:

- a YAML file, `config.yml` in the working directory, or the path given with `-config`;
- environment variables (`RUNQY_*`), used **only when that file does not exist**.

!!! warning "Environment variables do not override config.yml"
    If the config file exists, `RUNQY_*` variables are not read as settings. They only take
    effect where the file references them with `${VAR}`.

    This matters for Docker images. The autoscaler starts instances with `RUNQY_SERVER_URL`,
    `RUNQY_API_KEY`, `RUNQY_QUEUES` and `RUNQY_INSTANCE_ID` set as environment variables. An
    image that ships a `config.yml` next to the worker binary ignores them. Either do not put a
    `config.yml` in the image, or reference the variables in it:

    ```yaml
    server:
      url: "${RUNQY_SERVER_URL}"
      api_key: "${RUNQY_API_KEY}"
    worker:
      queues:
        - "${RUNQY_QUEUES}"
      instance_id: "${RUNQY_INSTANCE_ID}"
    ```

    The autoscaler sets `RUNQY_QUEUES` to one parent queue name, so it fits a single list entry.

    The `ghcr.io/publikey/runqy-worker` images contain no `config.yml`.

Two details: `RUNQY_UPDATE_BASE_URL` is always read from the environment, with or without a
config file. The lease variables `RUNQY_LEASE_DURATION` and `RUNQY_LEASE_EXTEND_INTERVAL` have
no `config.yml` key, so they can only be changed when there is no config file.

### Variable expansion in config.yml

Before the file is parsed, these patterns are replaced in its text:

| Pattern | Replaced by |
|---------|-------------|
| `${VAR}` | The value of `VAR`, or an empty string if it is unset. |
| `${VAR:-default}` | The value of `VAR`, or `default` if it is unset or empty. |

`$VAR` without braces is not expanded. The replacement applies to the whole file, comments
included.

## Minimal configuration

With a `config.yml`:

```yaml
server:
  url: "http://localhost:3000"
  api_key: "dev-api-key"
worker:
  queues:
    - "inference"
```

With environment variables, in a directory that has no `config.yml`:

```bash
export RUNQY_SERVER_URL="http://localhost:3000"
export RUNQY_API_KEY="dev-api-key"
export RUNQY_QUEUES="inference"
runqy-worker
```

## Settings

Each setting is shown with its `config.yml` key and the environment variable used when there is
no config file. Durations are Go duration strings: `30s`, `5m`, `24h`.

### Server and queues

| Variable | config.yml key | Default | Description |
|----------|----------------|---------|-------------|
| `RUNQY_SERVER_URL` | `server.url` | - | Required. URL of the runqy server. |
| `RUNQY_API_KEY` | `server.api_key` | - | Required. The server's worker key (`RUNQY_WORKER_API_KEY`) or admin key (`RUNQY_API_KEY`). |
| `RUNQY_QUEUES` | `worker.queues` | - | Required. Queues to serve: a YAML list in the file, a comma-separated list in the variable. A parent queue name (`inference`) serves all its sub-queues; a full name (`inference.high`) serves only that sub-queue. |
| - | `worker.queue` | - | Deprecated: a single queue name. Used only when `worker.queues` is empty. There is no `RUNQY_QUEUE` variable. |
| `RUNQY_CONCURRENCY` | `worker.concurrency` | `1` | Number of tasks processed in parallel. |
| `RUNQY_SHUTDOWN_TIMEOUT` | `worker.shutdown_timeout` | `8s` | How long a stopping worker waits for running tasks to finish. |

Which sub-queues a worker serves, and in what order, is explained in
[Queues, sub-queues, priorities](../concepts/queues.md).

### Bootstrap and deployment

| Variable | config.yml key | Default | Description |
|----------|----------------|---------|-------------|
| `RUNQY_BOOTSTRAP_RETRIES` | `bootstrap.retries` | `3` | Attempts to contact the server at startup. |
| `RUNQY_BOOTSTRAP_RETRY_DELAY` | `bootstrap.retry_delay` | `5s` | Delay between two attempts. |
| `RUNQY_DEPLOYMENT_DIR` | `deployment.dir` | `./deployment` | Directory where the task code is cloned and the virtualenv is created. It is reused across restarts. |
| `RUNQY_USE_SYSTEM_SITE_PACKAGES` | `deployment.use_system_site_packages` | `true` | Whether the virtualenv sees the packages of the base Python (for example a PyTorch already installed in the image). Set to `false` for an isolated virtualenv. |
| `RUNQY_GIT_SSH_KEY` | `git.ssh_key` | - | Path to an SSH private key used to clone the task repository. |
| `RUNQY_GIT_TOKEN` | `git.token` | - | Personal access token used to clone the task repository over HTTPS. |

A queue can also provide a clone token from a vault (`deployment.git_token`, see
[Queue configuration](queue-config.md#deployment)).

### Autoscaling

| Variable | config.yml key | Default | Description |
|----------|----------------|---------|-------------|
| `RUNQY_INSTANCE_ID` | `worker.instance_id` | - | Id that links this worker to the cloud instance the autoscaler created. Set by the autoscaler; leave it empty on machines you start yourself. |
| `RUNQY_PROTECTED` | `worker.protected` | `false` | The worker declares itself protected from autoscaling teardown. See [Protecting an instance](../guides/autoscaling.md#protecting-an-instance). |

### Task lifecycle fallbacks

The server stamps the lifecycle limits on each task at enqueue, and those values win. The
settings below apply only to a task that carries none, for example one written to Redis
directly. See [Task lifecycle](../guides/task-lifecycle.md).

| Variable | config.yml key | Default | Description |
|----------|----------------|---------|-------------|
| `RUNQY_TTL_COMPLETED` | `worker.ttl_completed` | `24h` | How long a completed task is kept. `0` means no expiry. |
| `RUNQY_COMPLETED_TASK_TTL` | `worker.completed_task_ttl` | - | Deprecated alias of the line above, used only when it is not set. |
| `RUNQY_TTL_ARCHIVED` | `worker.ttl_archived` | `72h` | How long an archived (failed) task is kept. `0` means no expiry. |
| `RUNQY_PENDING_TIMEOUT` | `worker.pending_timeout` | `0` | Maximum time a task may wait before it is archived without running. `0` disables it. |
| `RUNQY_ACTIVE_TIMEOUT` | `worker.active_timeout` | `0` | Maximum execution time of one attempt. `0` disables it. |
| `RUNQY_MAX_RETRY` | `retry.max_retry` | `25` | Accepted, but has no effect on tasks: the number of retries is carried by each task (`max_retry`, set by the server from the queue's limits). |

### Crash recovery

What the worker does when the task process exits unexpectedly. The mechanism is explained in
[Workers](../concepts/workers.md).

| Variable | config.yml key | Default | Description |
|----------|----------------|---------|-------------|
| `RUNQY_RECOVERY_ENABLED` | `recovery.enabled` | `true` | Restart a crashed task process automatically. |
| `RUNQY_RECOVERY_MAX_RESTARTS` | `recovery.max_restarts` | `5` | Consecutive restarts before the worker is marked degraded. |
| `RUNQY_RECOVERY_INITIAL_DELAY` | `recovery.initial_delay` | `1s` | Delay before the first restart. |
| `RUNQY_RECOVERY_MAX_DELAY` | `recovery.max_delay` | `5m` | Upper bound of the delay between restarts. |
| - | `recovery.backoff_factor` | `2.0` | Multiplier applied to the delay after each failed restart. No environment variable. |
| `RUNQY_RECOVERY_COOLDOWN` | `recovery.cooldown_period` | `10m` | Time the process must run without crashing for the restart counter to reset. |
| `RUNQY_RECOVERY_DEGRADED_RETRY` | `recovery.degraded_retry` | `10m` | How often a degraded worker tries to start the process again. `0` means never: restart the worker by hand. |

### Leases and updates

| Variable | config.yml key | Default | Description |
|----------|----------------|---------|-------------|
| `RUNQY_LEASE_DURATION` | - | `2m` | How long a worker's claim on a running task is valid without renewal. If the worker dies, the task is recovered after this delay. |
| `RUNQY_LEASE_EXTEND_INTERVAL` | - | `1m` | How often the claim on running tasks is renewed. Keep it well below the lease duration. |
| `RUNQY_UPDATE_BASE_URL` | - | `https://github.com/Publikey/runqy-worker/releases/download` | Where the `worker_update` control command downloads releases from. See [Worker control](../guides/worker-control.md). |

## Complete config.yml

Every key, with its default value where there is one:

```yaml
server:
  url: "http://localhost:3000"
  api_key: "dev-api-key"

worker:
  queues:
    - "inference"
  concurrency: 1
  shutdown_timeout: 8s
  instance_id: ""
  protected: false
  ttl_completed: 24h
  ttl_archived: 72h
  pending_timeout: "0"
  active_timeout: "0"

bootstrap:
  retries: 3
  retry_delay: 5s

git:
  ssh_key: ""
  token: ""

deployment:
  dir: "./deployment"
  use_system_site_packages: true

recovery:
  enabled: true
  max_restarts: 5
  initial_delay: 1s
  max_delay: 5m
  backoff_factor: 2.0
  cooldown_period: 10m
  degraded_retry: 10m
```

## Invalid values

The worker refuses to start (`Failed to load config` or `Configuration error`) when:

- the config file exists but cannot be read or is not valid YAML;
- the server URL, the API key or the queue list is missing or empty;
- a task lifecycle fallback (`ttl_completed`, `completed_task_ttl`, `ttl_archived`,
  `pending_timeout`, `active_timeout`, or their variables) is not a valid duration or is
  negative;
- `shutdown_timeout`, `bootstrap.retry_delay`, `recovery.initial_delay`, `recovery.max_delay` or
  `recovery.cooldown_period` is a negative duration.

Other invalid values are ignored without a message, and the default applies:

- a duration that cannot be parsed in `shutdown_timeout`, `bootstrap.retry_delay`, the
  `recovery.*` delays or the lease variables (for example `30`, without a unit);
- zero or a negative number for `concurrency`, `bootstrap.retries`, `recovery.max_restarts`,
  `recovery.backoff_factor` or `retry.max_retry` (and, in an environment variable, a value that
  is not a number);
- a negative `recovery.degraded_retry`;
- unknown keys in `config.yml`. A misspelled key is not reported.

Boolean variables (`RUNQY_PROTECTED`, `RUNQY_RECOVERY_ENABLED`,
`RUNQY_USE_SYSTEM_SITE_PACKAGES`) are true for `true` (any case) or `1`, and false for any other
non-empty value.

Use `-validate` to check the settings the worker refuses to start with:

```bash
runqy-worker -validate
```

```text
Configuration is valid
```

## Command-line flags

| Flag | Default | Description |
|------|---------|-------------|
| `-config <path>` | `config.yml` | Path to the config file. If the file does not exist, the worker falls back to environment variables. |
| `-validate` | - | Load and check the configuration, print `Configuration is valid`, and exit. Does not contact the server. |
| `-version` | - | Print the version, commit and build date, and exit. |
