---
title: "Task Queue Monitoring: Dashboard, CLI, Prometheus"
description: "Monitor Runqy queues and workers with the built-in dashboard, the CLI, Redis queries, or Prometheus and Grafana."
---

# Monitoring

runqy provides multiple monitoring options, from simple Redis queries to full Prometheus/Grafana integration.

## Web Dashboard

The built-in web dashboard at `/monitoring` provides real-time visibility into your queues and workers.

### Dashboard Features

- **Task History**: View processed/failed task counts over time (Today, 7D, 30D)
- **Queue Sizes**: Live view of pending, active, retry, and archived tasks per queue
- **Worker Status**: Monitor worker health, active tasks, and heartbeats
- **Task Management**: Inspect, retry, or delete tasks directly from the UI
- **Alerts**: Active alerts, notification history and email settings (see [Email Alerts](alerting.md))
- **Autoscaling**: GPU instances, their cost and the provider registry (see [GPU Autoscaling](autoscaling.md))

The dashboard works out of the box using Redis data. No additional setup required.

!!! tip "Headless Mode"
    For API-only deployments (e.g., headless servers, CI/CD pipelines), disable the dashboard with `--no-ui`:
    ```bash
    runqy serve --no-ui
    ```
    The REST API, Prometheus metrics (`/metrics`), and Swagger docs remain available.

### Authentication

The dashboard requires authentication to protect sensitive queue and task data.

#### First-Time Setup

On first access, you'll be prompted to create an admin account:

1. Navigate to `/monitoring`
2. You'll be redirected to `/monitoring/setup`
3. Enter your email and password (minimum 8 characters)
4. Click "Create Admin Account"

After setup, the dashboard is protected and requires login.

#### Login Flow

1. Navigate to `/monitoring`
2. Enter your email and password
3. You'll be logged in for 7 days (JWT cookie)

#### Session Management

- Sessions expire after 7 days
- Click "Logout" in the sidebar to end your session
- If your session expires, you'll be redirected to the login page

!!! note "Single Admin"
    The dashboard supports a single admin account. There is no password reset feature—if you forget your password, you'll need to delete the `admin_user` row from the database and re-run setup.

## Worker Health

Workers report their health status via Redis heartbeat.

### Check Worker Status

```bash
# List all workers
redis-cli KEYS "asynq:workers:*"

# Get worker details
redis-cli HGETALL asynq:workers:worker-abc123
```

The heartbeat hash includes:

| Field | Description |
|-------|-------------|
| `started` | Worker start timestamp |
| `healthy` | `true` if Python process is running |
| `queue` | Queue being processed |
| `active_task` | Currently processing task ID (if any) |

### Degraded State

When `healthy: false`:

- The supervised Python process has crashed
- Worker won't process new tasks
- Manual restart is required

## Queue Metrics

### Pending Tasks

```bash
# Count pending tasks ({inference.default} braces are literal hash tags)
redis-cli LLEN asynq:{inference.default}:pending

# List pending task IDs
redis-cli LRANGE asynq:{inference.default}:pending 0 -1
```

### Active Tasks

```bash
# Count active tasks
redis-cli LLEN asynq:{inference.default}:active

# List active task IDs
redis-cli LRANGE asynq:{inference.default}:active 0 -1
```

## Task Inspection

### View Task Data

```bash
redis-cli HGETALL asynq:{inference.default}:t:task-id-here
```

### View Task Result

The result is stored in the `result` field of the task hash (there is no separate result key):

```bash
redis-cli HGET asynq:{inference.default}:t:task-id-here result
```

---

## Prometheus and Grafana (Optional)

The runqy server exports its queue and worker metrics in the Prometheus format at `/metrics`.
Nothing has to be enabled: point Prometheus at the server and you get history at the scrape
interval, your own Grafana dashboards and Alertmanager rules. The built-in dashboard does not
need Prometheus; it keeps reading Redis.

### What Prometheus Adds

