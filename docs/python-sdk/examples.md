# Examples

## Basic Task Handler

```python
from runqy_python import task, run

@task
def handle(payload: dict, ctx: dict) -> dict:
    name = payload.get("name", "World")
    return {"message": f"Hello, {name}!"}

if __name__ == "__main__":
    run()
```

## ML Inference Task

```python
from runqy_python import task, load, run
import torch

@load
def setup():
    """Load model once at startup."""
    model = torch.load("model.pt")
    model.eval()
    return {"model": model}

@task
def handle(payload: dict, ctx: dict) -> dict:
    """Run inference on each request."""
    model = ctx["model"]
    input_tensor = torch.tensor(payload["input"])

    with torch.no_grad():
        output = model(input_tensor)

    return {"prediction": output.tolist()}

if __name__ == "__main__":
    run()
```

## One-Shot Task

For tasks that don't benefit from keeping the process warm:

```python
from runqy_python import task, run_once

@task
def handle(payload: dict, ctx: dict) -> dict:
    # Process data
    result = expensive_computation(payload["data"])
    return {"result": result}

if __name__ == "__main__":
    run_once()
```

## Task with Database Connection

```python
from runqy_python import task, load, run
import psycopg2

@load
def setup():
    """Establish database connection once."""
    conn = psycopg2.connect(
        host="localhost",
        database="mydb",
        user="user",
        password="password"
    )
    return {"db": conn}

@task
def handle(payload: dict, ctx: dict) -> dict:
    """Query database for each task."""
    cursor = ctx["db"].cursor()
    cursor.execute("SELECT * FROM users WHERE id = %s", (payload["user_id"],))
    user = cursor.fetchone()
    cursor.close()
    return {"user": user}

if __name__ == "__main__":
    run()
```

## Task with Webhook Delivery

For tasks that need to deliver results asynchronously (recommended pattern since results are not stored in Redis by default):

```python
from runqy_python import task, run
import requests
import logging

@task
def handle(payload: dict, ctx: dict) -> dict:
    # Extract webhook URL from payload
    webhook_url = payload.get("webhook_url")

    # Do the work
    result = process_data(payload["input"])

    # Deliver via webhook
    if webhook_url:
        try:
            response = requests.post(
                webhook_url,
                json={"task_id": payload.get("task_id"), "result": result},
                timeout=30
            )
            response.raise_for_status()
        except Exception as e:
            logging.error(f"Webhook delivery failed: {e}")
            # Optionally: raise to trigger retry, or handle gracefully

    # No need to return data when redis_storage=false (default)
    return

if __name__ == "__main__":
    run()
```

See [Result Delivery Patterns](../guides/result-delivery.md) for more delivery options including S3 upload and database writes.

## Testing Locally

You can test your task handler without a worker:

```bash
echo '{"task_id":"t1","payload":{"name":"Alice"}}' | python your_task.py
```

Expected output:

```json
{"status": "ready"}
{"task_id": "t1", "result": {"message": "Hello, Alice!"}, "error": null, "retry": false}
```
