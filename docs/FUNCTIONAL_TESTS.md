# Functional Test Plan

Manual (or LLM-assisted) test plan for runqy. Requires a running server, Redis, and PostgreSQL.

## Prerequisites

```bash
# 1. Start Redis on localhost:6379
# 2. Start PostgreSQL
# 3. Configure environment
cd runqy/app
cp .env.secret.sample .env.secret
# Edit .env.secret with credentials

# 4. Build and start server
go build -o runqy .
./runqy serve

# 5. Set API key for CLI tests (used with -s and -k flags for remote mode)
export RUNQY_API_KEY="your-api-key"
export RUNQY_SERVER="http://localhost:3000"
```

!!! note "CLI remote mode"
    Most CLI commands operate in **remote mode** and require `-s $RUNQY_SERVER -k $RUNQY_API_KEY` flags (or the `./runqy login` flow). The examples below omit these flags for brevity.

!!! note "WebUI authentication"
    The monitoring dashboard at `localhost:3000/monitoring` requires login. Navigate to `localhost:3000` first — you will be redirected to a login page.

---

## Section A — CLI

### A1. Build & Startup

| # | Command | Expected |
|---|---------|----------|
| 1 | `cd runqy/app && go build -o runqy .` | Build succeeds, binary created |
| 2 | `./runqy serve` | Log shows "Server started on :3000" |

### A2. Queue Management

| # | Command | Expected |
|---|---------|----------|
| 1 | `./runqy config create --name testqueue --mode one_shot --startup-cmd "python main.py" --git-url "https://github.com/example/repo"` | Success |
| 2 | `./runqy queue list` | Output contains "testqueue" |
| 3 | `./runqy queue inspect testqueue.default` | Shows pending, active, completed counts |
| 4 | `./runqy queue pause testqueue.default` | Success message |
| 5 | `./runqy queue unpause testqueue.default` | Success message |

### A3. Task Lifecycle

| # | Command | Expected |
|---|---------|----------|
| 1 | `./runqy task enqueue -q testqueue -p '{"msg":"hello"}'` | Returns task ID |
| 2 | `./runqy task list testqueue.default` | Contains the task |
| 3 | `./runqy task get testqueue.default <task_id>` | JSON details |
| 4 | `./runqy task cancel <task_id>` | Success |
| 5 | `./runqy task delete <queue> <task_id>` | Success |

### A4. Vault Management

| # | Step | Expected |
|---|------|----------|
| 1 | `./runqy vault list` (without RUNQY_VAULT_MASTER_KEY) | Message with hint `openssl rand -base64 32` |
| 2 | Export `RUNQY_VAULT_MASTER_KEY=$(openssl rand -base64 32)` and restart server | Server starts with vaults enabled |
| 3 | `./runqy vault create myvault` | Success |
| 4 | `./runqy vault list` | Contains "myvault" |
| 5 | `./runqy vault set myvault apikey secret123` | Success |
| 6 | `./runqy vault get myvault apikey` | Outputs "secret123" (local mode only — blocked in remote mode by design) |
| 7 | `./runqy vault entries myvault` | Shows "apikey" with masked value |
| 8 | `./runqy vault unset myvault apikey` | Success |
| 9 | `./runqy vault delete myvault --force` | Success |

### A5. Input Validation

| # | Command | Expected Error |
|---|---------|---------------|
| 1 | `./runqy queue inspect ""` | "queue name cannot be empty" |
| 2 | `./runqy task list q --state pendingg` | "invalid state 'pendingg', valid: pending, active, ..." |
| 3 | `./runqy task list q --limit -1` | "--limit must be positive" |
| 4 | `./runqy task list q --limit 0` | "--limit must be positive" |
| 5 | `./runqy task enqueue -q q -p '{}' --timeout -100` | "--timeout must be positive" |
| 6 | `./runqy config create test --mode invalid` | "invalid mode 'invalid', must be 'long_running' or 'one_shot'" |
| 7 | `./runqy vault create ""` | "vault name cannot be empty" |
| 8 | `./runqy vault set "" "" ""` | "vault name cannot be empty" |

### A6. Worker (optional)

| # | Step | Expected |
|---|------|----------|
| 1 | `cd runqy-worker && go build ./cmd/worker` | Build succeeds |
| 2 | Start worker with config pointing to server | "Worker registered" log |
| 3 | Enqueue a task to the worker's queue | Task processed, result in Redis |

---

## Section B — API (curl)

Runqy exposes **two separate APIs** with different auth mechanisms:

1. **Main API** (`/queue/*`, `/worker/*`, `/workers/*`, `/api/vaults/*`) — auth via `X-API-Key` header
2. **Monitoring API** (`/monitoring/api/*`) — auth via cookie JWT (setup + login flow)