| | Built-in dashboard | With Prometheus |
|---|---|---|
| Task history | Daily totals, 90 days | One point per scrape (15s by default) |
| Queue depth and latency over time | Current value only | Full history |
| Custom dashboards | — | Grafana |
| Alerting | Built-in [email alerts](alerting.md) | Alertmanager |
| Retention | 90 days in Redis | Whatever Prometheus is configured for |

### Try It: Docker Compose Example

[`examples/monitoring`](https://github.com/Publikey/runqy/tree/main/examples/monitoring) in the
runqy repository is a complete setup: runqy with Redis and PostgreSQL, Prometheus with alert
rules, and Grafana with its data source and a **runqy** dashboard already provisioned.

```bash
git clone https://github.com/Publikey/runqy.git
cd runqy/examples/monitoring
docker compose up -d
```

| Service | URL |
|---------|-----|
| runqy dashboard | <http://localhost:3000/monitoring/> |
| Metrics | <http://localhost:3000/metrics> |
| Prometheus | <http://localhost:9090> |
| Grafana | <http://localhost:3001> (`admin` / `admin`), dashboard **runqy** |

The Grafana dashboard stays empty until a queue exists, since every metric is per queue: create
a queue, start a worker and enqueue a few tasks (see the [Quickstart](../getting-started/quickstart.md)).

### Add runqy to an Existing Prometheus

```yaml
scrape_configs:
  - job_name: runqy
    metrics_path: /metrics
    static_configs:
      - targets: ['localhost:3000']  # runqy server address
```

`/metrics` needs no API key. If the server is reachable from the internet, restrict that path at
your reverse proxy or firewall: it reveals queue names and volumes.

### Available Metrics

Every metric except `runqy_workers` carries a `queue` label with the full queue name, for
example `inference.high`.

| Metric | Type | Description |
|--------|------|-------------|
| `asynq_tasks_enqueued_total` | Gauge | Tasks currently in each state. Label `state`: `pending`, `active`, `scheduled`, `retry`, `archived`, `completed`. Despite its name it is not a counter |
| `asynq_queue_size` | Gauge | Tasks in the queue, all states together (no `state` label) |
| `asynq_queue_latency_seconds` | Gauge | Age of the oldest pending task |
| `asynq_tasks_processed_total` | Counter | Tasks finished, succeeded and failed |
| `asynq_tasks_failed_total` | Counter | Tasks failed |
| `asynq_queue_paused_total` | Gauge | `1` when the queue is paused |
| `asynq_queue_memory_usage_approx_bytes` | Gauge | Approximate Redis memory used by the queue |
| `runqy_queue_workers` | Gauge | Live workers (fresh heartbeat) listening on the queue. `0` when there is none |
| `runqy_queue_unhealthy_workers` | Gauge | Of those, workers whose task process is down or degraded |
| `runqy_workers` | Gauge | Live workers, all queues |

The `asynq_` prefix comes from the task queue library runqy is built on.

!!! note "Version"
    The `runqy_*` worker metrics are available from runqy v0.4.5. Before that version,
    `asynq_tasks_processed_total` counted only the tasks that succeeded, so an error rate had to
    be computed as `failed / (processed + failed)`.

!!! note "Completed tasks are not a counter"
    `asynq_tasks_enqueued_total{state="completed"}` is the number of completed tasks still
    kept in Redis; it drops as they expire (`ttl_completed`, 24h by default). To count work
    done, use `asynq_tasks_processed_total`.

### Example Queries

**Tasks finished per minute, per queue:**
```promql
rate(asynq_tasks_processed_total[5m]) * 60
```

**Error rate:**
```promql
rate(asynq_tasks_failed_total[5m]) / rate(asynq_tasks_processed_total[5m])
```

**Pending tasks:**
```promql
asynq_tasks_enqueued_total{state="pending"}
```

**Age of the oldest pending task:**
```promql
asynq_queue_latency_seconds
```

**Queues with pending tasks and no worker:**
```promql
asynq_tasks_enqueued_total{state="pending"} > 0
  and on(queue) runqy_queue_workers == 0
  and on(queue) asynq_queue_paused_total == 0
```

### Grafana Dashboard

The dashboard used by the example is
[`examples/monitoring/grafana/dashboards/runqy.json`](https://github.com/Publikey/runqy/blob/main/examples/monitoring/grafana/dashboards/runqy.json).
To add it to your own Grafana:

1. Go to **Dashboards > New > Import**.
2. Upload `runqy.json`.
3. Pick your Prometheus data source in the **Data source** selector at the top of the dashboard.

It shows the backlog (pending, latency, active, retry and archived tasks), the throughput
(finished and failed per minute, error rate, Redis memory) and the workers (listening and
unhealthy, per queue), with a **Queue** filter.

## Alerting

!!! tip "Built-in email alerts"
    runqy can email you directly (SMTP or SendGrid) when a queue has no workers, falls behind, has
    an unhealthy worker or fails to autoscale, with no Prometheus needed. See
    [Email Alerts](alerting.md). Use Alertmanager below if you already run Prometheus.

### Prometheus Alertmanager

The example ships these rules as
[`examples/monitoring/alerts.yml`](https://github.com/Publikey/runqy/blob/main/examples/monitoring/alerts.yml).
The thresholds are examples: adjust them to your queues.

```yaml
groups:
  - name: runqy
    rules:
      # Tasks are waiting and no live worker listens on the queue.
      - alert: RunqyNoWorkers
        expr: >
          asynq_tasks_enqueued_total{state="pending"} > 0
          and on(queue) runqy_queue_workers == 0
          and on(queue) asynq_queue_paused_total == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "No worker for {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} has {{ $value }} pending tasks and no live worker."

      # The oldest pending task has waited too long.
      - alert: RunqyHighQueueLatency
        expr: >
          asynq_queue_latency_seconds > 300
          and on(queue) asynq_queue_paused_total == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.queue }}"
          description: "The oldest pending task of {{ $labels.queue }} has waited {{ $value | humanizeDuration }}."

      # Too many tasks waiting.
      - alert: RunqyHighQueueDepth
        expr: asynq_tasks_enqueued_total{state="pending"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High queue depth on {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} has {{ $value }} pending tasks."

      # More than 10% of the finished tasks failed.
      - alert: RunqyHighErrorRate
        expr: >
          rate(asynq_tasks_failed_total[5m]) / rate(asynq_tasks_processed_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.queue }}"
          description: "{{ $value | humanizePercentage }} of the tasks finished on {{ $labels.queue }} failed."

      # Workers are there but nothing gets done.
      - alert: RunqyNoTasksProcessed
        expr: >
          increase(asynq_tasks_processed_total[10m]) == 0
          and on(queue) asynq_tasks_enqueued_total{state="pending"} > 0
          and on(queue) asynq_queue_paused_total == 0
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "No tasks processed on {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} has pending tasks but none finished in 10 minutes."

      # A worker's task process is down or degraded: it takes no task.
      - alert: RunqyUnhealthyWorker
        expr: runqy_queue_unhealthy_workers > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Unhealthy worker on {{ $labels.queue }}"
          description: "{{ $value }} worker(s) listening on {{ $labels.queue }} report an unhealthy task process."
```

### Key Metrics to Monitor

| What | Example threshold | Why |
|------|-------------------|-----|
| Workers per queue | `0` with pending tasks | Nobody will pick the tasks up |
| Queue latency | > 5 minutes | Tasks wait too long |
| Queue depth | > 1000 pending | Tasks arrive faster than they are processed |
| Error rate | > 10% | Code bug or failing upstream service |
| Unhealthy workers | > 0 for 5 minutes | A task process is down and auto-recovery has not brought it back |

## Best Practices

1. **Start with the dashboard** - The built-in dashboard covers most monitoring needs
2. **Add Prometheus for history** - When you need queue depth and latency over time, or more than 90 days of history
3. **Set up alerts early** - Don't wait for production issues to configure alerting
4. **Monitor worker health** - A worker whose task process is down takes no task; auto-recovery restarts it, but a process that keeps crashing needs you
5. **Track error rates** - Sudden spikes often indicate code bugs or upstream service issues
