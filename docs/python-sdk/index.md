# runqy-python SDK

The `runqy-python` SDK provides simple decorators for writing task handlers that run on runqy workers. It also includes a client for enqueuing tasks.

## Overview

**Task Handlers** — The core of the SDK:

- **`@load` decorator**: Define a function that runs once at startup (e.g., load ML models)
- **`@task` decorator**: Define a function that handles each incoming task
- **`run()` function**: Enter the stdin/stdout loop for long-running mode
- **`run_once()` function**: Process a single task and exit (one-shot mode)

**Client** — Also included for convenience:

- **`RunqyClient` class**: HTTP client for enqueuing tasks
- **`enqueue()` function**: Quick enqueue without creating a client instance

## Installation

```bash
pip install runqy-python
```

Or install from source:

```bash
pip install git+https://github.com/Publikey/runqy-python.git
```

## Task Handler Example

```python
from runqy_python import task, load, run

@load
def setup():
    """Runs once at startup. Return value is passed to task handler."""
    model = load_my_model()
    return {"model": model}

@task
def handle(payload: dict, ctx: dict) -> dict:
    """Handles each task. Receives payload and context from @load."""
    model = ctx["model"]
    result = model.predict(payload["input"])
    return {"prediction": result}

if __name__ == "__main__":
    run()
```

## Client Example

The SDK also includes a client for enqueuing tasks from Python:

```python
from runqy_python import RunqyClient

client = RunqyClient("http://localhost:3000", api_key="your-api-key")

# Enqueue a task
task = client.enqueue("inference.default", {"input": "hello"})
print(f"Task ID: {task.task_id}")

# Check result
result = client.get_task(task.task_id)
print(f"State: {result.state}, Result: {result.result}")
```

## Source Code

```
runqy-python/
└── src/runqy_python/
    ├── __init__.py      # Package exports
    ├── decorator.py     # @task, @load decorators
    ├── runner.py        # run(), run_once() functions
    └── client.py        # RunqyClient for enqueuing tasks
```

## Related

- [Installation](installation.md)
- [Decorators Reference](decorators.md)
- [Examples](examples.md)