### B0. Monitoring Auth Setup

Before testing monitoring endpoints, set up authentication:

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl localhost:3000/monitoring/api/auth/status` | `{"authenticated":false,"setup_required":true}` |
| 2 | `curl -X POST localhost:3000/monitoring/api/auth/setup -H 'Content-Type: application/json' -d '{"email":"admin@test.com","password":"password123","confirm_password":"password123"}'` | 200, admin created |
| 3 | `curl -c cookies.txt -X POST localhost:3000/monitoring/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@test.com","password":"password123"}'` | 200, `Set-Cookie: runqy_auth=...` |

!!! note "Auth types"
    Main API examples below use `-H "X-API-Key: $RUNQY_API_KEY"`.
    Monitoring API examples use `-b cookies.txt` (cookie from B0 login).

### B1. Health & System

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl localhost:3000/health` | 200 OK |
| 2 | `curl -b cookies.txt localhost:3000/monitoring/api/redis_info` | 200, JSON with Redis version, uptime, clients |
| 3 | `curl -b cookies.txt localhost:3000/monitoring/api/database_info` | 200, JSON with connection info |

### B2. Queue Endpoints (Monitoring API)

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -b cookies.txt localhost:3000/monitoring/api/queues` | 200, JSON object `{"queues":[...]}` |
| 2 | `curl -b cookies.txt localhost:3000/monitoring/api/queues/testqueue.default` | 200, queue details |
| 3 | `curl -X POST -b cookies.txt localhost:3000/monitoring/api/queues/testqueue.default:pause` | 204 No Content |
| 4 | `curl -X POST -b cookies.txt localhost:3000/monitoring/api/queues/testqueue.default:resume` | 204 No Content |

### B3. Queue Config Endpoints (Monitoring API)

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -b cookies.txt localhost:3000/monitoring/api/queue_configs` | 200, list of configs |
| 2 | `curl -b cookies.txt localhost:3000/monitoring/api/queue_configs/testqueue` | 200, config details |
| 3 | `curl -X POST -b cookies.txt localhost:3000/monitoring/api/queue_configs -H 'Content-Type: application/json' -d '{"name":"apitest","mode":"one_shot","startup_cmd":"python main.py","priority":1}'` | 201 |
| 4 | `curl -X DELETE -b cookies.txt localhost:3000/monitoring/api/queue_configs/apitest` | 200 |

!!! note "Required fields"
    Queue config create requires `priority` (minimum 1).

### B4. Task Endpoints

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -X POST -H "X-API-Key: $RUNQY_API_KEY" -H 'Content-Type: application/json' localhost:3000/queue/add -d '{"queue":"testqueue","data":{"msg":"curl-test"}}'` | 200, returns `{"info":{"id":"..."},...,"data":{...}}` |
| 2 | `curl -b cookies.txt localhost:3000/monitoring/api/queues/testqueue.default/pending_tasks` | 200, task list |
| 3 | `curl -X DELETE -b cookies.txt localhost:3000/monitoring/api/queues/testqueue.default/pending_tasks/<task_id>` | 200 |

!!! note "Task enqueue response"
    The task ID is at `info.id` in the response JSON (not a top-level `task_id` field).

### B5. Worker Endpoints

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -H "X-API-Key: $RUNQY_API_KEY" localhost:3000/api/workers` | 200, JSON array |
| 2 | `curl -H "X-API-Key: $RUNQY_API_KEY" localhost:3000/api/servers` | 200, JSON array |
| 3 | `curl -b cookies.txt localhost:3000/monitoring/api/servers` | 200, JSON array (same data via monitoring route) |

### B6. Vault Endpoints (Main API)

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -H "X-API-Key: $RUNQY_API_KEY" localhost:3000/api/vaults` | 200, list |
| 2 | `curl -X POST -H "X-API-Key: $RUNQY_API_KEY" -H 'Content-Type: application/json' localhost:3000/api/vaults -d '{"name":"apivault","description":"test"}'` | 201 |
| 3 | `curl -H "X-API-Key: $RUNQY_API_KEY" localhost:3000/api/vaults/apivault` | 200, vault details |
| 4 | `curl -X POST -H "X-API-Key: $RUNQY_API_KEY" -H 'Content-Type: application/json' localhost:3000/api/vaults/apivault/entries -d '{"key":"secret","value":"val123","is_secret":true}'` | 200 |
| 5 | `curl -X DELETE -H "X-API-Key: $RUNQY_API_KEY" localhost:3000/api/vaults/apivault/entries/secret` | 200 |
| 6 | `curl -X DELETE -H "X-API-Key: $RUNQY_API_KEY" localhost:3000/api/vaults/apivault` | 200 |

### B7. Error Format Consistency

