---
title: "Running without Docker"
description: "Run the runqy server and a worker from binaries on one machine, with SQLite, then enqueue a task and read its result."
---

# Running without Docker

This guide runs the runqy server and one worker as plain processes on your machine, using SQLite instead of PostgreSQL. At the end you will have enqueued a task on an example queue and read its result. It also shows how to run a task script alone, with no worker, while you write it.

The [quickstart](../getting-started/quickstart.md) covers the same ground with Docker Compose.

## Prerequisites

- The `runqy` and `runqy-worker` binaries: see [Installation](../getting-started/installation.md).
- Git and Python 3 with the `venv` module, for the worker.
- A Redis server on `localhost:6379`. The quickstart and the examples use Redis 7; use the same major version.

If you have Docker, the shortest way to get Redis is:

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Otherwise install Redis with your package manager and start it.

## Start the server

=== "Linux/macOS"

    ```bash
    export REDIS_HOST=localhost
    export REDIS_PORT=6379
    export REDIS_PASSWORD=""
    export RUNQY_API_KEY=dev-api-key
    runqy serve --sqlite
    ```

=== "Windows"

    ```powershell
    $env:REDIS_HOST = "localhost"
    $env:REDIS_PORT = "6379"
    $env:REDIS_PASSWORD = ""
    $env:RUNQY_API_KEY = "dev-api-key"
    runqy serve --sqlite
    ```

`--sqlite` stores queue configs in a `runqy.db` file in the current directory, so no PostgreSQL is needed. The server prints a summary when it is ready:

```text
  Server: http://localhost:3000

  Database     SQLite (runqy.db)
  Redis        localhost:6379 [connected]
  Queues       0
  Vaults       disabled
  Monitoring   /monitoring
  Metrics      /metrics
  Swagger      /swagger
```

The dashboard is at <http://localhost:3000/monitoring>. On the first visit it asks you to create the admin account.

Leave the server running and open a second terminal.

## Create the example queues

Point the CLI at the server. `runqy login` saves the URL and key in `~/.runqy/credentials.json`, and the commands that follow use them:

```bash
runqy login --server http://localhost:3000 --api-key dev-api-key
```

```text
Logged in to http://localhost:3000 (saved as "default")
Active profile: "default"
```

!!! note "Why log in to a local server"
    Without a saved server (or `--server`), the CLI works in local mode: `runqy config`, `runqy queue` and `runqy task` connect to PostgreSQL directly. That fails against a server started with `--sqlite`, so go through the server's API.

Download the example queue config and load it:

```bash
curl -fsSLO https://raw.githubusercontent.com/Publikey/runqy/main/examples/quickstart.yaml
runqy config create -f quickstart.yaml
```

The file defines two queues whose task code lives in the runqy repository: `quickstart-oneshot` (a new Python process per task) and `quickstart-longrunning` (one process kept alive between tasks). Neither declares sub-queues, so each gets a single `default` sub-queue. Check them:

```bash
runqy queue list
```

## Start a worker

Open a third terminal in an **empty directory**. The worker reads its settings from the environment only when there is no `config.yml` in the directory it starts from.

=== "Linux/macOS"

    ```bash
    export RUNQY_SERVER_URL=http://localhost:3000
    export RUNQY_API_KEY=dev-api-key
    export RUNQY_QUEUES=quickstart-oneshot,quickstart-longrunning
    runqy-worker
    ```

=== "Windows"

    ```powershell
    $env:RUNQY_SERVER_URL = "http://localhost:3000"
    $env:RUNQY_API_KEY = "dev-api-key"
    $env:RUNQY_QUEUES = "quickstart-oneshot,quickstart-longrunning"
    runqy-worker
    ```

The worker registers with the server, receives the Redis address and the two deployment specs, clones the task code into `./deployment/<queue>`, creates a virtualenv there and installs `requirements.txt`. It is ready when it logs:

```text
[INFO] Bootstrap complete, worker status: running
[INFO] Worker running. Press Ctrl+C to stop.
```

In the second terminal, the worker now appears with the status `running`:

```bash
runqy worker list
```

If the worker stops before that, see the table of startup errors in [Deploying workers](deploying-workers.md#check-that-it-started).

## Enqueue a task and read the result

=== "Linux/macOS"

    ```bash
    runqy task enqueue -q quickstart-oneshot -p '{"operation":"uppercase","data":"hello"}'
    ```

    ```text
    Task enqueued successfully!
      ID:    <task-id>
      Queue: quickstart-oneshot.default
      Type:  <type>
    ```

    Then read the task, using the id that was printed:

    ```bash
    runqy task get quickstart-oneshot.default <task-id>
    ```

    The output shows `State:       completed` and, under `Result:`, the value returned by the task.

=== "Windows"

    PowerShell changes the quotes of JSON passed as a command-line argument, so call the REST API instead:

    ```powershell
    $task = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/queue/add" `
      -Headers @{ Authorization = "Bearer dev-api-key" } -ContentType "application/json" `
      -Body '{"queue":"quickstart-oneshot","timeout":0,"data":{"operation":"uppercase","data":"hello"}}'
    $task.info.id
    ```

    Then read the task, waiting for it to finish:

    ```powershell
    (Invoke-RestMethod -Uri "http://localhost:3000/queue/$($task.info.id)?wait=true").Info
    ```

    The `state` field is `completed` and `result` holds the value returned by the task.

The task returns:

```json
{"result": "HELLO"}
```

The result is readable because these queues set `redis_storage: true`. Without it the worker does not store results: see [Getting results](result-delivery.md).

Try the long-running queue the same way with `-q quickstart-longrunning`. Its result includes a `calls` counter that grows with each task, because the process and its state stay alive between tasks.

## Run a task script alone

While you write task code you do not need a server or a worker. A task script reads one JSON object per line on stdin and writes one JSON response per line on stdout, which is how the worker talks to it. You can do the same by hand.

Save this as `main.py`:

```python
from runqy_python import task, run_once


@task
def process(payload: dict) -> dict:
    data = payload.get("data")
    return {"result": data.upper() if isinstance(data, str) else data}


if __name__ == "__main__":
    run_once()
```

Install the package and pipe a task in:

```bash
pip install runqy-python
echo '{"task_id":"t1","payload":{"data":"hello"}}' | python main.py
```

```json
{"status": "ready"}
{"task_id": "t1", "result": {"result": "HELLO"}, "error": null, "retry": false}
```

The first line is the ready signal, the second the response. Anything the script prints with `print()` goes to stderr, so it cannot corrupt the protocol. A script that ends with `run()` instead of `run_once()` keeps reading: send several lines, then close stdin (Ctrl+D) to stop it.

The decorators and the protocol are described in the [Python SDK reference](../reference/python-sdk.md).

## Clean up

Stop the worker and the server with Ctrl+C. To start from scratch, delete `runqy.db` in the server's directory and `deployment/` in the worker's directory, then remove the saved CLI profile:

```bash
runqy logout
```

## Next steps

- [Your first task](../getting-started/first-task.md): deploy task code from your own repository.
- [Deploying workers](deploying-workers.md): run workers on other machines.
- [Production deployment](../operate/production.md): PostgreSQL, TLS and the rest.
