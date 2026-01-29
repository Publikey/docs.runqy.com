# Monitoring

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
redis-cli LLEN asynq:inference_default:pending

# List pending task IDs
redis-cli LRANGE asynq:inference_default:pending 0 -1
```

### Active Tasks

```bash
# Count active tasks
redis-cli LLEN asynq:inference_default:active

# List active task IDs
redis-cli LRANGE asynq:inference_default:active 0 -1
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

## Prometheus Metrics

For production monitoring, consider adding Prometheus metrics to your worker:

```go
// Example: Expose metrics endpoint
http.Handle("/metrics", promhttp.Handler())
go http.ListenAndServe(":9090", nil)
```

Common metrics to track:

- `runqy_tasks_processed_total` — Counter of processed tasks
- `runqy_task_duration_seconds` — Histogram of task duration
- `runqy_worker_healthy` — Gauge (1 = healthy, 0 = unhealthy)
- `runqy_queue_pending_tasks` — Gauge of pending tasks per queue

## Alerting

Set up alerts for:

- **Worker unhealthy**: `runqy_worker_healthy == 0`
- **High queue depth**: `runqy_queue_pending_tasks > threshold`
- **Task failures**: `rate(runqy_tasks_failed_total[5m]) > threshold`
- **Slow tasks**: `histogram_quantile(0.95, runqy_task_duration_seconds) > threshold`
