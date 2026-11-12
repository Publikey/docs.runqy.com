---
title: "Queue configuration"
description: "The YAML schema of a runqy queue config: priorities, sub-queues, deployment, limits, payload schemas, autoscaling and alerts."
---

# Queue configuration

A queue config tells the runqy server what a queue is called, how its sub-queues are
prioritised, and which code a worker must deploy to serve it. This page lists every key of the
YAML format. For what queues, sub-queues and priorities mean, see
[Queues, sub-queues, priorities](../concepts/queues.md).

## File structure

A file holds a `queues` map, keyed by parent queue name, and optionally one global `alerts`
block.

```yaml
queues:
  <name>:
    priority: 5          # or sub_queues
    deployment:
      git_url: "..."
      branch: "..."
      startup_cmd: "..."

alerts:                  # optional, global alert settings
  enabled: true
```

The queue name must not contain a dot: the dot separates a parent queue from its sub-queue
(`inference.high`).

## Queue keys

Keys under `queues.<name>`:

| Option | Default | Description |
|--------|---------|-------------|
| `priority` | - | Priority of the queue when it has no `sub_queues`. A non-zero integer; higher is served first. The server then creates one sub-queue, `<name>.default`. Required unless `sub_queues` is set. |
| `sub_queues` | - | List of sub-queues, each with `name` and `priority`. Creates `<name>.<sub-queue>` for each entry and no `.default`. When set, `priority` at the queue level is not used. |
| `strict_priority` | `false` | `true` makes workers serve sub-queues in strict descending priority. By default the order is weighted by priority. |
| `deployment` | - | Required. What the worker deploys and runs, see [Deployment](#deployment). |
| `limits` | - | Alias of `deployment.limits`, see [Limits](#limits). |
| `input` | - | Payload schema checked when a task is enqueued, see [Payload schema](#payload-schema). |
| `output` | - | Description of the result fields, same format as `input`. |
| `autoscale` | - | GPU autoscaling for this queue, see [Autoscale](#autoscale). |
| `alerts` | - | Alert overrides for this queue, see [Queue alerts](#queue-alerts). |

### Sub-queues

| Option | Default | Description |
|--------|---------|-------------|
| `name` | - | Required. Short name, without a dot (`high`, not `inference.high`). |
| `priority` | - | Required. A non-zero integer; higher is served first. |

All sub-queues of a parent queue share the same deployment and the same task process.

## Deployment

Keys under `queues.<name>.deployment`:

| Option | Default | Description |
|--------|---------|-------------|
| `git_url` | - | Required. Repository the worker clones. |
| `branch` | - | Required. Branch to check out. |
| `code_path` | repository root | Directory inside the repository that holds the task code. When set, the worker fetches only that directory (sparse checkout). |
| `startup_cmd` | - | Required. Command that starts the task process, run from the code directory inside the virtualenv, for example `python main.py`. |
| `mode` | `long_running` | `long_running`: one task process stays alive and handles every task. `one_shot`: a new process is started for each task. The loader does not check this value; a worker treats anything other than `one_shot` as `long_running`. |
| `startup_timeout_secs` | `60` | Seconds the worker waits for the task process to print its ready signal. Raise it when loading a model takes longer. `0` or a negative value means the default. |
| `redis_storage` | `false` | `true` stores each task's result in Redis so it can be read back with `GET /queue/<task-id>`. See [Getting results](../guides/result-delivery.md). |
| `vaults` | - | List of vault names. Their entries are sent to the worker at registration and set as environment variables of the task process. Registration fails if vaults are not enabled on the server or a vault does not exist. See [Vaults](../guides/vaults.md). |
| `git_token` | - | Token for cloning a private repository, as a vault reference: `vault://<vault>/<key>`. A literal token is not accepted. If the reference cannot be resolved, a warning is logged on the server and the worker clones without it. |
| `limits` | - | Task lifecycle overrides, see [Limits](#limits). |
| `env_vars` | - | Not supported. An empty map is accepted; any entry is rejected. Use `vaults` to give environment variables to the task process. |

The two modes and the bootstrap sequence are explained in
[Workers](../concepts/workers.md).

## Limits

Per-queue overrides of the five task limits. A key that is left out uses the server default
(`RUNQY_DEFAULT_*`, see [Server configuration](server-config.md#task-lifecycle-defaults)).
Sub-queues inherit the limits of their parent queue. Behaviour is described in
[Task lifecycle](../guides/task-lifecycle.md).

| Option | Default | Description |
|--------|---------|-------------|
| `max_retry` | `3` | Retries before a failed task is archived. `0` means no retry. |
| `ttl_completed` | `24h` | How long a completed task is kept. `"0"` means no expiry. |
| `ttl_archived` | `72h` | How long an archived (failed) task is kept. `"0"` means no expiry. |
| `pending_timeout` | `0` (disabled) | Maximum time a task may wait before it is archived without running. |
| `active_timeout` | `0` (disabled) | Maximum execution time of one attempt. A timeout counts as a failure that can be retried. |

Durations are Go duration strings: `"90s"`, `"5m"`, `"24h"`.

The block can be written in two places, with the same effect:

```yaml
queues:
  inference:
    priority: 5
    limits:                 # at the queue level
      active_timeout: "30s"
    deployment:
      git_url: "https://github.com/Publikey/runqy.git"
      branch: "main"
      startup_cmd: "python main.py"
      # limits:             # or under deployment, not both
      #   active_timeout: "30s"
```

Setting `limits` in both places for the same queue is an error.

## Payload schema

`input` and `output` are lists of fields. When a queue has an `input` schema, the server checks
each enqueued payload against it. See [Payload schemas](../guides/payload-schemas.md) for how
validation behaves.

| Option | Default | Description |
|--------|---------|-------------|
| `name` | - | Field name in the payload. |
| `type` | - | List of accepted types: `string`, `int`, `float`, `bool`, `array`, `object`. |
| `required` | `true` | `false` makes the field optional. |
| `default` | - | Value added to the payload when an optional field is missing. |
| `description` | - | Free text. |

## Autoscale

Keys under `queues.<name>.autoscale`. Triggers, provider setup and safety rules are explained in
[GPU autoscaling](../guides/autoscaling.md).

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Turns autoscaling on for this queue. When `false`, the rest of the block is not validated. |
| `provider` | - | Name of a registered provider. Required when enabled. |
| `min_workers` | `0` | Instances always kept. |
| `max_workers` | - | Upper bound. Required when enabled, at least 1 and not below `min_workers`. |
| `poll_interval` | `30s` | How often the queue is evaluated. |
| `boot_timeout` | `20m` | An instance without a ready worker after this long is destroyed. |
| `max_boot_failures` | `5` | Failed boots in a row before provisioning is suspended for the queue. |
| `scale_up` | - | List of triggers, see below. |
| `scale_down` | - | List of triggers, see below. |
| `instance` | - | What to rent, see below. |

Each entry of `scale_up` and `scale_down` has a `trigger` and the fields that trigger uses:

| Trigger | Allowed in | Fields |
|---------|------------|--------|
| `no_workers` | `scale_up` | `sub_queues` (optional) |
| `queue_depth` | `scale_up` | `threshold` (required, positive), `sub_queues` (optional) |
| `latency` | `scale_up` | `max_latency` (required, duration), `sub_queues` (optional) |
| `schedule` | `scale_up` | `cron` (required, 5 fields), `workers` (required, positive), `duration` (optional) |
| `idle` | `scale_down` | `timeout` (required, duration) |
| `schedule` | `scale_down` | `cron` (required, 5 fields) |

`sub_queues` takes short names (`[high]`) and must name sub-queues of this queue.

Keys under `autoscale.instance`:

| Option | Default | Description |
|--------|---------|-------------|
| `gpu` | - | GPU model to rent. |
| `image` | - | Docker image started on the instance. |
| `disk_gb` | - | Disk size in GB. |
| `max_price_per_hour` | - | Price ceiling per hour. |
| `min_ram_gb` | provider default | Minimum system RAM in GB (not GPU memory). |
| `min_vcpu` | provider default | Minimum number of vCPUs. |
| `min_download_mbps` | provider setting | Minimum download speed of the host. Vast.ai only. |

## Queue alerts

Keys under `queues.<name>.alerts`. They change how the global alert rules apply to this queue;
see [Email alerts](../guides/alerting.md).

| Option | Default | Description |
|--------|---------|-------------|
| `disabled` | `false` | `true` mutes every alert for this queue. |
| `rules` | - | List of rules. A rule replaces the global rule of the same `type`; a type may appear once. |

Keys of a rule (also used by the global `alerts.rules`):

| Option | Default | Description |
|--------|---------|-------------|
| `type` | - | Required. `no_workers`, `latency`, `pending`, `worker_unhealthy` or `autoscale_failure`. |
| `for` | `0` (`1m` for `worker_unhealthy`) | How long the condition must hold before the alert fires. |
| `resolve_after` | `5m` | How long the condition must stay clear before the alert is resolved. `"0"` resolves at once. |
| `max_latency` | - | `latency` only, required: age of the oldest pending task that triggers the alert. |
| `threshold` | - | `pending` only, required: number of pending tasks above which the alert fires. |
| `when_idle` | `false` | `no_workers` only: also fire when no task is pending. |
| `disabled` | `false` | Turns this rule type off (in a queue override: for this queue). |

## Global alerts block

The top-level `alerts` block holds the email delivery settings and the default rules for every
queue. It may appear in only one of the loaded files; a file may contain only this block. It is
applied when the server starts and on each reload, and replaces the settings saved from the
dashboard. Delivery, secrets and rule behaviour are explained in
[Email alerts](../guides/alerting.md).

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Turns alerting on. When `false`, the block may be incomplete. |
| `provider` | - | `smtp` or `sendgrid`. Required when enabled. |
| `from` | - | Sender address. Required when enabled. |
| `recipients` | - | List of addresses. At least one when enabled. |
| `smtp.host` | - | SMTP server. Required for provider `smtp`. |
| `smtp.port` | `587` (`starttls`), `465` (`tls`), `25` (`none`) | SMTP port. |
| `smtp.tls` | `starttls` | `starttls`, `tls` or `none`. |
| `smtp.username` | - | SMTP user. |
| `smtp.password` | `RUNQY_SMTP_PASSWORD` | Literal value, `vault://<vault>/<key>`, or empty to use the environment variable. |
| `sendgrid.api_key` | `RUNQY_SENDGRID_API_KEY` | Literal value, `vault://<vault>/<key>`, or empty to use the environment variable. |
| `rules` | - | Default rules for every queue, same keys as a queue rule. |
| `repeat_interval` | `4h` | How often a still-firing alert is sent again. `"0"` sends it once. |
| `send_resolved` | `true` | Send an email when an alert clears. |

## Validation

Files in the queue config directory are decoded strictly:

- An unknown key anywhere in the file is an error. A misspelled or misplaced key (for example
  `active_timeout` directly under `deployment`) is reported, not ignored.
- `deployment`, `deployment.git_url`, `deployment.branch` and `deployment.startup_cmd` are
  required, as is either `priority` or `sub_queues`.
- A malformed or negative value in `limits`, an invalid `autoscale` block (when enabled) and an
  invalid `alerts` block are errors. The message names the queue and the key.
- Empty files and files with only comments are skipped.

One invalid file makes the whole directory load fail: no file is applied, and the queue configs
already stored in the database stay as they were. At startup the error is logged and the server
keeps running.

Check a directory without loading it:

```bash
runqy config validate --dir ./queues
```

```text
Validated 1 YAML file(s) from ./queues
  - inference.high (priority=10)
  - inference.low (priority=3)

Total: 2 queue configuration(s)
Validation successful!
```

## Complete example

```yaml
queues:
  inference:
    sub_queues:
      - name: high
        priority: 10
      - name: low
        priority: 3
    strict_priority: false

    deployment:
      git_url: "https://github.com/Publikey/runqy.git"
      branch: "main"
      code_path: "examples/quickstart-longrunning"
      startup_cmd: "python main.py"
      mode: "long_running"
      startup_timeout_secs: 120
      redis_storage: true
      vaults:
        - inference-secrets
      limits:
        max_retry: 1
        ttl_completed: "1h"
        ttl_archived: "24h"
        pending_timeout: "5m"
        active_timeout: "30s"

    input:
      - name: "operation"
        type: ["string"]
      - name: "data"
        type: ["string", "int", "float"]
        required: false
        description: "Value the operation is applied to"
    output:
      - name: "result"
        type: ["string", "int", "float"]
      - name: "calls"
        type: ["int"]

    autoscale:
      enabled: true
      provider: my-mock
      min_workers: 0
      max_workers: 3
      scale_up:
        - trigger: no_workers
        - trigger: latency
          max_latency: "2m"
          sub_queues: [high]
      scale_down:
        - trigger: idle
          timeout: "5m"
      instance:
        gpu: "RTX 4090"
        image: "ghcr.io/publikey/runqy-worker:inference"
        disk_gb: 50
        max_price_per_hour: 0.60

    alerts:
      rules:
        - type: latency
          max_latency: 2m
        - type: pending
          threshold: 500
```

This file passes `runqy config validate`. To use it as is, the vault `inference-secrets` and the
autoscaling provider `my-mock` must exist on the server; remove the `vaults` and `autoscale`
blocks otherwise.

## Loading a queue config

| Method | What it does |
|--------|--------------|
| Config directory | At startup the server loads every `*.yaml` and `*.yml` file of the directory given by `--config` or `QUEUE_WORKERS_DIR` (or of a Git repository, with `--config-repo`). See [Server configuration](server-config.md#queue-config-loading). |
| `--watch` | With `runqy serve --watch`, the directory or the repository is reloaded when it changes. |
| `runqy config reload` | Loads the directory again on a running server. |
| `runqy config create -f <file>` | Sends one file to the server, without a config directory. |
| REST API | `POST /workers/queues` creates or updates a queue, `POST /workers/reload` reloads the directory. See the [REST API reference](rest-api.md). |
| Dashboard | Queue configs can be created and edited from the dashboard at `/monitoring`. |

Command syntax is in the [CLI reference](cli.md).

Queue configs are stored in the server's database. Loading a file creates or updates the queues
it defines; removing a queue from a file does not delete it from the database (use
`runqy config remove <name>`). A change to a queue config applies to workers that register after
it, and limits apply to tasks enqueued after it.

!!! warning "`runqy config create -f` is not strict"
    `runqy config create -f` reads the same format but does not decode it strictly: unknown keys
    are ignored without an error. It applies `priority`, `sub_queues`, `strict_priority`,
    `deployment` (including `deployment.limits`), `autoscale` and the queue's `alerts`. It
    ignores `input`, `output`, `limits` written at the queue level, and the global `alerts`
    block. Run `runqy config validate` on the file first, and load schemas through the config
    directory.
