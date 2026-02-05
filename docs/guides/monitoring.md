# Monitoring

runqy provides multiple monitoring options, from simple Redis queries to full Prometheus/Grafana integration.

## Web Dashboard

The built-in web dashboard at `/monitoring` provides real-time visibility into your queues and workers.

### Dashboard Features

- **Task History**: View processed/failed task counts over time (Today, 7D, 30D)
- **Queue Sizes**: Live view of pending, active, retry, and archived tasks per queue
- **Worker Status**: Monitor worker health, active tasks, and heartbeats
- **Task Management**: Inspect, retry, or delete tasks directly from the UI

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
# Count pending tasks
redis-cli LLEN asynq:inference.default:pending

# List pending task IDs
redis-cli LRANGE asynq:inference.default:pending 0 -1
```

### Active Tasks

```bash
# Count active tasks
redis-cli LLEN asynq:inference.default:active

# List active task IDs
redis-cli LRANGE asynq:inference.default:active 0 -1
```

## Task Inspection

### View Task Data

```bash
redis-cli HGETALL asynq:t:task-id-here
```

### View Task Result

```bash
redis-cli GET asynq:result:task-id-here
```

---

## Prometheus Integration (Optional)

For advanced monitoring with sub-second time-series data, runqy integrates with Prometheus. This is optional—the dashboard works without it.

### What Prometheus Adds

| Feature | Without Prometheus | With Prometheus |
|---------|-------------------|-----------------|
| Task history | Daily aggregates (90 days) | Sub-second time-series |
| Real-time throughput | Snapshot totals | Rate per second |
| Custom dashboards | Basic dashboard | Full Grafana support |
| Alerting | Manual monitoring | AlertManager integration |
| Retention | 90 days in Redis | Configurable (years) |

### Architecture

```
┌─────────────────┐     scrape      ┌─────────────────┐
│  runqy server   │ ───────────────>│   Prometheus    │
│  :3000/metrics  │     /metrics    │   :9090         │
└─────────────────┘                 └─────────────────┘
                                           │
                                           │ query
                                           ▼
                                    ┌─────────────────┐
                                    │    Grafana      │
                                    │    :3001        │
                                    └─────────────────┘
```

### Setup

#### 1. Configure Prometheus to Scrape runqy

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'runqy'
    static_configs:
      - targets: ['localhost:3000']  # runqy server address
    scrape_interval: 15s
    metrics_path: /metrics
```

#### 2. Set the Prometheus Address (Optional)

To enable Prometheus-powered charts in the dashboard:

```bash
export PROMETHEUS_ADDRESS=http://localhost:9090
```

!!! note
    This environment variable is optional. Without it, the dashboard uses Redis data which works perfectly for most use cases. Set this only if you want sub-second time-series data in the dashboard.

### Available Metrics

runqy exposes the following Prometheus metrics at `/metrics`:

#### Queue Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `asynq_queue_size` | Gauge | Number of tasks in each state (pending, active, retry, archived) |
| `asynq_queue_latency_seconds` | Gauge | Time since oldest pending task was enqueued |
| `asynq_queue_memory_usage_approx_bytes` | Gauge | Approximate memory usage per queue |

#### Task Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `asynq_tasks_processed_total` | Counter | Total tasks processed (labeled by queue) |
| `asynq_tasks_failed_total` | Counter | Total tasks failed (labeled by queue) |

### Example Queries

**Tasks processed per second:**
```promql
rate(asynq_tasks_processed_total[5m])
```

**Tasks failed per second:**
```promql
rate(asynq_tasks_failed_total[5m])
```

**Error rate percentage:**
```promql
rate(asynq_tasks_failed_total[5m]) / rate(asynq_tasks_processed_total[5m]) * 100
```

**Queue depth (pending tasks):**
```promql
asynq_queue_size{state="pending"}
```

**Queue latency:**
```promql
asynq_queue_latency_seconds
```

### Grafana Dashboard

Import the asynq Grafana dashboard for a pre-built visualization:

1. In Grafana, go to **Dashboards > Import**
2. Enter dashboard ID: `18863` (asynq dashboard)
3. Select your Prometheus data source
4. Click **Import**

Or create custom panels using the queries above.

### Docker Compose Example

Here's a complete setup with Prometheus and Grafana:

```yaml
version: '3.8'

services:
  runqy:
    image: ghcr.io/publikey/runqy:latest
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PASSWORD=
      - RUNQY_API_KEY=your-api-key
      - PROMETHEUS_ADDRESS=http://prometheus:9090  # Optional
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana

volumes:
  grafana-data:
```

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'runqy'
    static_configs:
      - targets: ['runqy:3000']
```

## Alerting

### Prometheus AlertManager

Example alert rules (`alerts.yml`):

```yaml
groups:
  - name: runqy
    rules:
      # High queue depth
      - alert: HighQueueDepth
        expr: asynq_queue_size{state="pending"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High queue depth on {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} has {{ $value }} pending tasks"

      # High error rate
      - alert: HighErrorRate
        expr: >
          rate(asynq_tasks_failed_total[5m]) / rate(asynq_tasks_processed_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} has {{ $value | humanizePercentage }} error rate"

      # Queue latency
      - alert: HighQueueLatency
        expr: asynq_queue_latency_seconds > 300
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} has {{ $value | humanizeDuration }} latency"

      # No tasks processed (potential worker issue)
      - alert: NoTasksProcessed
        expr: >
          increase(asynq_tasks_processed_total[10m]) == 0
          and asynq_queue_size{state="pending"} > 0
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "No tasks processed on {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} has pending tasks but none processed in 10 minutes"
```

### Key Metrics to Monitor

| Metric | Alert Threshold | Description |
|--------|----------------|-------------|
| Queue depth | > 1000 pending | Tasks accumulating faster than processing |
| Error rate | > 10% | High failure rate indicates issues |
| Queue latency | > 5 minutes | Tasks waiting too long |
| Worker health | `healthy: false` | Worker process crashed |

## Best Practices

1. **Start with the dashboard** - The built-in dashboard covers most monitoring needs
2. **Add Prometheus for scale** - When you need historical data beyond 90 days or sub-second metrics
3. **Set up alerts early** - Don't wait for production issues to configure alerting
4. **Monitor worker health** - A crashed worker won't process tasks and won't recover automatically
5. **Track error rates** - Sudden spikes often indicate code bugs or upstream service issues
