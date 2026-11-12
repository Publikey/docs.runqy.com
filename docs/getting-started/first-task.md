---
title: "Your first task"
description: "Write a task in your own git repository, load a model once with @load, declare a queue for it and run it through a runqy worker."
---

# Your first task

Write a task in your own repository and run it through runqy. The task loads a model once,
when the worker starts, and uses it for every task. The model here is a small sentiment
analyser that needs no GPU; the structure is the same for a model that takes minutes to load.

<div class="rq-facts" markdown>
<div><div class="rq-facts__label">Time</div><div class="rq-facts__value">About 15 minutes</div></div>
<div><div class="rq-facts__label">You need</div><div class="rq-facts__value">The <a href="../quickstart/">quickstart</a> stack running, a git host (GitHub, GitLab...)</div></div>
<div><div class="rq-facts__label">You get</div><div class="rq-facts__value">Your own queue, served by your own code</div></div>
</div>

## How the pieces relate

Three things are involved, and they live in three places:

| What | Where it lives | Who reads it |
|------|----------------|--------------|
| Your task code | A git repository | The worker clones it |
| The queue config | The runqy server | It tells workers which repository, branch and command to run |
| The worker | Any machine that can reach the server | It needs a server URL, an API key and a queue name |

You never copy code onto a worker or build it into an image. To run new code, you push to
git and tell the workers to update.

## Write the task

Create a repository with two files.

```python title="main.py"
from runqy_python import load, task, run
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer


@load
def setup():
    # Runs once, when the worker starts the process. Load your model here.
    return {"analyzer": SentimentIntensityAnalyzer()}


@task
def handle(payload, ctx):
    scores = ctx["analyzer"].polarity_scores(payload["text"])
    if scores["compound"] >= 0.05:
        label = "positive"
    elif scores["compound"] <= -0.05:
        label = "negative"
    else:
        label = "neutral"
    return {"label": label, "score": scores["compound"]}


if __name__ == "__main__":
    run()
```

```text title="requirements.txt"
runqy-python
vaderSentiment
```

- `@load` marks the function that prepares what is expensive to create. What it returns is
  passed to every task as `ctx`.
- `@task` marks the function that handles one task. `payload` is the `data` you enqueue; the
  return value is the result and must be JSON-serializable.
- `run()` waits for tasks until the worker stops the process.

!!! warning "A handler takes `ctx` only when there is a `@load`"
    Without a `@load` function, runqy calls your handler with the payload alone: write
    `def handle(payload):`. A two-argument handler without `@load` fails on every task with a
    `TypeError`.

### Try it without runqy

The task process reads one JSON object per line on standard input and answers on standard
output, so you can test it alone:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
echo '{"task_id": "t1", "payload": {"text": "runqy made this easy"}}' | python main.py
```

```json
{"status": "ready"}
{"task_id": "t1", "result": {"label": "positive", "score": 0.5228}, "error": null, "retry": false}
```

The first line is printed when `@load` has finished; the worker waits for it before sending
tasks.

### Push it

Commit both files and push them to your git host:

```bash
git init -b main
git add main.py requirements.txt
git commit -m "Sentiment task"
git remote add origin https://github.com/<you>/sentiment-task.git
git push -u origin main
```

A public repository needs nothing more. For a private one, see
[Deploying workers](../guides/deploying-workers.md).

## Declare the queue

A queue config tells the server which code serves a queue. Save this next to the quickstart's
Compose file, with your repository URL:

```yaml title="sentiment.yaml"
queues:
  sentiment:
    deployment:
      git_url: "https://github.com/<you>/sentiment-task.git"
      branch: "main"
      startup_cmd: "python main.py"
      mode: "long_running"
      redis_storage: true
