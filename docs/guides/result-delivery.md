---
title: "Getting results"
description: "Read a task's result from the runqy server by polling or long-polling, or deliver it yourself from the task with a webhook or object storage."
---

# Getting results

There are two ways to get the output of a task: ask the runqy server for it, or have the task send it somewhere itself. This guide covers both. The first section is the one to read if `GET /queue/{id}` gives you no result.

## Turn on result storage first

By default a queue does **not** keep results. When a task finishes on such a queue, the worker deletes it from Redis: the return value of your task function is dropped and the task can no longer be looked up.

To keep results, set `redis_storage: true` in the queue's deployment:

```yaml
queues:
  inference:
    priority: 5
    deployment:
      git_url: "https://github.com/example/my-tasks.git"
      branch: "main"
      startup_cmd: "python main.py"
      redis_storage: true
```

Apply the change (`runqy config reload`, or restart the server), then **restart the workers** of that queue: a worker reads this setting when it registers.

What each value gives you:

| | `redis_storage: false` (default) | `redis_storage: true` |
|---|---|---|
| While the task is pending, active or waiting for a retry | `GET /queue/{id}` returns its state | Same |
| After success | The task is deleted. `GET /queue/{id}` answers 500 with `asynq: task not found`. | State `completed`, with the result |
| After final failure | The task is deleted, same answer | State `archived` |
| Redis memory | Nothing kept | Each finished task is kept until its TTL |

