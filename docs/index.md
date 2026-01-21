# runqy Documentation

Welcome to the documentation for **runqy** — a distributed task queue system with server-driven bootstrap architecture.

## What is runqy?

runqy is a task queue system where workers are stateless. They receive all configuration (Redis credentials, code deployment specs, task routing) from a central server at startup. This architecture enables:

- **Zero-configuration workers**: Workers only need to know the server URL
- **Centralized control**: All queue and deployment configuration lives on the server
- **Dynamic code deployment**: Workers automatically pull and run your task code

## Components

| Component | Description |
|-----------|-------------|
| [runqy Server](server/index.md) | Go HTTP server for worker registration and queue configuration |
| [runqy Worker](worker/index.md) | Go binary that processes tasks from Redis, supervises Python processes |
| [runqy-task](python-sdk/index.md) | Python SDK with `@task` and `@load` decorators |

## Quick Links

- [Quick Start Guide](getting-started/quickstart.md) — Get up and running in minutes
- [Architecture Overview](getting-started/architecture.md) — Understand how the pieces fit together
- [Python SDK Reference](python-sdk/decorators.md) — Learn about `@task` and `@load` decorators

## Source Code

- [runqy-server](https://github.com/Publikey/runqy)
- [runqy-worker](https://github.com/Publikey/runqy-worker)
- [runqy-python](https://github.com/Publikey/runqy-python)