```

- `mode: "long_running"` keeps the process alive between tasks, which is what makes `@load`
  worth it. The other mode, `one_shot`, starts a process per task.
- `redis_storage: true` keeps each task's result so that you can read it from the API.
  It is off by default: without it, the task runs but is forgotten as soon as it finishes,
  and `GET /queue/<task-id>` answers `task not found`.

Copy the file into the server container and create the queue:

```bash
docker compose -f docker-compose.quickstart.yml cp sentiment.yaml runqy-server:/tmp/sentiment.yaml
docker compose -f docker-compose.quickstart.yml exec runqy-server runqy config create -f /tmp/sentiment.yaml
```

```text
Created 1 queue configuration(s):
  - sentiment.default
```

Every option of this file is described in [Queue configuration](../reference/queue-config.md).

## Start a worker for the queue

The quickstart's worker listens on the two example queues only. Start a second worker for
yours, on the same Docker network:

```bash
docker run -d --name sentiment-worker --network runqy_default \
  -e RUNQY_SERVER_URL=http://runqy-server:3000 \
  -e RUNQY_API_KEY=dev-api-key \
  -e RUNQY_QUEUES=sentiment \
  ghcr.io/publikey/runqy-worker:latest
```

Those three settings are all a worker needs. Follow its start:

```bash
docker logs -f sentiment-worker
```

```text
[INFO] [sentiment] Deploying code from https://github.com/<you>/sentiment-task.git (branch: main)...
[INFO] Code deployment completed: /app/deployment/sentiment
[INFO] Queues: sentiment.default (0)
[INFO] Worker running. Press Ctrl+C to stop.
```

The worker cloned your repository, created a virtualenv, installed `requirements.txt`,
started `python main.py` and waited for the ready line.

## Run a task

```bash
curl -s -X POST http://localhost:3000/queue/add \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "sentiment", "data": {"text": "runqy made this easy"}}'
```

Read the result with the `id` from the response:

```bash
curl -s "http://localhost:3000/queue/<task-id>?wait=true"
```

```json
{
  "Info": {
    "state": "completed",
    "queue": "sentiment.default",
    "Result": "{\"label\": \"positive\", \"score\": 0.5228}"
  }
}
```

The response has more fields than shown. From Python, use the client that ships with
runqy-python; see [Enqueueing tasks](../guides/enqueueing-tasks.md).

## Change the code

Edit `main.py`, for example to add a field to the result, then commit and push. Running
workers keep the code they started with until you tell them to update:

```bash
docker compose -f docker-compose.quickstart.yml exec runqy-server runqy control code-update --target sentiment
```

```text
Sent code_update to queue sentiment (id f9ddbb06b6639923, 1 receiver(s)).
```

Every worker of the queue finishes its current task, fetches the branch, reinstalls the
requirements and restarts the process. New tasks then run on the new code. More in
[Worker control](../guides/worker-control.md).

## When it fails

- **The worker logs `Bootstrap failed`.** The message says which step failed: the server
  could not be reached, the queue does not exist, the repository could not be cloned, or the
  process did not print its ready line in time (`startup_timeout_secs`, 60 seconds by
  default; raise it for a model that loads slowly).
- **`GET /queue/<task-id>` answers `asynq: task not found` for a task that ran.** The queue
  config lacks `redis_storage: true`.
- **The task stays in `retry`, then becomes `archived`.** Your function raised an exception.
  runqy retries a failed task after a growing delay (10 seconds, then minutes), 3 times by
  default, then archives it. The Python traceback is in the worker's logs
  (`docker logs sentiment-worker`, or the worker's page in the dashboard). Retries are
  configured per queue; see [Task lifecycle](../guides/task-lifecycle.md).

[Troubleshooting](../troubleshooting.md) covers more cases.

## Clean up

```bash
docker rm -f sentiment-worker
```

## Next steps

- [Workers](../concepts/workers.md): what a worker does at start, and how it recovers when
  your process crashes.
- [Deploying workers](../guides/deploying-workers.md): run a worker on a GPU machine, with a
  private repository.
- [GPU autoscaling](../guides/autoscaling.md): let runqy rent and release GPUs for this queue.
- [Examples](../examples/index.md): larger tasks to copy from.
