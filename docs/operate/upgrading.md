---
title: "Upgrading and compatibility"
description: "How to upgrade the runqy server, workers and runqy-python, which versions work together, and what changed in recent releases."
---

# Upgrading and compatibility

This page explains how to upgrade each runqy component, in which order, and which versions work together. The three components are versioned and released separately.

Current releases: runqy server **v0.4.5**, runqy worker **v0.4.2**, runqy-python **0.3.1**.

## Check what you are running

```bash
runqy --version          # the CLI or server binary
runqy worker list        # VERSION column: the release each worker runs
pip show runqy-python    # in the task's environment
```

Workers older than v0.4.0 do not report their version; `runqy worker list` shows them as `<0.4.0`.

## Upgrade order

1. **Server first.** Each server release listed below keeps working with the workers of the previous releases, so the server can be upgraded alone.
2. **Then the workers.** New worker features often need the matching server release.
3. **runqy-python** whenever a feature you want needs it. It is independent of the other two except where the table below says otherwise.

## Upgrading the server

1. Read the [behaviour changes](#behaviour-changes-by-server-release) between your version and the target.
2. If you load queues from YAML files, validate them with the new binary before switching. From v0.4.0 a file with an unknown key is rejected:

    ```bash
    runqy config validate --dir <config dir>
    ```

3. Replace the server: pull the new image tag and recreate the container, or replace the binary and restart the process.

    ```bash
    docker pull ghcr.io/publikey/runqy:v0.4.5
    ```

The server creates missing tables and applies its schema changes when it starts; there is no separate migration step. Back up the database first: see [Production deployment](production.md#what-to-back-up).

While the server is down, clients cannot enqueue and new workers cannot register. Workers that are already running keep processing the tasks in Redis: they only call the server when they start and on a `code-update`.

## Upgrading workers

### In place

Workers from v0.4.0 can install another release without recreating the machine or downloading models again:

```bash
runqy control worker-update --version 0.4.2
```

Without `--target` the command goes to every worker; add `--target <queue>` or `--target <worker_id>` to upgrade a part of the fleet first. Each worker verifies the download, waits for its running tasks, replaces its binary and restarts into it. Check the result with `runqy worker list`. Details and limits (not supported on Windows) are in [Worker control](../guides/worker-control.md).

An in-place update does not change the container image. Also change the image tag in whatever starts your workers (compose file, autoscaling `instance.image`, machine template), otherwise a recreated machine starts on the old release.

### By replacing containers

Workers older than v0.4.0 do not listen for control commands and must be replaced once this way. You can also prefer it to keep containers identical to their image. To replace a worker (v0.4.0 or later) without interrupting a task:

```bash
runqy control drain --target <worker_id>
runqy worker list        # wait for the status "drained"
```

Then stop the container and start one from the new image, as in [Deploying workers](../guides/deploying-workers.md). Workers older than v0.4.0 cannot be drained: stop them while they are idle if you can.

## Upgrading runqy-python

The worker installs runqy-python from the `requirements.txt` of your task repository. Pin the version there, because pip does not upgrade a requirement that is already satisfied:

```text
runqy-python==0.3.1
```

Commit, then tell the workers to fetch the code, reinstall dependencies and restart the task process:

```bash
runqy control code-update --target <queue>
```

Upgrade the package in your client applications separately, with `pip install --upgrade runqy-python`.

## Compatibility

### Server and worker releases

From the release notes of each server version:

| runqy server | Stated worker compatibility |
|--------------|-----------------------------|
| v0.4.5 | runqy worker v0.4.2; no worker upgrade required |
| v0.4.4 | runqy worker v0.4.2; no worker upgrade required |
| v0.4.3 | runqy worker v0.4.1 |
| v0.4.2 | runqy worker v0.4.1 |
| v0.4.1 | runqy worker v0.4.0 |
| v0.4.0 | runqy worker v0.4.0 for the new features; older workers keep working but ignore `strict_priority` and control commands |
| v0.3.0 | Accepts workers older and newer than v0.3.0 |

In the other direction, runqy worker v0.4.x works with older servers, without control commands. Worker v0.3.x should be paired with server v0.3.0 or later: older servers do not read its heartbeat format and show the worker's queues incorrectly.

!!! warning "Do not use runqy worker v0.3.0"
    Its inference image fails to clone private repositories with a git token. Use v0.3.1 or later. Versions before v0.3.1 could also write the git token to the worker logs: rotate tokens that were used with them.

### Minimum versions per feature

| Feature | runqy server | runqy worker | runqy-python |
|---------|--------------|--------------|--------------|
| GPU autoscaling, email alerts | v0.3.0 | v0.3.1 | |
| Worker control: `drain`, `resume`, `code-update`, `worker-update` | v0.4.0 | v0.4.0 | |
| `config-reload` and the `@reload` decorator | v0.4.0 | v0.4.0 | 0.3.0 |
| Sub-queue priorities applied as weights | | v0.4.0 | |
| `strict_priority` on a queue | v0.4.0 | v0.4.0 | |
| Autoscaler drains a worker before destroying its machine | v0.4.0 | v0.4.0 | |
| A worker whose task process is down stops taking tasks; degraded processes are retried | | v0.4.1 | |
| Lease expiry judged on the Redis clock (a completed task never runs twice) | | v0.4.2 on every worker | |
| Autoscaling `sub_queues` on triggers, `min_ram_gb`, `min_vcpu` | v0.4.1 | | |
| Autoscaler failure reasons, machine logs, cross-queue Tasks pages | v0.4.3 | | |
| Alert `resolve_after`, autoscaling `max_boot_failures` and `runqy autoscale resume` | v0.4.4 | | |
| Worker metrics (`runqy_queue_workers`, `runqy_queue_unhealthy_workers`, `runqy_workers`) | v0.4.5 | | |

An empty cell means the feature does not depend on that component.

## Behaviour changes by server release

Only changes that can affect an existing deployment are listed. The full notes are on the releases pages linked below.

**v0.4.5**

- `asynq_tasks_processed_total` now counts succeeded and failed tasks. It jumps once at the upgrade, and an error rate is now `failed / processed`. Adjust queries that worked around the old counter.

**v0.4.4**

- RESOLVED alert emails are sent once the condition has stayed clear for `resolve_after` (default `5m`). Set `resolve_after: 0s` for the previous behaviour.
- `worker_unhealthy` waits one minute by default before alerting. Set `for: 0s` to alert at once.
- After `max_boot_failures` instances in a row never become ready (default 5), autoscaling for the queue is suspended for 24 hours. Lift it with `runqy autoscale resume <queue>`.

**v0.4.3**

- The dashboard was redesigned and its pages reorganised. No configuration change.

**v0.4.2**

- Autoscaling costs are computed from the price the provider reports for the rented machine. The queue's `instance.max_price_per_hour` is only a fallback.

**v0.4.1**

- No change to existing configurations.

**v0.4.0**

- Queue YAML files with unknown keys are rejected, with the line number. A rejected file keeps its queues' previous configuration. Validate your files before upgrading.
- `deployment.env_vars` is rejected when not empty. Use [vaults](../guides/vaults.md).
- `runqy task enqueue --timeout` defaults to `0`, which applies the queue's `active_timeout`. It used to default to 600 seconds and override it.
- The local `runqy task enqueue` and the dashboard playground refuse unknown or disabled queues, as the API does.

## Behaviour changes by worker release

**v0.4.2**

- Lease expiry uses the Redis server clock instead of each host's clock. Roll it out to every worker: the protection against a completed task running again is complete only when the whole fleet runs v0.4.2.

**v0.4.1**

- While a queue's task process is crashed, restarting or degraded, the worker stops taking tasks for that queue. They stay pending instead of failing, so queue latency grows and alerts or autoscaling can react.
- A task process that exits on its own is treated as a crash, even with exit status 0.
- A degraded process is retried every `recovery.degraded_retry` (default `10m`). Set it to `0` to require a manual restart, as before.

**v0.4.0**

- Sub-queue priorities take effect, as weights: with priorities 6 and 4, the first sub-queue is served first about 60% of the time. Check your ratios, or set `strict_priority` on the queue. See [Queues, sub-queues, priorities](../concepts/queues.md).
- In `long_running` mode, a task that exceeds its `active_timeout` makes the worker restart the task process, which reloads the model. Keep `active_timeout` well above normal task durations.
- `pending_timeout` applies from the first attempt.
- A worker configured only with sub-queues that do not exist on the server fails at startup.

## Changelogs

- [runqy server releases](https://github.com/Publikey/runqy/releases)
- [runqy worker releases](https://github.com/Publikey/runqy-worker/releases)
- [runqy-python releases](https://github.com/Publikey/runqy-python/releases)

## Related

- [Worker control](../guides/worker-control.md)
- [Production deployment](production.md)
- [Installation](../getting-started/installation.md)
