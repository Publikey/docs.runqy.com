# runqy-task Python SDK

The `runqy-task` Python SDK provides decorators for writing task handlers that integrate with runqy workers.

## Overview

The SDK provides:

- **`@load` decorator**: Define a function that runs once at startup
- **`@task` decorator**: Define a function that handles each task
- **`run()` function**: Enter the stdin/stdout loop for long-running mode
- **`run_once()` function**: Process a single task for one-shot mode

## Installation

```bash
pip install runqy-task
```

Or install from source:

```bash
pip install git+https://github.com/Publikey/runqy-python.git
```

## Quick Example

```python
from runqy_task import task, load, run

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

## Source Code

The SDK is implemented in Python:

```
runqy-python/
└── src/runqy_task/
    ├── decorator.py     # @task, @load decorators (global state)
    └── runner.py        # run(), run_once() stdin/stdout loop
```

## Related

- [Installation](installation.md)
- [Decorators Reference](decorators.md)
- [Examples](examples.md)
