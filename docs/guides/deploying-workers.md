---
title: "Deploying workers"
description: "Run a runqy worker on a CPU or GPU machine against an existing runqy server, with Docker or as a systemd service."
---

# Deploying workers

This guide puts a runqy worker on a machine and connects it to a runqy server that is already running. At the end, the worker appears in `runqy worker list` with the status `running` and takes tasks from your queue.

To let runqy rent and release GPU machines for you instead, see [GPU autoscaling](autoscaling.md).

## Prerequisites

- A runqy server the machine can reach over HTTP(S), with the queue already created. See [Queue configuration](../reference/queue-config.md).
- An API key the server accepts for worker registration: the worker-scoped key (`RUNQY_WORKER_API_KEY` on the server) or the admin key. Prefer the worker key, so the admin key never sits on a task machine. See [Security](../operate/security.md).
- **Network access to Redis.** At registration the server sends the worker its own Redis address (`REDIS_HOST:REDIS_PORT` as configured on the server), password and TLS setting. The worker then connects to Redis directly. If the server is configured with `REDIS_HOST=localhost` or a private Docker hostname, remote workers cannot connect.
- Network access to the git repository named in the queue config.
- For GPU tasks with Docker: NVIDIA drivers and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) on the host. `docker run --gpus all` does not work without it.

A worker is configured with three required values:

| Variable | Value |
|----------|-------|
| `RUNQY_SERVER_URL` | URL of the runqy server, for example `https://runqy.example.com` |
| `RUNQY_API_KEY` | The worker key (or admin key) |
| `RUNQY_QUEUES` | Comma-separated queues to serve, for example `inference` |

!!! warning "Environment variables are ignored when a config.yml exists"
    The worker reads these variables only when there is no `config.yml` in its working directory (or at the path given with `-config`). If the file exists, it is the only source of settings, and environment variables are used just for `${VAR}` expansion inside it. The Docker images contain no `config.yml`. All settings are in the [worker configuration reference](../reference/worker-config.md).

## Run with Docker

### CPU worker

```bash
docker run -d --name runqy-worker --restart unless-stopped \
  -e RUNQY_SERVER_URL=https://runqy.example.com \
  -e RUNQY_API_KEY=<worker-api-key> \
  -e RUNQY_QUEUES=inference \
  -v runqy-deployment:/app/deployment \
  ghcr.io/publikey/runqy-worker:v0.4.2
```

### GPU worker

```bash
docker run -d --name runqy-worker --restart unless-stopped \
  --gpus all \
  -e RUNQY_SERVER_URL=https://runqy.example.com \
  -e RUNQY_API_KEY=<worker-api-key> \
  -e RUNQY_QUEUES=inference \
  -v runqy-deployment:/app/deployment \
  -v runqy-cache:/root/.cache \
  ghcr.io/publikey/runqy-worker:v0.4.2-inference
```

The `-inference` image is based on `pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime`. The task's virtualenv is created with access to the system packages, so PyTorch is not installed a second time. The image variants are described in [Installation](../getting-started/installation.md#docker-images).

### What the volumes are for

- **`/app/deployment`**: the worker deploys each parent queue under `<deployment dir>/<queue>` (clone and `.venv`). The deployment directory defaults to `./deployment`, which is `/app/deployment` in the images; change it with `RUNQY_DEPLOYMENT_DIR`. With a volume, a restarted container finds the existing clone, runs `git pull --ff-only`, reuses the virtualenv and only installs what changed in `requirements.txt`.
- **`/root/.cache`**: the container runs as root, so libraries that cache downloads under the home directory (Hugging Face uses `~/.cache/huggingface`) write there. Without a volume, models are downloaded again each time the container is recreated. If your task code stores models elsewhere, mount that path instead.

### Stopping a container

On `SIGTERM` the worker waits for running tasks up to its shutdown timeout (`RUNQY_SHUTDOWN_TIMEOUT`, default `8s`), then puts the tasks still running back in the pending list. `docker stop` sends `SIGKILL` after 10 seconds by default. If your tasks are longer than a few seconds, raise both:

