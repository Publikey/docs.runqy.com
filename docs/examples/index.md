---
title: "Examples"
description: "Runnable runqy examples: quickstart tasks, GPU inference, pipelines, webhook and scheduled tasks, and example configurations."
---

# Examples

Every example on this page is real code in a public repository that a worker can deploy as is. Most live in the [`examples/`](https://github.com/Publikey/runqy/tree/main/examples) directory of the runqy repository; the rest are in [Publikey/test-dummy-task](https://github.com/Publikey/test-dummy-task).

## Running an example

Each example is a directory with a `main.py` and a `requirements.txt`. A queue config points a worker at it with `git_url` and `code_path`. Two files in `examples/` hold those queue configs:

| File | Queues it defines |
|------|-------------------|
| [`quickstart.yaml`](https://github.com/Publikey/runqy/blob/main/examples/quickstart.yaml) | `quickstart-oneshot`, `quickstart-longrunning` |
| [`examples.yaml`](https://github.com/Publikey/runqy/blob/main/examples/examples.yaml) | `gpu-inference`, `webhook-processor`, `data-pipeline`, `scheduled-tasks`, `multi-critical`, `multi-standard`, `multi-bulk` |

Load one into a running server, start a worker on the queue, then enqueue:

```bash
curl -fsSLO https://raw.githubusercontent.com/Publikey/runqy/main/examples/examples.yaml
runqy config create -f examples.yaml
runqy task enqueue -q data-pipeline -p '{"pipeline":"aggregate","params":{"values":[3,5,8]}}'
```

All these queues set `redis_storage: true`, so results can be read back with `runqy task get <queue>.default <task-id>`. If you have no server yet, start with the [quickstart](../getting-started/quickstart.md).

## Start here

### One-shot task

[`examples/quickstart-oneshot`](https://github.com/Publikey/runqy/tree/main/examples/quickstart-oneshot) · mode `one_shot`

The smallest task: a handler and `run_once()`. The worker starts a new Python process for each task. Without `@load`, the handler takes one argument, the payload.

```python
from runqy_python import task, run_once


@task
def process(payload: dict) -> dict:
    """Process a single task and exit."""
    operation = payload.get("operation", "echo")
    data = payload.get("data")

    if operation == "echo":
        return {"result": data}
    elif operation == "uppercase":
        return {"result": data.upper() if isinstance(data, str) else data}
    elif operation == "double":
        return {"result": data * 2 if isinstance(data, (int, float)) else data}
    else:
        return {"error": f"Unknown operation: {operation}"}


if __name__ == "__main__":
    run_once()
```

### Long-running task

[`examples/quickstart-longrunning`](https://github.com/Publikey/runqy/tree/main/examples/quickstart-longrunning) · mode `long_running`

`@load` runs once when the process starts and returns a context. The process then stays alive, and every task receives that context as the second argument. This is the pattern for anything expensive to initialise.

```python
import sys
from runqy_python import task, load, run


class SimpleProcessor:
    """Simulates a resource that's expensive to initialize."""

    def __init__(self):
        self.call_count = 0

    def process(self, operation: str, data):
        self.call_count += 1
        if operation == "echo":
            return data
        elif operation == "uppercase":
            return data.upper() if isinstance(data, str) else data
        elif operation == "double":
            return data * 2 if isinstance(data, (int, float)) else data
        elif operation == "count":
            return self.call_count
        else:
            raise ValueError(f"Unknown operation: {operation}")


@load
def setup():
    """Initialize resources (runs once before ready signal)."""
    print("Initializing processor...", file=sys.stderr)
    processor = SimpleProcessor()
    print("Processor ready!", file=sys.stderr)
    return {"processor": processor}


@task
def process(payload: dict, ctx: dict) -> dict:
    """Process a task using the initialized processor."""
    processor = ctx["processor"]
    operation = payload.get("operation", "echo")
    data = payload.get("data")

    try:
        result = processor.process(operation, data)
        return {"result": result, "calls": processor.call_count}
    except ValueError as e:
        return {"error": str(e)}


if __name__ == "__main__":
    run()
```

The `calls` value in the result grows with each task, which shows the process is reused.

### The same two tasks, outside the runqy repository

[`dummy-task`](https://github.com/Publikey/test-dummy-task/tree/master/dummy-task) (`@load` + `@task` + `run()`) and [`simple-task`](https://github.com/Publikey/test-dummy-task/tree/master/simple-task) (`@task` + `run_once()`) in Publikey/test-dummy-task are equivalent minimal tasks. The autoscaling and alerting example configs below deploy `dummy-task`. Note that this repository's branch is `master`.

## ML inference

### Stable Diffusion on a GPU

[`examples/gpu-inference`](https://github.com/Publikey/runqy/tree/main/examples/gpu-inference) · mode `long_running` · needs an NVIDIA GPU

The model is loaded into GPU memory once, in `@load`, and stays there between tasks. The queue config sets `startup_timeout_secs: 120` to leave time for the load.

Excerpt from `main.py`:

```python
@load
def setup():
    """Load Stable Diffusion pipeline into GPU memory (runs once)."""
    print("Loading Stable Diffusion model...", file=sys.stderr)

    from diffusers import StableDiffusionPipeline
    import torch

    pipe = StableDiffusionPipeline.from_pretrained(
        "stable-diffusion-v1-5/stable-diffusion-v1-5",
        torch_dtype=torch.float16,
    ).to("cuda")

    # Optional: enable memory-efficient attention
    pipe.enable_attention_slicing()

    print("Model loaded and ready!", file=sys.stderr)
    return {"pipe": pipe}
```

The handler, `process(payload, ctx)`, takes `ctx["pipe"]`, generates the image and returns it as `image_base64` with the `seed` used. The complete file is in the repository.

```bash
runqy task enqueue -q gpu-inference -p '{"prompt":"a cyberpunk fox in neon city, digital art","steps":30,"width":512,"height":512}'
```

Run the worker from the `-inference` image so PyTorch is already installed: see [Deploying workers](../guides/deploying-workers.md).

### Larger inference tasks

These tasks in Publikey/test-dummy-task are closer to production workloads. All use `@load` and `run()`.

| Example | What it shows |
|---------|---------------|
| [`sdxl-multimodel`](https://github.com/Publikey/test-dummy-task/tree/master/sdxl-multimodel) | SDXL image generation with several models. Its `queue.yml` declares two sub-queues (`normal`, `priority`), a 600-second startup timeout, a vault and a full payload schema. |
| [`wan_video`](https://github.com/Publikey/test-dummy-task/tree/master/wan_video) | Image-to-video and text-to-video with Wan 2.1 GGUF models on a GPU. |
| [`azure_image`](https://github.com/Publikey/test-dummy-task/tree/master/azure_image) | Image generation through the Azure OpenAI API. No GPU on the worker; credentials come from environment variables. |
| [`google_video`](https://github.com/Publikey/test-dummy-task/tree/master/google_video) | Video generation through the Google Veo API, polling the provider until the video is ready. |

Each directory has a `queue.yaml` (or `queue.yml`) to load with `runqy config create -f`, and most have a README with the payload fields.

## Pipelines and integrations

### Data pipeline

[`examples/data-pipeline`](https://github.com/Publikey/runqy/tree/main/examples/data-pipeline) · mode `one_shot`

One handler dispatches to several pipeline steps (fetch from an API, transform, aggregate), using only the standard library.

Excerpt from `main.py`:

```python
@task
def process(payload: dict) -> dict:
    pipeline = payload.get("pipeline", "")
    params = payload.get("params", {})

    print(f"Running pipeline: {pipeline}", file=sys.stderr)

    if pipeline == "fetch_users":
        return fetch_users(params)
    elif pipeline == "fetch_weather":
        return fetch_weather(params)
    elif pipeline == "aggregate":
        return aggregate(params)
    else:
        return {"error": f"Unknown pipeline: {pipeline}"}
```

`fetch_users`, `fetch_weather` and `aggregate` are defined in the same file.

### Webhook processor

[`examples/webhook-processor`](https://github.com/Publikey/runqy/tree/main/examples/webhook-processor) · mode `long_running`

Your API receives a webhook, enqueues it and answers at once; the task does the work. The handler routes on `source` and `event_type`. It uses `run()` without `@load`: a long-running process with no context, so the handler takes the payload only.

Excerpt from `main.py`:

```python
@task
def process(payload: dict) -> dict:
    source = payload.get("source", "unknown")
    event_type = payload.get("event_type", "")
    data = payload.get("data", {})

    print(f"Processing {source} webhook: {event_type}", file=sys.stderr)

    # Route by source and event type
    if source == "stripe":
        return handle_stripe(event_type, data)
    elif source == "github":
        return handle_github(event_type, data)
    else:
        return {"processed": False, "action": f"Unknown source: {source}"}
```

```bash
runqy task enqueue -q webhook-processor -p '{"source":"github","event_type":"push","data":{"repository":"org/repo","branch":"main"}}'
```

### Scheduled tasks

[`examples/scheduled-tasks`](https://github.com/Publikey/runqy/tree/main/examples/scheduled-tasks) · mode `one_shot`

Periodic work (health checks, reports, cleanup) selected by a `job` field in the payload. The example relies on an external scheduler: something else enqueues the tasks on a schedule, such as cron, a systemd timer or your application. A crontab entry that enqueues a health check every hour:

```text
0 * * * * curl -fsS -X POST https://runqy.example.com/queue/add -H "Authorization: Bearer <client-key>" -H "Content-Type: application/json" -d '{"queue":"scheduled-tasks","timeout":0,"data":{"job":"healthcheck"}}'
```

### Several queues, one codebase

[`examples/multi-queue`](https://github.com/Publikey/runqy/tree/main/examples/multi-queue) · mode `long_running`

`examples.yaml` defines three parent queues, `multi-critical` (priority 10), `multi-standard` (5) and `multi-bulk` (1), that all deploy this directory. A worker started with `RUNQY_QUEUES=multi-critical,multi-standard,multi-bulk` serves the three and favours the higher priorities. Because they are separate parent queues, the worker runs one task process per queue. To share a single process between priority levels, use sub-queues of one parent instead: see [Queues, sub-queues, priorities](../concepts/queues.md).

### Secrets from a vault

[`examples/star-runqy`](https://github.com/Publikey/runqy/tree/main/examples/star-runqy) · mode `one_shot`

A task that calls the GitHub API with a token stored in a vault. The queue config lists the vault, and the task reads the entry from its environment:

```yaml
queues:
  star-runqy:
    priority: 5
    deployment:
      git_url: "https://github.com/Publikey/runqy.git"
      branch: "main"
      code_path: "examples/star-runqy"
      startup_cmd: "python main.py"
      mode: "one_shot"
      vaults: ["github"]  # All entries from the "github" vault are injected as env vars
```

```python
github_token = os.getenv('GITHUB_TOKEN')
```

The directory has its own queue file (`examples.yaml`) and a README with the steps. See [Vaults](../guides/vaults.md).

### Tasks in Go and TypeScript

Publikey/test-dummy-task also contains the two minimal tasks written in other languages: [`dummy-task-golang`](https://github.com/Publikey/test-dummy-task/tree/master/dummy-task-golang) and [`simple-task-golang`](https://github.com/Publikey/test-dummy-task/tree/master/simple-task-golang) in Go, [`dummy-task-nodejs`](https://github.com/Publikey/test-dummy-task/tree/master/dummy-task-nodejs) and [`simple-task-nodejs`](https://github.com/Publikey/test-dummy-task/tree/master/simple-task-nodejs) in TypeScript. They speak the same stdin/stdout JSON protocol as runqy-python.

## Configuration examples

| Example | What it configures | Guide |
|---------|--------------------|-------|
| [`examples/autoscale.yaml`](https://github.com/Publikey/runqy/blob/main/examples/autoscale.yaml) | A queue with two sub-queues and an `autoscale` block: every scale-up and scale-down trigger, instance requirements, and the dry-run `mock` provider. | [GPU autoscaling](../guides/autoscaling.md) |
| [`examples/alerts.yaml`](https://github.com/Publikey/runqy/blob/main/examples/alerts.yaml) | The global `alerts` block (SMTP or SendGrid, rules, repeat interval) and a per-queue override. | [Email alerts](../guides/alerting.md) |
| [`examples/monitoring/`](https://github.com/Publikey/runqy/tree/main/examples/monitoring) | A Docker Compose stack with runqy, Redis, PostgreSQL, Prometheus with alert rules, and Grafana with a provisioned runqy dashboard. Start it with `docker compose up -d`. | [Monitoring](../guides/monitoring.md) |

## Related

- [Your first task](../getting-started/first-task.md)
- [Python SDK reference](../reference/python-sdk.md)
- [Queue configuration reference](../reference/queue-config.md)