Leave it off for queues whose tasks deliver their own output (see [Delivering results from the task](#delivering-results-from-the-task)) or produce large outputs. Turn it on when callers read results from the server.

### How long results are kept

A completed task and its result stay in Redis for `ttl_completed` (24 hours by default), a failed one for `ttl_archived` (72 hours by default). After that, `GET /queue/{id}` answers 404. Both can be set per queue: see [Task lifecycle](task-lifecycle.md).

### What to return

Return a `dict` from your task function. It is stored as JSON and comes back as a JSON object. Avoid returning a bare number, boolean or `None`: the server may not return such values unchanged.

Keep results small. They live in Redis memory for the whole TTL; for images, audio or model outputs, store the file elsewhere and return its location.

## Poll the server

`GET /queue/{id}` returns the current state of a task. It needs no API key: knowing the task id is what gives access.

```bash
curl http://localhost:3000/queue/<task-id>
```

For a completed task on a queue with `redis_storage: true`:

```json
{
  "Info": {
    "id": "0f3c2a9e-6d1b-4f6e-9a57-2f1f0c6f7a10",
    "type": "inference.default",
    "payload": "{\"prompt\":\"a red bicycle\"}",
    "state": "completed",
    "queue": "inference.default",
    "max_retry": 3,
    "retried": 0,
    "LastErr": "",
    "LastFailedAt": "0001-01-01T00:00:00Z",
    "Deadline": "0001-01-01T00:00:00Z",
    "Group": "",
    "NextProcessAt": "0001-01-01T00:00:00Z",
    "IsOrphaned": false,
    "CompletedAt": "2026-11-12T10:15:04Z",
    "Result": "{\"caption\": \"A RED BICYCLE\"}"
  }
}
```

The fields you need:

| Field | Meaning |
|-------|---------|
| `Info.state` | `pending`, `active`, `retry`, `completed` or `archived`. The last two are final. |
| `Info.Result` | The return value of your task function, **as a JSON string**: parse it a second time. Empty until the task is `completed`. |
| `Info.payload` | The payload, also as a JSON string |
| `Info.retried` | Number of retries so far |
| `Info.CompletedAt` | Completion time. `0001-01-01T00:00:00Z` means "not set", as for the other timestamps. |

Note the capitalisation: the top-level key is `Info`, and the fields from `LastErr` down start with a capital letter.

!!! note
    A task that failed has the state `archived`. `LastErr` is not filled in by the worker, so the error text is not in this response; look at the worker's logs. If callers need the reason, catch the error in your task and return it as part of the result, or send it with a webhook.

Status codes:

| Status | Body | Meaning |
|--------|------|---------|
| 200 | the task | Found |
| 404 | `{"errors": ["task not found"]}` | Unknown id, or the task has expired |
| 500 | `{"errors": ["asynq: task not found"]}` | The task finished on a queue without `redis_storage` and was deleted |

A polling loop with the Python client:

```python
import time

from runqy_python import RunqyClient

client = RunqyClient("http://localhost:3000", api_key="dev-api-key")
task = client.enqueue("inference", {"prompt": "a red bicycle"}, timeout=0)

while True:
    info = client.get_task(task.task_id)
    if info.state in ("completed", "archived"):
        break
    time.sleep(1)

if info.state == "completed":
    print(info.result)
else:
    print("task failed")
```

`get_task()` returns a `TaskInfo` whose `result` is already parsed from JSON, so `info.result` is a `dict` when your task returned one. It raises `TaskNotFoundError` on a 404 and `RunqyError` on other errors. The client has no method that waits for completion; use a loop like this one, or the long-poll below.

## Long-poll the server

Add `?wait=true` and the server holds the request until the task is `completed` or `archived`, checking once per second:

```bash
curl "http://localhost:3000/queue/<task-id>?wait=true"
```

- When the task reaches a final state, the response is the same JSON as above, with status 200.
- After **30 seconds** without a final state, the server answers 408 with `{"errors": ["timeout waiting for task result"]}`. The task is not affected: send the request again.
- On a queue without `redis_storage`, the request ends with a 408 as soon as the task has finished and been deleted, with the message `asynq: task not found`.

Set your HTTP client's timeout above 30 seconds. A loop that waits as long as needed, with the standard library:

```python
import json
import urllib.error
import urllib.request


def wait_for_task(server_url: str, task_id: str) -> dict:
    """Block until the task is completed or archived, then return its info."""
    url = f"{server_url}/queue/{task_id}?wait=true"
    while True:
        try:
            with urllib.request.urlopen(url, timeout=40) as response:
                return json.loads(response.read())["Info"]
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8")
            if exc.code == 408 and "timeout waiting" in body:
                continue  # not finished yet, ask again
            raise


info = wait_for_task("http://localhost:3000", "0f3c2a9e-6d1b-4f6e-9a57-2f1f0c6f7a10")
if info["state"] == "completed":
    print(json.loads(info["Result"]))
else:
    print("task failed")
```

Each waiting request holds one connection to the server. For many concurrent callers or long tasks, prefer a webhook.

## Delivering results from the task

Your task can send its output wherever it is needed and return little or nothing to runqy. This works with `redis_storage` off, and it is the right choice for large outputs and for callers that should be notified rather than poll.

One thing shapes these patterns: **your task function receives the payload and nothing else**. The runqy task id is not in it. To match a delivery with the request that caused it, the caller puts its own identifier in the payload, along with where to deliver.

### Webhook callback

The caller generates a `request_id`, stores it, and sends it with a `callback_url`:

```python
import uuid

from runqy_python import RunqyClient

client = RunqyClient("http://localhost:3000", api_key="dev-api-key")

request_id = str(uuid.uuid4())
client.enqueue(
    "inference",
    {
        "request_id": request_id,
        "callback_url": "https://api.example.com/hooks/runqy",
        "prompt": "a red bicycle",
    },
    timeout=0,
)
print(request_id)
```

The task does its work, then posts the outcome to that URL:

```python
import json
import urllib.request

from runqy_python import run, task


def post_json(url: str, body: dict) -> None:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10):
        pass


@task
def handle(payload):
    caption = payload["prompt"].upper()  # replace with your real work

    # If the receiver is down or refuses the call, this raises: the task fails and
    # runqy retries it later.
    post_json(
        payload["callback_url"],
        {
            "request_id": payload["request_id"],
            "status": "completed",
            "result": {"caption": caption},
        },
    )

    return {"request_id": payload["request_id"], "delivered": True}


if __name__ == "__main__":
    run()
```

Things to know before using this in production:

- An exception fails the task, and runqy retries a failed task while it has retries left (`max_retry`, 3 by default), whatever the exception; see [Errors and retries](../reference/python-sdk.md#errors-and-retries).
- A retry runs the **whole task again**, including the work before the callback. If that work is expensive, save its output before calling back, or make the receiver tolerate a missed callback and fall back to polling.
- The receiver may get the same `request_id` twice (a retry after a callback that succeeded but timed out). Make it idempotent.
- The task only reports successes this way. A task that fails for good sends nothing; have the receiver time out on requests that never complete, or wrap your work in `try`/`except` and post a `"status": "failed"` body before re-raising.
- A callback URL taken from the payload lets anyone who can enqueue make your workers call that URL. Restrict it to hosts you own if callers are not trusted.

### Object storage

For large outputs, upload the file and return (or call back with) its location. This example needs `boto3` in the task's `requirements.txt`, and the bucket name and AWS credentials as environment variables, which a [vault](vaults.md) attached to the queue provides. Because it uses `@load`, the task function takes a second argument, the value `@load` returned:

```python
import os

import boto3
from runqy_python import load, run, task


@load
def setup():
    # Runs once when the task process starts.
    return {
        "s3": boto3.client("s3"),
        "bucket": os.environ["RESULTS_BUCKET"],
    }


@task
def handle(payload, ctx):
    # Replace with your real work; here the output is a small text file.
    output = payload["prompt"].upper().encode("utf-8")

    key = f"results/{payload['request_id']}.txt"
    # A failed upload raises: the task fails and runqy retries it later.
    ctx["s3"].put_object(
        Bucket=ctx["bucket"],
        Key=key,
        Body=output,
        ContentType="text/plain",
    )

    return {"request_id": payload["request_id"], "bucket": ctx["bucket"], "key": key}


if __name__ == "__main__":
    run()
```

Deriving the object key from the caller's `request_id` has two benefits: the caller knows where the output will be before the task runs, and a retried task overwrites the same object instead of creating a second one. With `redis_storage: true`, the small `dict` returned at the end is also available from `GET /queue/{id}`, so the caller can poll for completion and then fetch the file.

## Choosing a pattern

| You want | Use |
|----------|-----|
| A quick answer in a request/response flow, small result | `redis_storage: true` and `?wait=true` |
| A small result, read later or by another service | `redis_storage: true` and polling |
| To be notified when a long task ends | Webhook callback |
| Images, audio, video, large tensors | Object storage, plus polling or a webhook for the location |

## Next steps

- [Task lifecycle: TTL, timeouts and retries](task-lifecycle.md)
- [Enqueueing tasks](enqueueing-tasks.md)
- [Python SDK reference](../reference/python-sdk.md)
- [REST API reference](../reference/rest-api.md)
