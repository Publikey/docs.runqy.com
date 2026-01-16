# Decorators Reference

## `@load`

Marks a function that runs once at startup. The return value is passed to the task handler as context.

```python
from runqy_task import load

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
from runqy_task import task

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

## `run()`

Enters the stdin/stdout loop for long-running mode.

```python
from runqy_task import run

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
from runqy_task import run_once

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

### Output Format (stdout)

**Ready signal (after `@load`):**

```json
{"status": "ready"}
```

**Task response:**

```json
{"task_id": "abc123", "result": {"output": "world"}, "error": null, "retry": false}
```

**Error response:**

```json
{"task_id": "abc123", "result": null, "error": "Something went wrong", "retry": true}
```
