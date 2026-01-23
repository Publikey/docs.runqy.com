# runqy Server

The runqy server (`runqy/app`) is the central control plane that manages worker registration, queue configuration, and provides monitoring capabilities.

## Overview

The server provides:

- **Worker registration endpoint**: `POST /worker/register`
- **Queue configuration**: Defines available queues and their deployment specs
- **Redis credential distribution**: Securely provides Redis connection info to workers
- **REST API**: Full API for managing queues, workers, and tasks
- **CLI**: Comprehensive command-line interface for local and remote management
- **Web dashboard**: Monitoring interface for task queues and workers
- **Swagger documentation**: Interactive API documentation

## CLI

The runqy server includes a powerful CLI for managing your task queue system. The CLI can operate in two modes:

- **Local mode**: Direct access to Redis and PostgreSQL for fast operations
- **Remote mode**: Connect to any runqy server via HTTP API with authentication

```bash
# Local operations
runqy queue list
runqy task enqueue -q inference_high -p '{"msg":"hello"}'
runqy worker list

# Remote operations (with saved credentials)
runqy login -s https://production.example.com:3000 -k your-api-key
runqy queue list  # Now operates on remote server
```

See the [CLI Reference](cli.md) for complete documentation.

## Installation

```bash
git clone https://github.com/Publikey/runqy.git
cd runqy
```

## Configuration

The server uses environment variables for configuration. Create a `.env.secret` file:

```bash
cp .env.secret.sample .env.secret
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | HTTP server port |
| `REDIS_HOST` | Yes | localhost | Redis hostname |
| `REDIS_PORT` | No | 6379 | Redis port |
| `REDIS_PASSWORD` | Yes | - | Redis password |
| `REDIS_TLS` | No | false | Enable TLS for Redis connection |
| `DATABASE_HOST` | No | localhost | PostgreSQL hostname |
| `DATABASE_PORT` | No | 5432 | PostgreSQL port |
| `DATABASE_USER` | No | postgres | PostgreSQL username |
| `DATABASE_PASSWORD` | Yes | - | PostgreSQL password |
| `DATABASE_DBNAME` | No | sdxl_queuing_dev | PostgreSQL database name |
| `DATABASE_SSL` | No | disable | PostgreSQL SSL mode |
| `RUNQY_API_KEY` | Yes | - | API key for authenticated endpoints |

## Running

```bash
cd app && go run .
```

Or build and run:

```bash
cd app && go build -o runqy && ./runqy
```

## Source Code

The server is implemented in Go with a modular architecture:

```
runqy/app/
├── main.go          # Entry point
├── api/             # REST API handlers
├── models/          # Data models
├── monitoring/      # Web dashboard
└── config/          # Configuration loading
```

Queue worker configurations are stored in `runqy/deployment/` as YAML files or in PostgreSQL.

## Related

- [Configuration Reference](configuration.md)
- [API Reference](api.md)