```bash
docker run -d --name runqy-worker --stop-timeout 330 \
  -e RUNQY_SHUTDOWN_TIMEOUT=5m \
  -e RUNQY_SERVER_URL=https://runqy.example.com \
  -e RUNQY_API_KEY=<worker-api-key> \
  -e RUNQY_QUEUES=inference \
  -v runqy-deployment:/app/deployment \
  ghcr.io/publikey/runqy-worker:v0.4.2
```

To stop a worker without interrupting anything, drain it first: see [Worker control](worker-control.md).

## Run the binary as a systemd service

Install the [host prerequisites](../getting-started/installation.md#host-prerequisites) (git, Python 3 with `venv`). This layout keeps the binary in a directory the service user owns, which is what an in-place `runqy control worker-update` needs: it writes the new binary next to the running one.

```bash
sudo useradd --system --create-home --home-dir /var/lib/runqy-worker --shell /usr/sbin/nologin runqy
sudo mkdir -p /var/lib/runqy-worker/bin
curl -fsSL https://github.com/Publikey/runqy-worker/releases/download/v0.4.2/runqy-worker_0.4.2_linux_amd64.tar.gz \
  | sudo tar xz -C /var/lib/runqy-worker/bin runqy-worker
sudo chown -R runqy:runqy /var/lib/runqy-worker
```

Put the settings in `/etc/runqy-worker.env`, readable by root only (`sudo chmod 600 /etc/runqy-worker.env`):

```bash
RUNQY_SERVER_URL=https://runqy.example.com
RUNQY_API_KEY=<worker-api-key>
RUNQY_QUEUES=inference
RUNQY_SHUTDOWN_TIMEOUT=5m
```

Create `/etc/systemd/system/runqy-worker.service`:

```ini
[Unit]
Description=runqy worker
After=network-online.target
Wants=network-online.target

[Service]
User=runqy
Group=runqy
WorkingDirectory=/var/lib/runqy-worker
EnvironmentFile=/etc/runqy-worker.env
ExecStart=/var/lib/runqy-worker/bin/runqy-worker
Restart=always
RestartSec=10
TimeoutStopSec=330

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now runqy-worker
journalctl -u runqy-worker -f
```

Notes on this unit:

- `WorkingDirectory` must not contain a `config.yml`, otherwise the environment file is ignored. Task code is deployed in `/var/lib/runqy-worker/deployment`.
- `TimeoutStopSec` is longer than `RUNQY_SHUTDOWN_TIMEOUT`, so systemd does not kill the worker while it waits for tasks.
- `Restart=always` restarts the worker when bootstrap fails: it exits with an error once its retries are used up.
- The worker writes its logs, and the output of the task process, to stderr; `journalctl` collects them.

## Private task repositories

The worker clones the `git_url` of the queue config. For a private repository there are three ways to authenticate. If several are set, the SSH key wins over any token, and a token sent by the server replaces the worker's own.

**Token stored in a vault, sent by the server (recommended).** Nothing to configure on workers. Store the token in a [vault](vaults.md) and reference it in the queue config:

```yaml
queues:
  inference:
    deployment:
      git_url: "https://github.com/<org>/<private-repo>.git"
      branch: "main"
      startup_cmd: "python main.py"
      git_token: "vault://github/GIT_TOKEN"
```

`git_token` only accepts a `vault://<vault>/<key>` reference, and vaults must be enabled on the server. If the reference cannot be resolved, the server logs a warning and the worker attempts the clone without a token.

**Token on the worker.** Set `RUNQY_GIT_TOKEN`. It is used for HTTP(S) URLs as `https://x-access-token:<token>@host/...`. A value containing `:` is used as `user:password`, for example `oauth2:<token>` for GitLab.

**SSH key on the worker.** Set `RUNQY_GIT_SSH_KEY` to the path of a private key and use an SSH `git_url`. With Docker, mount the key read-only:

```bash
docker run -d --name runqy-worker \
  -e RUNQY_SERVER_URL=https://runqy.example.com \
  -e RUNQY_API_KEY=<worker-api-key> \
  -e RUNQY_QUEUES=inference \
  -e RUNQY_GIT_SSH_KEY=/run/secrets/git_key \
  -v /path/to/deploy_key:/run/secrets/git_key:ro \
  -v runqy-deployment:/app/deployment \
  ghcr.io/publikey/runqy-worker:v0.4.2
```

The worker runs ssh with `StrictHostKeyChecking=no`.

## Serving several queues or specific sub-queues

`RUNQY_QUEUES` takes a comma-separated list:

| Value | The worker serves |
|-------|-------------------|
| `inference` | Every sub-queue of `inference` |
| `inference.high,inference.low` | Only these two sub-queues |
| `inference,transcribe` | Every sub-queue of both parent queues |

Each parent queue gets its own deployment and its own task process on the worker; sub-queues of one parent share them. `RUNQY_CONCURRENCY` (default `1`) is the number of tasks the worker runs at the same time, across all its queues. How sub-queue priorities are applied is explained in [Queues, sub-queues, priorities](../concepts/queues.md).

## Check that it started

From a machine with the `runqy` CLI logged in to the server:

```bash
runqy worker list
```

The worker is listed with the status `bootstrapping` while it deploys code, then `running`. Its id is `<hostname>:<pid>`; pass it to `runqy worker info <worker_id>` for details.

A successful start logs these lines, in order (each prefixed with a timestamp and `[INFO]`):

```text
Starting multi-queue bootstrap process...
Bootstrap attempt 1/3: contacting https://runqy.example.com/worker/register
Redis connection successful
Worker registered as bootstrapping
[inference] Deploying code from https://github.com/<org>/<repo>.git (branch: main)...
[inference] Starting supervised process...
[inference] Supervised process started and ready
Bootstrap complete, worker status: running
Worker running. Press Ctrl+C to stop.
```

If the worker exits or never reaches `running`, look at the last lines it logged:

| The log contains | Cause |
|-------------|-------|
| `Configuration error: server.url is required` (or `server.api_key`, `worker.queues`) | A required variable is missing, or a `config.yml` in the working directory is being read instead of the environment. |
| `Bootstrap attempt 1 failed: server returned status 401: ...` | The API key is not the server's worker or admin key. |
| `Bootstrap attempt 1 failed: server returned status 404: {"error":"queue 'inference' not found ..."}` | The queue does not exist on the server. Check `runqy queue list`. |
| `Bootstrap attempt 1 failed: request failed: ...` | The server URL is wrong or unreachable from this machine. |
| `Bootstrap failed: failed to connect to Redis: ...` | The worker cannot reach the Redis address the server sent. Check the server's `REDIS_HOST` and your network rules. |
| `git clone failed: ...` | Repository URL, branch or credentials. The git output follows, with the token redacted. |
| `virtualenv creation failed: python not found in PATH` | Python 3 is missing on the host. |
| `dependency installation failed: pip install failed: ...` | A package in `requirements.txt` did not install. |
| `startup timeout exceeded after ...` | The task process did not print its ready signal within the queue's `startup_timeout_secs`. Raise it if the model takes long to load. |
| `process exited during startup with code ...` | The startup command crashed. The `[STDERR]` lines above it are the task process output. |

More cases are covered in [Troubleshooting](../troubleshooting.md).

## Updating workers

Workers from v0.4.0 can be updated without recreating the machine, from the server:

```bash
runqy control code-update --target inference      # latest commit of the task repo
runqy control worker-update --version 0.4.2       # another runqy-worker release
```

Both wait for running tasks to finish. See [Worker control](worker-control.md) for details and [Upgrading and compatibility](../operate/upgrading.md) for which versions work together.

## Kubernetes and other orchestrators

A worker is an ordinary container: it needs the three environment variables above, outbound access to the server, Redis and the git host, and no inbound port. Give it persistent storage for `/app/deployment` (and the model cache) if you want restarts to skip downloads, and a termination grace period longer than `RUNQY_SHUTDOWN_TIMEOUT`.

## Related

- [Workers: bootstrap, modes, crash recovery](../concepts/workers.md)
- [Worker configuration reference](../reference/worker-config.md)
- [GPU autoscaling](autoscaling.md)
- [Worker control](worker-control.md)
