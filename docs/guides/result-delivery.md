# Result Delivery Patterns

By default, runqy workers do **not** store task results in Redis. This guide explains why and how to handle result delivery in your tasks.

## Default Behavior

When a task completes, the worker only tracks success or failure status in Redis. The full result payload is **not stored** by default (`RedisStorage: false`).

**Why?** Task results can be large—videos, images, ML model outputs, generated files. Storing these in Redis would:

- Bloat memory usage on your Redis instance
- Require manual cleanup of stale results
- Create bottlenecks for large payloads

Instead, your Python task code is responsible for delivering results to clients.

## Your Task Handles Delivery

The recommended pattern is to include delivery instructions in your task payload. Your task code then sends results directly to their destination.

Common patterns:

| Pattern | Best For |
|---------|----------|
| Webhook callback | Real-time notifications, async workflows |
| Blob storage (S3/GCS) | Large files, media, ML outputs |
| Database write | Structured data, audit trails |
| Message queue | Event-driven architectures |

## Pattern 1: Webhook Callback

Pass a `webhook_url` in your task payload. When the task completes, POST the result to that URL.

```python
from runqy_task import task, run
import requests
import logging

@task
def handle(payload: dict, ctx: dict) -> dict:
    webhook_url = payload.get("webhook_url")

    # Do the work
    result = process_data(payload["input"])

    # Deliver via webhook
    if webhook_url:
        try:
            response = requests.post(
                webhook_url,
                json={
                    "task_id": payload.get("task_id"),
                    "status": "completed",
                    "result": result
                },
                timeout=30
            )
            response.raise_for_status()
        except requests.RequestException as e:
            logging.error(f"Webhook delivery failed: {e}")
            # Option 1: Raise to trigger retry
            # raise
            # Option 2: Handle gracefully, log for investigation

    # Return value not stored when RedisStorage=false (default)
    # Just return to signal success
    return

if __name__ == "__main__":
    run()
```

!!! note "Return Values When RedisStorage is Disabled"
    When `RedisStorage: false` (the default), the return value is not stored anywhere.
    The worker only needs to know success vs failure, so `return` or `return None` is sufficient.
    The SDK sends `{"result": null, "error": null}` to signal success.

**Enqueueing with webhook:**

```python
task_id = enqueue_task("inference:default", {
    "input": "process this",
    "webhook_url": "https://api.example.com/webhooks/task-complete"
})
```

### Webhook Best Practices

- **Retry failed deliveries**: Implement exponential backoff for transient failures
- **Verify signatures**: Sign webhook payloads so receivers can verify authenticity
- **Handle timeouts**: Set reasonable timeouts (30s) to avoid blocking tasks
- **Log failures**: Track failed deliveries for investigation

## Pattern 2: Blob Storage (S3/GCS)

For large results like images or videos, upload to cloud storage and optionally notify via webhook with the URL.

```python
from runqy_task import task, load, run
import boto3
import requests
import uuid

@load
def setup():
    """Initialize S3 client once."""
    s3 = boto3.client('s3')
    return {"s3": s3}

@task
def handle(payload: dict, ctx: dict) -> dict:
    s3 = ctx["s3"]
    bucket = "my-results-bucket"

    # Generate result (e.g., process image, run ML inference)
    output_data = generate_output(payload["input"])

    # Upload to S3
    key = f"results/{uuid.uuid4()}.png"
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=output_data,
        ContentType="image/png"
    )

    result_url = f"https://{bucket}.s3.amazonaws.com/{key}"

    # Notify via webhook if provided
    webhook_url = payload.get("webhook_url")
    if webhook_url:
        requests.post(webhook_url, json={
            "task_id": payload.get("task_id"),
            "status": "completed",
            "result_url": result_url
        }, timeout=30)

    return

if __name__ == "__main__":
    run()
```

### Presigned URLs

For private buckets, generate presigned URLs with expiration:

```python
presigned_url = s3.generate_presigned_url(
    'get_object',
    Params={'Bucket': bucket, 'Key': key},
    ExpiresIn=3600  # 1 hour
)
```

## Pattern 3: Database Write

Write results directly to your application database:

```python
from runqy_task import task, load, run
import psycopg2

@load
def setup():
    conn = psycopg2.connect(
        host="db.example.com",
        database="myapp",
        user="worker",
        password="secret"
    )
    return {"db": conn}

@task
def handle(payload: dict, ctx: dict) -> dict:
    task_id = payload.get("task_id")
    result = process_data(payload["input"])

    cursor = ctx["db"].cursor()
    cursor.execute(
        "UPDATE tasks SET status = %s, result = %s, completed_at = NOW() WHERE id = %s",
        ("completed", json.dumps(result), task_id)
    )
    ctx["db"].commit()
    cursor.close()

    return

if __name__ == "__main__":
    run()
```

## Pattern 4: Message Queue

Publish results to a message queue for downstream processing:

```python
from runqy_task import task, load, run
import pika
import json

@load
def setup():
    connection = pika.BlockingConnection(
        pika.ConnectionParameters('rabbitmq.example.com')
    )
    channel = connection.channel()
    channel.queue_declare(queue='task_results', durable=True)
    return {"channel": channel}

@task
def handle(payload: dict, ctx: dict) -> dict:
    result = process_data(payload["input"])

    ctx["channel"].basic_publish(
        exchange='',
        routing_key='task_results',
        body=json.dumps({
            "task_id": payload.get("task_id"),
            "result": result
        }),
        properties=pika.BasicProperties(delivery_mode=2)  # persistent
    )

    return

if __name__ == "__main__":
    run()
```

## When to Enable RedisStorage

Enable `RedisStorage: true` in your worker config when:

- Results are small (< 1MB)
- Clients need to poll synchronously for results
- Results are short-lived and you set appropriate TTLs
- You're building simple integrations or prototypes

```yaml
# worker config.yml
worker:
  queue: "simple"
  RedisStorage: true
```

!!! warning "Memory Considerations"
    With `RedisStorage: true`, results accumulate in Redis until they expire or are manually deleted. Monitor your Redis memory usage and set appropriate TTLs for result keys.

## Combining Patterns

You can combine patterns. For example, upload to S3 for large files but also write metadata to your database:

```python
@task
def handle(payload: dict, ctx: dict) -> dict:
    # Generate large output
    video_data = generate_video(payload["input"])

    # Upload to S3
    s3_url = upload_to_s3(video_data)

    # Write metadata to database
    save_to_db(payload["task_id"], {
        "status": "completed",
        "result_url": s3_url,
        "duration_seconds": len(video_data) / 1000
    })

    # Notify client
    notify_webhook(payload["webhook_url"], {
        "task_id": payload["task_id"],
        "result_url": s3_url
    })

    return
```
