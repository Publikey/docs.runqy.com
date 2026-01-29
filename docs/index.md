# runqy Documentation

**Distributed Task Queue** — Server-driven workers. Zero configuration. Deploy Python tasks at scale.

[Get Started](getting-started/quickstart.md){ .md-button .md-button--primary }
[GitHub](https://github.com/Publikey/runqy){ .md-button }

## What is runqy?

runqy is a task queue system where workers are stateless. They receive all configuration (Redis credentials, code deployment specs, task routing) from a central server at startup. This architecture enables:

- **Zero-configuration workers**: Workers only need to know the server URL
- **Centralized control**: All queue and deployment configuration lives on the server
- **Dynamic code deployment**: Workers automatically pull and run your task code
- **Powerful CLI**: Manage queues, tasks, and workers locally or remotely

## Components

- **[runqy Server](server/index.md)** — Go HTTP server for worker registration, queue management, and REST API
- **[runqy Worker](worker/index.md)** — Go binary that processes tasks from Redis and supervises Python processes
- **[runqy-python](python-sdk/index.md)** — Python SDK with `@task` and `@load` decorators for building task handlers (also includes a client for enqueuing)

## Quick Links

- :material-rocket-launch: [Quick Start Guide](getting-started/quickstart.md)
- :material-sitemap: [Architecture Overview](getting-started/architecture.md)
- :material-console: [CLI Reference](server/cli.md)
- :material-language-python: [Python SDK Reference](python-sdk/decorators.md)

## Source Code

- [:material-github: runqy-server](https://github.com/Publikey/runqy)
- [:material-github: runqy-worker](https://github.com/Publikey/runqy-worker)
- [:material-github: runqy-python](https://github.com/Publikey/runqy-python)