Main API (`/queue/*`, `/api/vaults/*`) returns errors in array format:

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -H "X-API-Key: ..." localhost:3000/api/vaults/nonexistent` | 404, `{"errors":["vault not found"]}` |
| 2 | `curl -X POST -H "X-API-Key: ..." localhost:3000/queue/add -d '{}'` | 400, `{"errors":["queue is required"]}` |
| 3 | Request without auth header on protected endpoint | 401, `{"errors":["access unauthorized"]}` |

!!! warning "Known inconsistency"
    Monitoring API (`/monitoring/api/*`) returns `{"error":"..."}` (singular string) instead of `{"errors":[...]}` (array). The monitoring handler was not yet migrated to the bulletproof error format.

### B8. Status Codes

| # | Scenario | Expected Code |
|---|----------|--------------|
| 1 | Queue not found (monitoring API) | 404 |
| 2 | Vault not found (main API) | 404 |
| 3 | Invalid payload | 400 |
| 4 | Missing auth (main API) | 401 |
| 5 | Missing auth (monitoring API) | 401 "Unauthorized" |

!!! note "Task poll"
    `GET /queue/<uuid>` is a **long-poll** endpoint — it blocks until the task completes or the connection drops. There is no 408 timeout response; the client controls the timeout.

### B9. Batch Enqueue

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -X POST -H "X-API-Key: ..." -H 'Content-Type: application/json' localhost:3000/queue/add-batch -d '{"queue":"testqueue","jobs":[{"data":{"i":1}},{"data":{"i":2}}]}'` | 200, `{"enqueued":2,"failed":0,"task_ids":[...]}` |
| 2 | Empty jobs: `-d '{"queue":"testqueue","jobs":[]}'` | 400 |
| 3 | Missing fields: `-d '{}'` | 400, validation error |

!!! note "Batch format"
    Batch enqueue uses `{"queue":"...", "jobs":[...]}` — a single queue name with an array of job objects. Each job contains `data` and optional fields. This is **not** `{"tasks":[{"queue":...}]}`.

### B10. Auth on Previously Public Routes

These routes were public before `bulletproof` and now require API key authentication:

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl localhost:3000/queue/<task_uuid>` (no auth) | 401, `{"errors":["access unauthorized"]}` |
| 2 | `curl localhost:3000/workers/config/<queue_name>` (no auth) | 401, `{"errors":["access unauthorized"]}` |
| 3 | Same with `-H "X-API-Key: $RUNQY_API_KEY"` | 200, expected response |

!!! note "Long-poll caveat"
    `GET /queue/<uuid>` with auth is a long-poll endpoint. It will block until the task is processed by a worker. Use `--max-time` with curl to avoid indefinite hangs.

### B11. Body Size Limit

| # | Command | Expected |
|---|---------|----------|
| 1 | `curl -X POST localhost:3000/queue/add -d '<payload > 50MB>'` | 413 or connection reset |
| 2 | Normal-sized payload after large one | 200, server still healthy |

### B12. Input Validation (API)

| # | Command | Expected |
|---|---------|----------|
| 1 | `POST /queue/add` with special chars in queue name `{"queue":"test;drop"}` | Returns "queue not found" (no queue name char validation — the name passes through but the config doesn't exist) |
| 2 | `POST /api/vaults/v/entries` with empty key `{"key":"","value":"x"}` | 400, validation error |

---

## Section C — WebUI Monitoring (Playwright)

Prerequisites: server running on `localhost:3000`, Playwright MCP available, logged in to monitoring dashboard.

### C1. Navigation & Layout

| # | Action | Expected |
|---|--------|----------|
| 1 | Navigate to `http://localhost:3000` | Dashboard loads |
| 2 | Sidebar visible | Links: Dashboard, Queues, Workers, Vaults, System, Settings |
| 3 | Click each sidebar link | Corresponding page loads |
| 4 | Toggle sidebar collapse | Sidebar collapses/expands |

### C2. Dashboard (`/`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Page loads | Stat cards: Queues, Pending, Active, Processed, Failed, Workers |
| 2 | Click "Queues" stat card | Navigates to `/queues` |
| 3 | Click "Workers" stat card | Navigates to `/workers` |
| 4 | Click Refresh button | "Last updated" timestamp updates |
| 5 | If queues exist | Queue cards in grid |
| 6 | Toggle Group/Ungroup | Sub-queues group/ungroup |
| 7 | Click queue card | Navigates to `/queues/<qname>` |

### C3. Queues Page (`/queues`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Page loads | Queue list displayed |
| 2 | Toggle Cards/Table | View switches |
| 3 | Toggle Grouped/Ungrouped | Display changes |
| 4 | Filter: All, Running, Paused | Queues filtered |
| 5 | Search field | Filters by name |
| 6 | Click "Create Queue" | QueueConfigModal opens |
| 7 | Fill name "playwright-test", mode "one_shot", startup cmd "echo ok" | Fields filled |
| 8 | Click Create | Modal closes, toast success, queue appears |
| 9 | Click Pause on a queue | Badge changes to "Paused" |
| 10 | Click Resume | Badge changes to "Running" |
| 11 | Click Delete | Confirmation dialog appears |
| 12 | Confirm delete | Queue removed, toast success |

### C4. Queue Detail (`/queues/:qname`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Navigate to existing queue | Queue name and status badge shown |
| 2 | Tabs visible | Active, Pending, Retry, Archived, Completed |
| 3 | Click each tab | Table updates |
| 4 | Click task ID (if tasks exist) | Row expands, payload JSON visible |
| 5 | Click Copy ID | Copied to clipboard |
| 6 | Checkbox selection | Bulk action buttons appear |
| 7 | Select All | All tasks selected |
| 8 | Search field | Filters tasks |
| 9 | Per-task actions | Cancel, Archive, Delete, Run (depending on tab) |
| 10 | Bulk actions | Bulk Delete, Bulk Archive, Bulk Run + confirmation |
| 11 | Batch actions | Delete All, Archive All, Run All + confirmation |
| 12 | Pause/Resume in header | Queue state toggles |

### C5. Workers Page (`/workers`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Page loads | Worker list (table or cards) |
| 2 | Toggle Cards/Table | View switches |
| 3 | Filters | All, Processing, Idle, Bootstrapping, Stale, Stopped |
| 4 | If workers exist | Status badge visible, click navigates to detail |
| 5 | If no workers | Empty state displayed |

### C6. Worker Detail (`/workers/:id`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Page loads | Worker ID, status badge |
| 2 | Info section | Concurrency, Started, Last beat |
| 3 | Queue badges | Queues listed |
| 4 | Metrics (if available) | CPU %, Memory, Processes |
| 5 | Log section | SSE streaming logs |
| 6 | Toggle "Pin to bottom" | Auto-scroll behavior |
| 7 | Click Back | Returns to `/workers` |

### C7. Vaults Page (`/vaults`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Without RUNQY_VAULT_MASTER_KEY | "Feature disabled" message |
| 2 | With key configured, page loads | Vault list in grid |
| 3 | Search field | Filters by name |
| 4 | Click "Create Vault" | Modal opens |
| 5 | Fill name "pw-vault", description "test" | Fields filled |
| 6 | Click Create | Vault appears, toast success |
| 7 | Click vault card | Navigates to `/vaults/pw-vault` |

### C8. Vault Detail (`/vaults/:name`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Page loads | Name and description shown |
| 2 | Entries table | Empty initially |
| 3 | Click "Add Entry" | EntryModal opens |
| 4 | Fill key "mykey", value "myval", toggle Secret ON | Fields filled |
| 5 | Click Create | Entry appears in table |
| 6 | Secret value display | Masked (****) |
| 7 | Click Edit on entry | Modal pre-filled, key read-only |
| 8 | Modify value, click Update | Table updated |
| 9 | Click Delete on entry | Confirmation dialog, entry removed |
| 10 | Click "Delete Vault" | Confirmation dialog, redirects to `/vaults` |

### C9. Settings Page (`/settings`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Click Light theme | Theme changes to light |
| 2 | Click Dark theme | Theme changes to dark |
| 3 | Click System theme | Theme follows system |
| 4 | Toggle Comfortable/Compact | Layout density changes |
| 5 | Change poll interval | Dropdown reflects choice |
| 6 | Sidebar collapse toggle | Sidebar state changes |
| 7 | Click Reset | All settings return to defaults |

### C10. System Page (`/system`)

| # | Action | Expected |
|---|--------|----------|
| 1 | Redis Status card | Badge: Connected/Disconnected |
| 2 | If connected | Address, Version, Uptime, Clients shown |
| 3 | Database Status card | Badge with connection status |
| 4 | If connected | Type, Host, Database, Connections shown |
| 5 | Redis Memory section | Memory metrics displayed |
| 6 | Raw Redis Info | Collapsible section, click to toggle |

### C11. Error & Empty States

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Queues page, no queues | Empty state visible |
| 2 | Workers page, no workers | Empty state visible |
| 3 | Vaults page, no vaults | Empty state with "Create your first vault" CTA |
| 4 | Vault detail, no entries | Empty state visible |

### C12. Responsive & Toasts

| # | Action | Expected |
|---|--------|----------|
| 1 | Successful CRUD action | Toast success appears |
| 2 | Failed action | Toast error appears |
| 3 | Click modal backdrop or Cancel | Modal closes |
