# Installation

This guide covers all methods for installing runqy server and worker.

## Quick Install (Recommended)

The fastest way to get started is using the install script.

=== "Linux/macOS (Server)"

    ```bash
    curl -fsSL https://raw.githubusercontent.com/publikey/runqy/main/install.sh | sh
    ```

=== "Windows (Server)"

    ```powershell
    iwr https://raw.githubusercontent.com/publikey/runqy/main/install.ps1 -useb | iex
    ```

=== "Linux/macOS (Worker)"

    ```bash
    curl -fsSL https://raw.githubusercontent.com/publikey/runqy-worker/main/install.sh | sh
    ```

=== "Windows (Worker)"

    ```powershell
    iwr https://raw.githubusercontent.com/publikey/runqy-worker/main/install.ps1 -useb | iex
    ```

!!! tip "Verify installation"
    After installation, verify with:
    ```bash
    runqy --version
    runqy-worker --version
    ```

## Docker Compose Quickstart

The fastest way to run the full stack without cloning the repo:

```bash
# Download the quickstart compose file
curl -O https://raw.githubusercontent.com/Publikey/runqy/main/docker-compose.quickstart.yml

# Start all services
docker-compose -f docker-compose.quickstart.yml up -d

# View logs
docker-compose -f docker-compose.quickstart.yml logs -f
```

## Docker Compose (Full Repo)

For a complete local environment with source code access:

```bash
# Clone the monorepo
git clone https://github.com/publikey/runqy.git
cd runqy

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

This starts:

| Service | Port | Description |
|---------|------|-------------|
| `runqy-server` | 3000 | API server and dashboard |
| `runqy-worker` | - | Task processor |
| `redis` | 6379 | Task queue backend |
| `postgres` | 5432 | Configuration storage |

Access the dashboard at [http://localhost:3000/monitoring/](http://localhost:3000/monitoring/).

### Docker Images

Pre-built images are available on GitHub Container Registry:

```bash
# Server
docker pull ghcr.io/publikey/runqy:latest

# Worker (minimal - Alpine-based)
docker pull ghcr.io/publikey/runqy-worker:latest

# Worker (inference - PyTorch + CUDA)
docker pull ghcr.io/publikey/runqy-worker:inference
```

#### Server Image

```bash
docker run -d \
  -p 3000:3000 \
  -e REDIS_HOST=your-redis-host \
  -e REDIS_PASSWORD=your-redis-password \
  -e RUNQY_API_KEY=your-api-key \
  ghcr.io/publikey/runqy:latest serve --sqlite
```

#### Worker Images

**Minimal (default)** — Lightweight Alpine-based image. You install your own runtime.

- Image: `ghcr.io/publikey/runqy-worker:latest` or `:minimal`
- Base: Alpine 3.19 with git, curl, ca-certificates
- Platforms: linux/amd64, linux/arm64

```bash
docker run -v $(pwd)/config.yml:/app/config.yml ghcr.io/publikey/runqy-worker:latest
```

**Inference** — Pre-configured for ML workloads with PyTorch and CUDA.

- Image: `ghcr.io/publikey/runqy-worker:inference`
- Base: PyTorch 2.1.0 + CUDA 11.8
- Platform: linux/amd64 only
- Includes: Python 3, pip, PyTorch, CUDA runtime

```bash
docker run --gpus all -v $(pwd)/config.yml:/app/config.yml ghcr.io/publikey/runqy-worker:inference
```

#### Worker Image Tags

| Tag | Description |
|-----|-------------|
| `latest`, `minimal` | Minimal Alpine image (multi-arch) |
| `inference` | PyTorch + CUDA image (amd64 only) |
| `<version>` | Specific version, minimal base |
| `<version>-minimal` | Specific version, minimal base |
| `<version>-inference` | Specific version, inference base |

## Manual Binary Download

Download pre-built binaries from GitHub Releases:

- **Server**: [github.com/publikey/runqy/releases](https://github.com/publikey/runqy/releases)
- **Worker**: [github.com/publikey/runqy-worker/releases](https://github.com/publikey/runqy-worker/releases)

### Linux (amd64)

```bash
# Server
curl -LO https://github.com/publikey/runqy/releases/latest/download/runqy_latest_linux_amd64.tar.gz
tar xzf runqy_latest_linux_amd64.tar.gz
sudo mv runqy /usr/local/bin/

