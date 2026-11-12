---
title: "Troubleshooting"
description: "The problems people hit first with runqy: workers that do not start, tasks without results, unexpected retries and timeouts, and what each one means."
---

# Troubleshooting

The problems people hit first, grouped by where you see them. Each entry gives the symptom,
the cause and what to do. Behaviour described here was checked against runqy server v0.4.5,
runqy worker v0.4.2 and runqy-python 0.3.1.

Two places tell you most of what you need:

- **The worker's logs** (`docker logs <container>`, the service's journal, or the worker's
  page in the dashboard). Python tracebacks and bootstrap errors are there.
- **`runqy worker list`** and **`runqy queue list`**: is a worker listening, and are tasks
  pending?

## The worker does not start

### `Bootstrap failed` or `Bootstrap attempt N failed`

The worker contacts the server, receives its queue's deployment and prepares the code before
it takes any task. The log line says which step failed.

| Message contains | Cause | Fix |
|------------------|-------|-----|
| `connection refused`, `no such host` | The worker cannot reach `RUNQY_SERVER_URL` | Use an address reachable from the worker's machine or container; `localhost` inside a container is the container itself |
| `status 401` | Wrong API key | Use the server's `RUNQY_API_KEY`, or its worker key |
| `status 404: queue '<name>' not found (also tried '<name>.default')` | No queue config with that name on the server | Create it (`runqy config create -f`), or fix `RUNQY_QUEUES`. Check with `runqy config list` |
| `startup timeout exceeded` | The task process did not print its ready line within `startup_timeout_secs` (60 seconds by default) | Raise `startup_timeout_secs` in the queue config for a model that loads slowly. If the process crashed, the traceback is just above in the logs |
| git errors (`Authentication failed`, `Repository not found`) | The worker cannot clone the task repository | See [Deploying workers](guides/deploying-workers.md) for private repositories |

After three failed attempts the worker exits. Under Docker with a restart policy, or under
systemd, it starts over.

### On Windows, `pip install failed` with a `ModuleNotFoundError` inside `pip`

The worker creates a virtualenv under its deployment directory. Started from a deeply nested
directory, the files inside that virtualenv can exceed Windows' 260-character path limit and
`pip` ends up incomplete. Start the worker from a short path such as `C:unqy-worker`.

### Environment variables are ignored

The worker reads `RUNQY_*` variables **only when there is no `config.yml`** in its working
directory. If the file exists, it wins, and variables are used only where the file references
them as `${VAR}`.

This matters for custom images: an image that ships a `config.yml` ignores the
`RUNQY_SERVER_URL`, `RUNQY_API_KEY`, `RUNQY_QUEUES` and `RUNQY_INSTANCE_ID` that you, or the
autoscaler, pass at start. Remove the file from the image, or write those values in it as
`${RUNQY_SERVER_URL}` and so on. See [Worker configuration](reference/worker-config.md).

### `shutdown_timeout` or another duration has no effect

Durations in `config.yml` need a unit (`30s`, `5m`). A bare number is not a valid duration,
and for several settings the worker keeps the default without saying so.

## A task fails or never finishes

### `TypeError: handle() missing 1 required positional argument: 'ctx'`

The handler takes two arguments but there is no `@load` function, or `@load` returned `None`.
runqy passes `ctx` only when `@load` returned something:

```python
@task
def handle(payload):        # no @load
    ...

@task
def handle(payload, ctx):   # with a @load that returns a value
    ...
```

### A task that raised is run again

That is the default: a failed task is retried, 3 times unless the queue's `max_retry` says
otherwise, with a growing delay (10 seconds, then minutes). It then becomes `archived`.

