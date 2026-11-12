---
title: "runqy documentation"
description: "runqy is a self-hosted task queue for Python and GPU workloads. Start with the quickstart, then run your own task and scale it on rented GPUs."
hide:
  - navigation
  - toc
---

<div class="rq-hero" markdown>
<div class="rq-hero__text" markdown>

# Run Python tasks on GPUs you control

runqy is a self-hosted task queue. A worker needs a server URL, an API key and a queue
name: Redis credentials, your code and its secrets come from the server. The worker pulls
your code from git, keeps your model loaded and processes tasks.

[Quickstart](getting-started/quickstart.md){ .md-button .md-button--primary }
[Your first task](getting-started/first-task.md){ .md-button }

</div>
<div class="rq-hero__code" markdown>

```python title="main.py"
from runqy_python import load, task, run
from transformers import pipeline


@load
def setup():
    # Runs once when the worker starts: the model stays in memory.
    return {"classify": pipeline("text-classification")}


@task
def handle(payload, ctx):
    return ctx["classify"](payload["text"])[0]


if __name__ == "__main__":
    run()
```

</div>
</div>

## Start here

<div class="grid cards rq-steps" markdown>

-   <span class="rq-step">1</span> **[Quickstart](getting-started/quickstart.md)**

    ---

    Start a server, a worker and Redis with Docker Compose, enqueue a task and read its
    result.

-   <span class="rq-step">2</span> **[Your first task](getting-started/first-task.md)**

    ---

    Write a task in your own repository, load a model once with `@load`, and run it through
    a queue.

-   <span class="rq-step">3</span> **[GPU autoscaling](guides/autoscaling.md)**

    ---

    Rent GPUs on RunPod or Vast.ai when tasks wait, and release them when the queue is
    idle.

</div>

## Find your way

<div class="grid cards" markdown>

-   **Concepts**

    ---

    How the server, the workers and your code fit together.

    [Architecture](concepts/architecture.md) ·
    [Queues and priorities](concepts/queues.md) ·
    [Workers](concepts/workers.md)

-   **Guides**

    ---

    One goal per page.

    [Enqueueing tasks](guides/enqueueing-tasks.md) ·
    [Getting results](guides/result-delivery.md) ·
    [Vaults](guides/vaults.md) ·
    [Deploying workers](guides/deploying-workers.md)

-   **Operate**

    ---

    Run runqy for real.

    [Monitoring](guides/monitoring.md) ·
    [Email alerts](guides/alerting.md) ·
    [Worker control](guides/worker-control.md) ·
    [Production](operate/production.md) ·
    [Security](operate/security.md)

-   **Reference**

    ---

    Every command, endpoint and setting.

    [CLI](reference/cli.md) ·
    [REST API](reference/rest-api.md) ·
    [Queue config](reference/queue-config.md) ·
    [Worker config](reference/worker-config.md) ·
    [Python SDK](reference/python-sdk.md)

-   **Examples**

    ---

    Runnable tasks to copy from: inference, pipelines, webhooks.

    [Browse the examples](examples/index.md)

-   **Troubleshooting**

    ---

    The errors people hit first, and what they mean.

    [Open troubleshooting](troubleshooting.md)

</div>

## Source code

runqy is open source under the MIT licence:
[server and CLI](https://github.com/Publikey/runqy),
[worker](https://github.com/Publikey/runqy-worker),
[Python SDK](https://github.com/Publikey/runqy-python).
