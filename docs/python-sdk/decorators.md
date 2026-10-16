---
description: "Reference for the @load, @task and @reload decorators and the run() loop in the runqy-python SDK, with the stdin/stdout protocol they implement."
---

# Decorators Reference

## `@load`

Marks a function that runs once at startup. The return value is passed to the task handler as context.

```python
from runqy_python import load

@load
def setup():
    """Initialize resources (models, connections, etc.)"""
    model = load_model("model.pt")
    db = connect_to_database()
    return {"model": model, "db": db}
```

**Signature:**

```python
def setup() -> Any
```

**Returns:** Any value that will be passed to `@task` handlers as the `ctx` parameter.

**Use cases:**

- Loading ML models
- Establishing database connections
- Reading configuration files
- Any expensive initialization that should happen once

## `@task`

Marks a function that handles each incoming task.

```python
from runqy_python import task

@task
def handle(payload: dict, ctx: dict) -> dict:
    """Process a single task."""
    result = ctx["model"].predict(payload["input"])
    return {"prediction": result}
```

**Signature:**

```python
def handle(payload: dict, ctx: Any) -> dict
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `payload` | dict | The task payload from Redis |
| `ctx` | Any | The return value from `@load` (or `None` if no `@load` is defined) |

**Returns:** A dictionary that will be serialized as the task result.

**Error handling:**

To signal that a task failed but should be retried, raise an exception. The worker will handle retry logic based on the task's `max_retry` setting.

## `@reload`

Marks a function that reloads configuration **without restarting the process**, triggered by the
worker's [`config_reload`](../guides/worker-control.md#config-reload) command
(`runqy control config-reload`). Requires runqy-python 0.3.0 and runqy-worker 0.4.0.

```python
from runqy_python import reload

@reload
def refresh(ctx):
    """Re-read the remote config; keep the loaded models."""
    ctx["models"] = fetch_models_yml()
    return ctx
```

**Signature:**

```python
def refresh(ctx: Any) -> Any
```

**Parameters:** `ctx` is the current context (the `@load` return value, or `None`).

**Returns:** the new context, or `None` to keep the current one. Without `@load`, the return
value is ignored.

The reload runs **between tasks**, in the same order as the tasks the worker already sent. If it
raises, the worker reports the command as failed and the process keeps its previous context.
Only processes with a `@reload` handler receive the command; one `@reload` per process.

## `run()`

Enters the stdin/stdout loop for long-running mode.

```python
from runqy_python import run

if __name__ == "__main__":
    run()
```

This function:

1. Calls the `@load` function (if defined)
2. Outputs `{"status": "ready"}` to signal the worker
3. Reads JSON tasks from stdin
4. Calls the `@task` function for each task
5. Outputs JSON responses to stdout
6. Loops forever until the process is terminated

## `run_once()`

Processes a single task for one-shot mode.

```python
from runqy_python import run_once

if __name__ == "__main__":
    run_once()
```

This function:

1. Calls the `@load` function (if defined)
2. Reads a single JSON task from stdin
3. Calls the `@task` function
4. Outputs the JSON response to stdout
5. Exits

## Protocol

### Input Format (stdin)

```json
{"task_id": "abc123", "payload": {"msg": "hello"}}
```

**Control request** (only sent to processes that announced the capability):

```json
{"task_id": "control-2223310d948b29a8", "type": "runqy.control", "control": "reload"}
```

It is answered like a task, with `{"reloaded": true}` as result or an `error`.

### Output Format (stdout)

**Ready signal (after `@load`):**

```json
{"status": "ready"}
```

With a `@reload` handler, the ready signal announces it:

```json
{"status": "ready", "capabilities": ["reload"]}
```

**Task response:**

```json
{"task_id": "abc123", "result": {"output": "world"}, "error": null, "retry": false}
```

**Error response:**

```json
{"task_id": "abc123", "result": null, "error": "Something went wrong", "retry": true}
```
