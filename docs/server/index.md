# runqy Server

The runqy server (`runqy-server-minimal`) is the central control plane that manages worker registration and queue configuration.

## Overview

The server provides:

- **Worker registration endpoint**: `POST /worker/register`
- **Queue configuration**: Defines available queues and their deployment specs
- **Redis credential distribution**: Securely provides Redis connection info to workers

## Installation

```bash
git clone https://github.com/Publikey/runqy-server-minimal.git
cd runqy-server-minimal
go build
```

## Running

```bash
./runqy-server-minimal -config config.yml
```

## Source Code

The server is implemented in Go and consists of approximately 500 lines of code:

- `main.go` — Entry point and HTTP listener
- `handler.go` — `/worker/register` endpoint implementation
- `config.go` — Configuration loading

## Related

- [Configuration Reference](configuration.md)
- [API Reference](api.md)
