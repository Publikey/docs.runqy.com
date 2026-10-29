---
title: "Worker Control: Drain, Update and Reload Remotely"
description: "Drain, resume and update runqy workers remotely: roll out new task code, install a worker release in place or reload configuration."
---

# Worker Control

The runqy server can send **commands to running workers** over Redis, so you can manage them
without SSH or recreating machines:

| Command | What the worker does |
|---------|----------------------|
| `drain` | Stops taking new tasks. Tasks in flight finish. |
| `resume` | Takes tasks again after a drain. |
| `code_update` | Updates the task code to the latest commit of the queue branch, reinstalls dependencies and restarts the task process. |
| `worker_update` | Installs another runqy-worker release and restarts into it, in the same container. |
| `config_reload` | Asks the task process to reload its configuration, with no restart (needs a [`@reload`](../python-sdk/decorators.md#reload) handler). |

!!! info "Requirements"
    runqy server and runqy-worker **v0.4.0** or later. Older workers do not listen and ignore
    commands. `config_reload` also needs runqy-python **0.3.0** or later.

## Sending a command

From the CLI:

```bash
runqy control drain --target inference           # every worker of the inference queue
runqy control resume --target inference
runqy control code-update --target inference
runqy control worker-update --version 0.4.1       # every worker
runqy control config-reload --target 3fc7e7ee1e37:1
```

```
Sent drain to queue inference (id 2223310d948b29a8, 1 receiver(s)).
Check the outcome with: runqy worker info <worker_id>
```

A **target** is a worker id (as shown by `runqy worker list`) or a queue name. Without `--target`,
the command goes to every worker. The same commands are available from the dashboard
(**Workers → a worker → Control**) and the API ([`POST /api/control`](../server/api.md#control-endpoint)).

Delivery is fire-and-forget: a worker that is offline at that moment misses the command. The
receiver count tells you how many workers got it (`0` means none is listening, e.g. older workers).

## Checking the result

Each worker reports its last command in its heartbeat:

```bash
runqy worker info 3fc7e7ee1e37:1
```

```
Status:      drained
Version:     0.4.0
Held:        inference (not taking new tasks)
Last cmd:    drain done: draining inference (1 task(s) in flight) (12s ago)
```

A command's state is `running`, `done` or `failed`, with a message (the new commit, the reason
of a failure…).

## Drain and resume

`drain` stops the worker from taking new tasks. Tasks already running finish normally.

- While tasks are still running, the worker status is **`draining`**; once nothing runs, it is
  **`drained`**. It stays drained (and keeps its machine) until `resume` or a restart.
- With a queue target, only that queue is drained on workers that serve several queues.

Use it before stopping a machine by hand, so no task is cut off. The
[autoscaler](autoscaling.md#safety-rules) drains workers automatically before a scale-down.

## Code update

`code_update` deploys new task code **without recreating the machine**:

1. The worker stops taking tasks on that queue and waits for the running ones (default limit
   30 minutes, `--timeout` to change it).
2. It fetches the queue configuration from the server again: branch, startup command, vaults and
   git token changes are picked up.
3. It moves the code to the latest commit of the branch (a branch change or a force push is
   followed), reinstalls the dependencies and restarts the task process.
4. It takes tasks again.

The task process restarts, so models are loaded again, but files cached on disk (model
downloads) are kept. Other queues served by the same worker keep running meanwhile.

If the update fails (missing branch, dependency error), the command reports `failed` with the
reason.

!!! note
    Changing a queue's `mode` or `redis_storage` still needs a worker restart.

## Worker update

`worker_update` installs another runqy-worker release **in the running container**, which is the
fastest way to upgrade a GPU machine whose image you don't want to recreate (and whose models
would be downloaded again):

```bash
runqy control worker-update --version 0.4.1 --target inference
```

1. The worker downloads the release archive for its OS and architecture from GitHub, checks it
   against the release's `checksums.txt`, and checks that the new binary runs and reports the
   expected version.
2. It stops taking tasks and waits for the running ones (default 30 minutes, `--timeout`).
3. It shuts down gracefully, replaces its binary and restarts into it, with the same process id,
   so the same worker id. The existing deployment is reused.

The container image tag does not change: if the machine is recreated later, it starts from its
image again. Update the image tag too for the next deployments.

Set `RUNQY_UPDATE_BASE_URL` on the worker to download releases from a mirror (same layout as
GitHub releases). `worker_update` is not supported on Windows.

## Config reload

`config_reload` asks the task process to reload its configuration (a `models.yml`, feature flags…)
**without restarting** it. The task code opts in with a `@reload` handler:

```python
from runqy_python import load, reload, task, run

@load
def setup():
    return {"models": fetch_models_yml()}

@reload
def refresh(ctx):
    ctx["models"] = fetch_models_yml()
    return ctx

@task
def handle(payload, ctx):
    ...

run()
```

The reload runs between tasks. If it raises, the command reports `failed` and the process keeps
its previous configuration. A queue whose process has no `@reload` handler is reported as
skipped.

## How it works

Workers subscribe to three Redis Pub/Sub channels:

| Channel | Receivers |
|---------|-----------|
| `runqy:control` | every worker |
| `runqy:control:<queue>` | workers serving that parent queue |
| `runqy:control:<worker_id>` | one worker |

and publish in their heartbeat (`asynq:workers:<worker_id>`) the actions they support
(`control_actions`), the queues they hold (`held`), their `version` and the outcome of the last
command (`control`). Anyone who can publish on your Redis can send commands: keep Redis private,
as for the rest of runqy.
