# runqy Server

The runqy server (`runqy/app`) is the central control plane that manages worker registration, queue configuration, and provides monitoring capabilities.

## Overview

The server provides:

- **Worker registration endpoint**: `POST /worker/register`
- **Queue configuration**: Defines available queues and their deployment specs
- **Redis credential distribution**: Securely provides Redis connection info to workers
- **REST API**: Full API for managing queues, workers, and tasks
- **Web dashboard**: Monitoring interface for task queues and workers
- **Swagger documentation**: Interactive API documentation

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
| `DATABASE_HOST` | Yes | localhost | PostgreSQL hostname |
| `DATABASE_PASSWORD` | Yes | - | PostgreSQL password |
| `ASYNQ_API_KEY` | Yes | - | API key for authenticated endpoints |

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
