---
title: "Installation"
description: "Install the runqy server, the runqy worker and the runqy-python package from Docker images, release binaries or source."
---

# Installation

This page lists every way to install the three runqy components and the platforms they support. To see runqy running first, follow the [quickstart](quickstart.md), which starts everything with Docker Compose.

## What to install and where

| Component | Where it goes | How it is shipped |
|-----------|---------------|-------------------|
| runqy server | One machine that workers and clients can reach. It also needs Redis and a database (PostgreSQL, or SQLite for tests). | Docker image, binary `runqy` |
| runqy worker | Every machine that runs tasks (for example each GPU machine). | Docker images, binary `runqy-worker` |
| runqy-python | In the `requirements.txt` of your task code. Optionally in the application that enqueues tasks. | PyPI package `runqy-python` |

The `runqy` binary is both the server (`runqy serve`) and the command-line client. Install it on your own machine too if you want to manage a remote server from a terminal.

Current releases: runqy server v0.4.5, runqy worker v0.4.2, runqy-python 0.3.1. See [Upgrading and compatibility](../operate/upgrading.md) for which versions work together.

## Server

### Docker image

```bash
docker pull ghcr.io/publikey/runqy:v0.4.5
```

The image is published for `linux/amd64` and `linux/arm64`, with the tags `v<version>` and `latest`. It contains only the `runqy` binary, runs as a non-root user, listens on port 3000 and starts `runqy serve`.

A minimal container, using SQLite and a Redis server reachable at `redis.example.internal`:

```bash
docker run -d --name runqy -p 3000:3000 \
  -e REDIS_HOST=redis.example.internal \
  -e REDIS_PASSWORD=<redis-password> \
  -e RUNQY_API_KEY=dev-api-key \
  -e RUNQY_USE_SQLITE=true \
  ghcr.io/publikey/runqy:v0.4.5
```

For a real deployment, use PostgreSQL and read [Production deployment](../operate/production.md). All settings are in the [server configuration reference](../reference/server-config.md).

### Install script

The script downloads the latest release archive for your OS and architecture from GitHub and installs the `runqy` binary.

=== "Linux/macOS"

    ```bash
    curl -fsSL https://raw.githubusercontent.com/publikey/runqy/main/install.sh | sh
    ```

    The binary is installed in `/usr/local/bin`. The script calls `sudo` if that directory is not writable. Set `INSTALL_DIR` to install elsewhere and `VERSION` (with the `v` prefix) to pin a release:

    ```bash
    curl -fsSL https://raw.githubusercontent.com/publikey/runqy/main/install.sh | VERSION=v0.4.5 INSTALL_DIR="$HOME/.local/bin" sh
    ```

=== "Windows"

    ```powershell
    iwr https://raw.githubusercontent.com/publikey/runqy/main/install.ps1 -useb | iex
    ```

    The binary is installed in `%LOCALAPPDATA%\runqy`, which the script adds to your user `PATH`. Restart the terminal afterwards. Set `$env:INSTALL_DIR` or `$env:VERSION` (with the `v` prefix) before running it to change the directory or pin a release. The script always installs the `amd64` build.

The scripts do not verify checksums. To verify a download, use the manual method below.

### Release archive

Archives are named `runqy_<version>_<os>_<arch>.tar.gz` (`.zip` on Windows) and each release has a `checksums.txt`.

=== "Linux/macOS"

    ```bash
    VERSION=0.4.5
    OS=linux      # or darwin
    ARCH=amd64    # or arm64
    curl -fsSLO "https://github.com/Publikey/runqy/releases/download/v${VERSION}/runqy_${VERSION}_${OS}_${ARCH}.tar.gz"
    curl -fsSLO "https://github.com/Publikey/runqy/releases/download/v${VERSION}/checksums.txt"
    sha256sum -c --ignore-missing checksums.txt
    tar xzf "runqy_${VERSION}_${OS}_${ARCH}.tar.gz" runqy
    sudo mv runqy /usr/local/bin/
    ```

    On macOS, replace `sha256sum -c --ignore-missing checksums.txt` with `shasum -a 256 -c --ignore-missing checksums.txt`.

=== "Windows"

    ```powershell
    $Version = "0.4.5"
    Invoke-WebRequest -Uri "https://github.com/Publikey/runqy/releases/download/v$Version/runqy_${Version}_windows_amd64.zip" -OutFile runqy.zip
    Expand-Archive -Path runqy.zip -DestinationPath .\runqy
    .\runqy\runqy.exe --version
    ```

### From source

Building the server needs Go 1.24.1 or later. The dashboard is already built and committed in the repository, so Node.js is not required.

```bash
git clone https://github.com/Publikey/runqy.git
cd runqy/app
go build -o runqy .
```

A binary built this way reports its version as `dev`.

## Worker

### Docker images

Both variants are published under `ghcr.io/publikey/runqy-worker`. They start `runqy-worker` from `/app`, so task code is deployed under `/app/deployment`.

