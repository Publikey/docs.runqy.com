# Worker Deployment

## Docker

```dockerfile
FROM golang:1.21 AS builder

WORKDIR /app
COPY . .
RUN go build -o worker ./cmd/worker

FROM python:3.11-slim

# Install git for code deployment
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/worker .
COPY config.yml .

CMD ["./worker", "-config", "config.yml"]
```

## Docker Compose

```yaml
version: '3.8'

services:
  worker:
    build: .
    environment:
      - RUNQY_SERVER_URL=http://server:8081
      - RUNQY_API_KEY=your-api-key
      - RUNQY_QUEUE=inference
    volumes:
      - ./deployment:/app/deployment
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: runqy-worker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: runqy-worker
  template:
    metadata:
      labels:
        app: runqy-worker
    spec:
      containers:
        - name: worker
          image: your-registry/runqy-worker:latest
          env:
            - name: RUNQY_SERVER_URL
              value: "http://runqy-server:8081"
            - name: RUNQY_API_KEY
              valueFrom:
                secretKeyRef:
                  name: runqy-secrets
                  key: api-key
            - name: RUNQY_QUEUE
              value: "inference"
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
```

## Queue Configuration

Workers can listen on queues in two ways:

### Listen on all sub-queues

```yaml
worker:
  queue: "inference"  # Listens on ALL sub-queues (.high, .low, .default, etc.)
```

### Listen on specific sub-queues only

```yaml
worker:
  queues:
    - inference.high
    - inference.low
```

This listens **only** on `inference.high` and `inference.low`, ignoring other sub-queues like `inference.medium`.

!!! note "Shared Runtime"
    Sub-queues of the same parent always share one code deployment and one runtime process. Configuring `[inference.high, inference.low]` deploys code once and starts one Python process.

## Scaling

To handle more tasks, run multiple worker instances:

- Each worker processes one parent queue with one Python process
- Sub-queues of the same parent share a single runtime
- Workers are stateless and can be scaled horizontally
- Use container orchestration (Kubernetes, Docker Swarm) for auto-scaling

## Health Checks

Workers report health via Redis heartbeat at `asynq:workers:{worker_id}`:

```bash
redis-cli HGETALL asynq:workers:worker-abc123
```

The `healthy` field indicates if the Python process is running correctly.