# Worker
curl -LO https://github.com/publikey/runqy-worker/releases/latest/download/runqy-worker_latest_linux_amd64.tar.gz
tar xzf runqy-worker_latest_linux_amd64.tar.gz
sudo mv runqy-worker /usr/local/bin/
```

### macOS (Apple Silicon)

```bash
# Server
curl -LO https://github.com/publikey/runqy/releases/latest/download/runqy_latest_darwin_arm64.tar.gz
tar xzf runqy_latest_darwin_arm64.tar.gz
sudo mv runqy /usr/local/bin/

# Worker
curl -LO https://github.com/publikey/runqy-worker/releases/latest/download/runqy-worker_latest_darwin_arm64.tar.gz
tar xzf runqy-worker_latest_darwin_arm64.tar.gz
sudo mv runqy-worker /usr/local/bin/
```

### Windows (amd64)

```powershell
# Server
Invoke-WebRequest -Uri https://github.com/publikey/runqy/releases/latest/download/runqy_latest_windows_amd64.zip -OutFile runqy.zip
Expand-Archive runqy.zip -DestinationPath .

# Worker
Invoke-WebRequest -Uri https://github.com/publikey/runqy-worker/releases/latest/download/runqy-worker_latest_windows_amd64.zip -OutFile runqy-worker.zip
Expand-Archive runqy-worker.zip -DestinationPath .
```

Add the extracted directory to your system PATH.

### Available Archives

**Server (`runqy`):**

- `runqy_<version>_linux_amd64.tar.gz`
- `runqy_<version>_linux_arm64.tar.gz`
- `runqy_<version>_darwin_amd64.tar.gz`
- `runqy_<version>_darwin_arm64.tar.gz`
- `runqy_<version>_windows_amd64.zip`
- `runqy_<version>_windows_arm64.zip`

**Worker (`runqy-worker`):**

- `runqy-worker_<version>_linux_amd64.tar.gz`
- `runqy-worker_<version>_linux_arm64.tar.gz`
- `runqy-worker_<version>_darwin_amd64.tar.gz`
- `runqy-worker_<version>_darwin_arm64.tar.gz`
- `runqy-worker_<version>_windows_amd64.zip`
- `runqy-worker_<version>_windows_arm64.zip`

## From Source

Build from source if you need the latest development version or want to modify the code.

### Prerequisites

- Go 1.24+
- Git

### Server

```bash
git clone https://github.com/publikey/runqy.git
cd runqy/app
go build -o runqy .

# Optional: Install to PATH
sudo mv runqy /usr/local/bin/
```

### Worker

```bash
git clone https://github.com/publikey/runqy-worker.git
cd runqy-worker
go build -o runqy-worker ./cmd/worker

# Optional: Install to PATH
sudo mv runqy-worker /usr/local/bin/
```

### Build with Version Info

```bash
# Server
go build -ldflags "-X main.Version=1.0.0 -X main.Commit=$(git rev-parse HEAD)" -o runqy .

# Worker
go build -ldflags "-X main.Version=1.0.0 -X main.Commit=$(git rev-parse HEAD)" -o runqy-worker ./cmd/worker
```

## Supported Platforms

| Platform | Architecture | Server | Worker |
|----------|-------------|--------|--------|
| Linux | amd64 | ✅ | ✅ |
| Linux | arm64 | ✅ | ✅ |
| macOS | amd64 | ✅ | ✅ |
| macOS | arm64 (Apple Silicon) | ✅ | ✅ |
| Windows | amd64 | ✅ | ✅ |
| Windows | arm64 | ✅ | ✅ |

## Environment Variables

After installation, configure these environment variables before starting the server:

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_HOST` | Yes | Redis hostname |
| `REDIS_PORT` | No | Redis port (default: 6379) |
| `REDIS_PASSWORD` | Yes | Redis password (can be empty) |
| `REDIS_TLS` | No | Enable TLS for Redis (default: false) |
| `RUNQY_API_KEY` | Yes | API key for authentication |
| `DATABASE_HOST` | No | PostgreSQL host (default: localhost, use `--sqlite` for dev) |
| `DATABASE_PORT` | No | PostgreSQL port (default: 5432) |
| `DATABASE_USER` | No | PostgreSQL username (default: postgres) |
| `DATABASE_PASSWORD` | No | PostgreSQL password |
| `DATABASE_DBNAME` | No | PostgreSQL database name (default: sdxl_queuing_dev) |
| `DATABASE_SSL` | No | PostgreSQL SSL mode (default: disable) |

See [Configuration](../server/configuration.md) for the full reference.

## Next Steps

Once installed:

1. [Quick Start](quickstart.md) — Run through the complete setup tutorial
2. [CLI Reference](../server/cli.md) — Learn the available commands
3. [Python SDK](../python-sdk/index.md) — Write your first task handler