| Tag | Contents | Platforms | Use it for |
|-----|----------|-----------|------------|
| `v<version>`, `v<version>-minimal`, `latest`, `minimal` | Alpine 3.19, Python 3 with pip, git, curl | `linux/amd64`, `linux/arm64` | CPU tasks whose dependencies install with pip on Alpine |
| `v<version>-inference`, `inference` | `pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime` (PyTorch 2.11.0, CUDA 12.8, cuDNN 9), git, curl, wget, build tools (`build-essential`, `cmake`, `ninja-build`), `uv` | `linux/amd64` | GPU inference; PyTorch is already installed and reused by the task's virtualenv |

```bash
docker pull ghcr.io/publikey/runqy-worker:v0.4.2            # minimal
docker pull ghcr.io/publikey/runqy-worker:v0.4.2-inference  # PyTorch + CUDA
```

Pin a version tag in production: `latest` and `inference` move with each release.

Complete `docker run` commands, including GPU access and volumes, are in [Deploying workers](../guides/deploying-workers.md).

### Install script

=== "Linux/macOS"

    ```bash
    curl -fsSL https://raw.githubusercontent.com/publikey/runqy-worker/main/install.sh | sh
    ```

    Installs `runqy-worker` in `/usr/local/bin`. `VERSION` and `INSTALL_DIR` work as for the server script.

=== "Windows"

    ```powershell
    iwr https://raw.githubusercontent.com/publikey/runqy-worker/main/install.ps1 -useb | iex
    ```

    Installs `runqy-worker.exe` in `%LOCALAPPDATA%\runqy-worker` and adds it to your user `PATH`.

### Release archive

Archives are named `runqy-worker_<version>_<os>_<arch>.tar.gz` (`.zip` on Windows). They also contain `config.yml.example`.

```bash
VERSION=0.4.2
curl -fsSLO "https://github.com/Publikey/runqy-worker/releases/download/v${VERSION}/runqy-worker_${VERSION}_linux_amd64.tar.gz"
curl -fsSLO "https://github.com/Publikey/runqy-worker/releases/download/v${VERSION}/checksums.txt"
sha256sum -c --ignore-missing checksums.txt
tar xzf "runqy-worker_${VERSION}_linux_amd64.tar.gz" runqy-worker
sudo mv runqy-worker /usr/local/bin/
```

### From source

Building the worker needs Go 1.24 or later.

```bash
git clone https://github.com/Publikey/runqy-worker.git
cd runqy-worker
go build -o runqy-worker ./cmd/worker
```

### Host prerequisites

When the worker runs as a binary (not in one of the images), the machine must provide what the worker calls during bootstrap:

| Tool | Why |
|------|-----|
| `git` | The worker clones the task repository. With `code_path` set in the queue config it uses a sparse checkout (`git sparse-checkout`). |
| Python 3 (`python3` or `python` on `PATH`) | The worker creates a virtualenv in the task code directory with `python -m venv`, then runs `pip install -r requirements.txt` inside it. The `venv` module must be available (on Debian and Ubuntu it is the `python3-venv` package). |
| `uv` (optional) | If `uv` is on `PATH`, the worker creates the virtualenv with `uv venv` and falls back to `python -m venv` if that fails. |
| `poetry` (only for Poetry projects) | If the task code has a `pyproject.toml` with a `[tool.poetry]` section, dependencies are installed with `poetry install`. |

By default the virtualenv is created with `--system-site-packages`, so packages already installed in the base Python (PyTorch in the inference image) are not downloaded again. See the [worker configuration reference](../reference/worker-config.md) to change this.

## runqy-python

```bash
pip install runqy-python
```

The package needs Python 3.8 or later and has no dependencies. Install it in two places:

- **Task code**: add `runqy-python` to the `requirements.txt` of your task repository. The worker installs it when it deploys the code.
- **Client code** (optional): install it where you enqueue tasks if you want to use `RunqyClient` instead of calling the REST API yourself. See [Enqueueing tasks](../guides/enqueueing-tasks.md).

## Verify the install

```bash
runqy --version
```

```text
runqy version 0.4.5 (commit: <commit>, built: <date>)
```

```bash
runqy-worker -version
```

```text
runqy-worker 0.4.2
  commit:  <commit>
  built:   <date>
```

```bash
pip show runqy-python
```

## Supported platforms

Release binaries are built for these targets, for both the server and the worker:

| OS | amd64 | arm64 |
|----|-------|-------|
| Linux | yes | yes |
| macOS | yes | yes |
| Windows | yes | yes |

| Docker image | amd64 | arm64 |
|--------------|-------|-------|
| `ghcr.io/publikey/runqy` | yes | yes |
| `ghcr.io/publikey/runqy-worker` (minimal) | yes | yes |
| `ghcr.io/publikey/runqy-worker` (inference) | yes | no |

On Windows, a worker cannot be upgraded in place with `runqy control worker-update`; replace the binary by hand.

## Next steps

- [Quickstart](quickstart.md): run the server, a worker and example tasks with Docker Compose.
- [Running without Docker](../guides/local-development.md): the same path with binaries.
- [Deploying workers](../guides/deploying-workers.md): put a worker on a GPU machine.
