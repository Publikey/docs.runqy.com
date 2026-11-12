---
title: "Python SDK reference"
description: "Reference of the runqy-python package: the task decorators, run() and run_once(), RetryableError, RunqyClient and the stdin/stdout protocol."
---

# Python SDK reference

`runqy-python` has two parts: decorators and runners to write the task code a runqy worker
executes, and an HTTP client to enqueue tasks. This page documents both, for version 0.3.1.

## Install

```bash
pip install runqy-python
```

The package requires Python 3.8 or later and has no dependencies. The import name is
`runqy_python`.

On a worker, the package must be installed in the task's virtualenv: list `runqy-python` in the
`requirements.txt` of your task code.

## Writing a task

| Name | Kind | Purpose |
|------|------|---------|
| `@task` | decorator | Registers the function that handles each task. Required. |
| `@load` | decorator | Registers a function that runs once at startup; its return value is passed to the handler. Optional. |
| `@reload` | decorator | Registers a function that refreshes the context without restarting the process. Optional. |
| `run()` | function | Starts the loop for a `long_running` queue. |
| `run_once()` | function | Handles one task and returns, for a `one_shot` queue. |
| `RetryableError` | exception | Marks a failure as worth retrying. The worker currently retries every failure; see [Errors and retries](#errors-and-retries). |

Each decorator can be used once per process; a second use raises `RuntimeError`. Calling
`run()` or `run_once()` without a `@task` handler raises `RuntimeError` too.

### `@task`

The handler receives the task payload, a `dict` decoded from the JSON the client enqueued. Its
signature depends on `@load`:

- without `@load`: `def handle(payload)`;
- with `@load`: `def handle(payload, ctx)`, where `ctx` is what the `@load` function returned.

The context is passed only when it is not `None`. If your `@load` function returns nothing, the
handler is called with the payload alone.

```python
from runqy_python import task, run_once


@task
def process(payload):
    return {"result": payload["data"].upper()}


if __name__ == "__main__":
    run_once()
```

Rules for the handler:

- **The payload contains only your data.** The task id, the queue name and the retry count are
  not in it.
- **The return value is the task result.** It must be serializable with `json.dumps` (dicts,
  lists, strings, numbers, booleans, `None`). If it is not, the task fails with the error
  `Result not JSON-serializable: ...`.
- **The result is kept only if the queue stores it.** It can be read back when the queue config
  has `redis_storage: true`; see [Getting results](../guides/result-delivery.md).
- **`print()` is safe.** `run()` and `run_once()` point `sys.stdout` to stderr, so printed text
  goes to the worker's logs. Only `sys.stdout` is redirected: a subprocess or a native library
  that writes to the process's standard output directly still writes into the protocol stream.
  Send such output to stderr.
- With a worker `concurrency` above 1, tasks are still handled one at a time by the task
  process: `run()` reads one task, answers it, then reads the next.

### `@load`

The `@load` function runs once, before the process reports that it is ready. Use it for
anything slow that should not be repeated for each task, such as loading a model.

```python
import sys

from runqy_python import load, run, task


@load
def setup():
    print("loading resources...", file=sys.stderr)
    return {"prefix": "echo: "}


@task
def process(payload, ctx):
    return {"result": ctx["prefix"] + str(payload.get("data"))}


if __name__ == "__main__":
    run()
```

If the `@load` function raises, the process prints
`{"status": "error", "error": "@load failed: <message>"}` and exits with status 1. The worker
treats this as a failed start. Loading must finish within the queue's `startup_timeout_secs`
(default 60, see [Queue configuration](queue-config.md#deployment)).

### `@reload`

The `@reload` function is called when an operator sends the `config_reload` control command
(`runqy control config-reload`, see [Worker control](../guides/worker-control.md#config-reload)).
It runs between two tasks. It needs runqy-python 0.3.0 and runqy worker v0.4.0, or later, and
only works with `run()`.

```python
import json

from runqy_python import load, reload, run, task


def read_settings():
    with open("settings.json") as f:
        return json.load(f)


@load
def setup():
    return {"settings": read_settings()}


@reload
def refresh(ctx):
    ctx["settings"] = read_settings()
    return ctx


@task
def process(payload, ctx):
    return {"greeting": ctx["settings"]["greeting"], "name": payload.get("name")}


if __name__ == "__main__":
    run()
```

- The function receives the current context (the `@load` return value, or `None` without
  `@load`).
- If it returns a value and a `@load` function exists, that value becomes the new context.
  Returning `None` keeps the current one. Without `@load`, the return value is ignored.
- If it raises, the command reports the traceback as its error and the process keeps running
  with the previous context.

### `run()` and `run_once()`

| Function | Queue `mode` | Behaviour |
|----------|--------------|-----------|
| `run()` | `long_running` | Calls `@load`, reports ready, then handles tasks one after another until the worker stops the process. |
| `run_once()` | `one_shot` | Calls `@load`, reports ready, handles one task, and returns. The worker starts a new process for each task, so `@load` runs for each task too. |

Neither function takes arguments. Call one of them at the end of the script named in the queue's
`startup_cmd`. The function must match the queue's `mode`, set in the
[queue config](queue-config.md#deployment).

## Errors and retries

| The handler... | Task outcome |
|----------------|--------------|
| returns a value | Completed. |
| raises an exception | Failed. The task is retried after a delay while it has retries left, then archived. |

How many retries a task has is set by the queue's `max_retry` limit (3 by default), and the
delay grows with each attempt; see [Task lifecycle](../guides/task-lifecycle.md).

!!! warning "Every failure is retried"
    `runqy_python` exports `RetryableError`, and the SDK marks its response `"retry": true`
    only when the handler raises it. The worker does not act on that flag (checked with
    runqy worker v0.4.2): a task that raises `KeyError` on a bad payload is retried exactly
    like one that raises `RetryableError`. So:

    - make handlers safe to run more than once for the same payload;
    - for a queue whose tasks must never run twice, set `max_retry: 0` in its
      [limits](queue-config.md);
    - to give up on a task without retries, return a result that describes the failure
      instead of raising.

The traceback of a failed task is written to the worker's logs.

```python
from runqy_python import run, task


@task
def divide(payload):
    if payload["b"] == 0:
        # A bad input will never succeed: report it as a result, do not raise.
        return {"ok": False, "error": "division by zero"}
    return {"ok": True, "value": payload["a"] / payload["b"]}


if __name__ == "__main__":
    run()
```

## Test a task without a worker

A task script talks over standard input and output, so you can run it by hand. Pipe one JSON
line per task, with a `task_id` and a `payload`:

```bash
echo '{"task_id":"t1","payload":{"operation":"uppercase","data":"hello"}}' | python main.py
```

With the `quickstart-oneshot` example of the runqy repository, this prints the ready signal,
then the response:

```json
{"status": "ready"}
{"task_id": "t1", "result": {"result": "HELLO"}, "error": null, "retry": false}
```

A script that uses `run()` accepts several lines and exits when its input ends. `run_once()`
reads only the first line. Text printed by your code appears on stderr, so it does not mix with
these lines when you redirect stdout.

## Protocol

The worker and the task process exchange one JSON object per line. You need this only to debug a
task or to write a task process without the SDK.

**Ready signal**, written to stdout once `@load` has finished. `capabilities` is present only
when a `@reload` function is registered with `run()`:

```json
{"status": "ready", "capabilities": ["reload"]}
```

**Startup failure**, written instead of the ready signal when `@load` raises:

```json
{"status": "error", "error": "@load failed: model file missing"}
```

**Task**, written by the worker to the process's stdin. The SDK reads `task_id` and `payload`
and ignores the other fields:

```json
{"task_id": "abc123", "type": "inference.high", "payload": {"msg": "hello"}, "retry_count": 0, "max_retry": 3, "queue": "inference.high"}
```

**Response**, written to stdout. `error` is `null` on success; `retry` is `true` only after a
`RetryableError` (see [Errors and retries](#errors-and-retries) for what the worker does with it):

```json
{"task_id": "abc123", "result": {"msg": "HELLO"}, "error": null, "retry": false}
```

**Control command**, sent only to a process that announced the `reload` capability, and its
response:

```json
{"task_id": "control-1", "control": "reload"}
{"task_id": "control-1", "result": {"reloaded": true}, "error": null, "retry": false}
```

A line that is not valid JSON gets a response with `"task_id": "unknown"` and the error
`Invalid JSON input: ...`.

## Client

`RunqyClient` enqueues tasks and reads their state over the server's REST API. It uses only the
Python standard library.

```python
from runqy_python import RunqyClient

client = RunqyClient("http://localhost:3000", api_key="dev-api-key")

task = client.enqueue("inference.high", {"msg": "hello"})
print(task.task_id, task.state)

info = client.get_task(task.task_id)
print(info.state, info.result)
```

### `RunqyClient(server_url, api_key, timeout=30)`

| Argument | Default | Description |
|----------|---------|-------------|
| `server_url` | - | Base URL of the runqy server. A trailing slash is removed. |
| `api_key` | - | API key, sent as `Authorization: Bearer <key>`. The server's client key or admin key. |
| `timeout` | `30` | HTTP timeout of each request, in seconds. |

### `enqueue(queue, payload, timeout=300)`

Enqueues one task with `POST /queue/add` and returns a [`TaskInfo`](#taskinfo) holding the task
id, the queue and the initial state.

| Argument | Default | Description |
|----------|---------|-------------|
| `queue` | - | Queue name: `inference.high`, or `inference` for its `default` sub-queue. |
| `payload` | - | `dict` passed to the handler. |
| `timeout` | `300` | Maximum execution time of the task, in seconds. |

!!! warning "The client's default timeout replaces the queue's `active_timeout`"
    The client always sends `timeout`, and a positive per-request timeout overrides the
    `active_timeout` limit of the queue. With the default, every task enqueued through the
    client is stopped and retried after 300 seconds of execution, whatever the queue config
    says. Pass a larger value for long tasks, or `timeout=0` to use the queue's
    `active_timeout`.

### `enqueue_batch(queue, payloads, timeout=300)`

Enqueues a list of payloads in one request with `POST /queue/add-batch` and returns a
[`BatchResult`](#batchresult). `timeout` has the same meaning and the same default as in
`enqueue`.

!!! warning "Batch payloads arrive wrapped"
    With runqy-python 0.3.1 and runqy server v0.4.5, `enqueue_batch` sends each item as
    `{"timeout": <timeout>, "data": <payload>}` and the server stores that object as the task
    payload. The handler of a task enqueued this way receives the wrapper and finds your data
    under `payload["data"]`. Tasks enqueued with `enqueue` receive the payload directly. To send
    a batch with plain payloads, call the REST endpoint yourself: see
    [Enqueueing tasks](../guides/enqueueing-tasks.md).

### `get_task(task_id)`

Reads a task with `GET /queue/<task-id>` and returns a [`TaskInfo`](#taskinfo). It returns the
current state at once and does not wait for the task to finish: call it again until `state` is
`completed` or `archived`. `result` is filled only for a queue with `redis_storage: true`; a
result or payload that is a JSON string is decoded.

### Module-level functions

Shortcuts that create a client for one call:

```python
from runqy_python import enqueue, enqueue_batch

task = enqueue("inference.high", {"msg": "hello"},
               server_url="http://localhost:3000", api_key="dev-api-key")
```

| Function | Returns |
|----------|---------|
| `enqueue(queue, payload, server_url, api_key, timeout=300)` | `TaskInfo` |
| `enqueue_batch(queue, payloads, server_url, api_key, timeout=300)` | `BatchResult` |

### `TaskInfo`

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | `str` | Task id. |
| `queue` | `str` | Queue the task is in. |
| `state` | `str` | Task state, for example `pending`, `active`, `completed`, `archived`. |
| `result` | any, default `None` | Task result. Set by `get_task` only. |
| `error` | `str`, default `None` | Last error message. Set by `get_task` only. |
| `payload` | `dict`, default `None` | Task payload. |

### `BatchResult`

| Field | Type | Description |
|-------|------|-------------|
| `enqueued` | `int` | Number of tasks enqueued. |
| `failed` | `int` | Number of tasks that could not be enqueued. |
| `task_ids` | `list` | Ids of the enqueued tasks. |
| `errors` | `list` | Error messages of the failed ones. |

### Exceptions

| Exception | Raised when |
|-----------|-------------|
| `RunqyError` | Base class. Any other HTTP error (`HTTP <code>: <body>`) or a connection error. |
| `AuthenticationError` | The server answered `401`. |
| `TaskNotFoundError` | The server answered `404`. This is also raised by `enqueue` for a queue that does not exist, with a message starting with `Task not found:`. |