Every exception is retried, including ones that can never succeed, such as a `KeyError` on a
bad payload. `RetryableError` exists in runqy-python, but the worker does not treat it
differently. To avoid pointless retries, validate the payload and return a result that
describes the problem instead of raising, or set `max_retry: 0` for the queue. See
[Errors and retries](reference/python-sdk.md#errors-and-retries).

### Tasks are stopped after 5 minutes

Tasks enqueued with the Python client carry a 300-second limit: `RunqyClient.enqueue()`
has `timeout=300` by default, and a per-task timeout replaces the queue's `active_timeout`.
A task that runs longer is stopped and retried. Pass `timeout=0` to use the queue's own
setting, or a larger value. See [Enqueueing tasks](guides/enqueueing-tasks.md).

### The handler receives `{"timeout": ..., "data": {...}}` instead of the payload

`RunqyClient.enqueue_batch()` in runqy-python 0.3.1 wraps each payload. Until that is fixed,
read `payload["data"]` in handlers that are fed by `enqueue_batch()`, or enqueue with
`enqueue()` in a loop.

### `runqy task cancel` reports success but the task keeps running

Cancelling does not interrupt a running task. To stop work in progress, give the queue an
`active_timeout` (see [Task lifecycle](guides/task-lifecycle.md)) or restart the worker.

### Tasks stay `pending`

No live worker listens on that queue, or the queue is paused.

- `runqy worker list`: is there a worker for the queue, and is it `running` rather than
  stale?
- `runqy queue list`: is the queue paused?
- A worker whose task process keeps crashing stops taking tasks until the process is healthy
  again; its page in the dashboard shows it as unhealthy. See
  [crash recovery](concepts/workers.md#crash-recovery).

To be told when this happens, set up [email alerts](guides/alerting.md).

### More than one task is `active` but they run one at a time

In `long_running` mode a worker has one task process, and that process handles one task at a
time. Raising `concurrency` does not make it parallel. To process more tasks at once, run
more workers.

## Results

### `asynq: task not found` for a task that ran

```json
{"errors": ["asynq: task not found"]}
```

The queue does not keep results. `redis_storage` is off by default, and a task on such a queue
is deleted when it finishes. Add `redis_storage: true` to the queue's deployment, then restart
its workers. See [Getting results](guides/result-delivery.md).

With `?wait=true`, the same situation ends with status 408 and the same message.

### `LastErr` is empty for a failed task

`GET /queue/<task-id>` does not return the error of a failed task. Read the traceback in the
worker's logs.

### The result is a string, not an object

`Result` is the task's return value encoded as a JSON string. Decode it a second time:

```python
import json

result = json.loads(response["Info"]["Result"])
```

Return a `dict` from your handler rather than a bare number, string or boolean.

## Enqueueing

### `queue not found: <name>.default`

You enqueued to a parent queue name, and that queue declares explicit `sub_queues`. Then no
`.default` sub-queue exists: name the sub-queue (`inference.high`). See
[Queues and priorities](concepts/queues.md#naming-and-the-default-rule).

### A payload is rejected with status 400

```json
{"errors": ["field 'operation' has type number, expected one of: string"]}
```

The queue declares an input schema and the payload does not match it. See
[Payload schemas](guides/payload-schemas.md).

### The Python client raises `TaskNotFoundError` when enqueueing

The client turns every 404 into `TaskNotFoundError`, including "queue not found". Check the
queue name.

## Queue configs and the CLI

### A queue created with `runqy config create -f` lost its schema or limits

`runqy config create -f` keeps the deployment and the `autoscale` block of a YAML file, but
not `input` / `output` schemas, queue-level `limits`, or the global `alerts` block. Put the
file in the directory the server loads (`--config`, `QUEUE_WORKERS_DIR`) and run
`runqy config reload` to get all of them. See
[Queue configuration](reference/queue-config.md).

### `runqy config ...` or `runqy queue list` fails with a PostgreSQL error

Without a server address, the CLI works directly on the database, and several commands only
support PostgreSQL in that mode. Against a server started with `--sqlite`, use remote mode:

```bash
runqy login --server http://localhost:3000 --api-key <key>
runqy config list
```

See the [CLI reference](reference/cli.md).

### The CLI talks to the wrong server

When run from a directory whose parent holds a `.env.secret` file (as in a checkout of the
runqy repository), the CLI loads it, and its `RUNQY_API_KEY` replaces the key saved by
`runqy login`. Run the CLI from another directory.

## Dashboard

### The dashboard asks to create an account

That is the first-run setup: the first visitor creates the administrator account. Do it
before exposing the server.

### Everyone is logged out after a server restart

Without `RUNQY_JWT_SECRET`, the server generates a new session secret each time it starts.
Set the variable to keep sessions across restarts, and to the same value on every server if
you run several. See [Production deployment](operate/production.md).

## Autoscaling

### A queue has pending tasks but no machine is rented

Provisioning is paused after repeated failures, and suspended for a day after several
machines in a row never became ready. `runqy autoscale status` lists the pauses and their
cause, and `runqy autoscale logs <instance-id>` shows what a failed machine printed. Once the
cause is fixed:

```bash
runqy autoscale resume <queue>
```

See [GPU autoscaling](guides/autoscaling.md).

## Still stuck

Open an issue on [GitHub](https://github.com/Publikey/runqy/issues) with the server and
worker versions (`runqy --version`, shown in `runqy worker list` for workers), the queue
config, and the worker's log from its start.
