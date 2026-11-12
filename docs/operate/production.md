---
title: "Production deployment"
description: "A checklist for running the runqy server in production: database, Redis, reverse proxy, health checks, several servers, backups and logs."
---

# Production deployment

This page is a checklist for running the runqy server for real. Each section states what the server does and what follows for your deployment. Access control is covered separately in [Security](security.md), and version changes in [Upgrading and compatibility](upgrading.md).

## Checklist

- PostgreSQL, not SQLite, with `DATABASE_DBNAME` and `DATABASE_SSL` set explicitly.
- Redis reachable from every worker at the address configured on the server, with a password, persistence and no key eviction.
- `RUNQY_API_KEY`, `RUNQY_WORKER_API_KEY` and `RUNQY_CLIENT_API_KEY` set to three different random values.
- `RUNQY_JWT_SECRET` set, so dashboard sessions survive restarts.
- `RUNQY_VAULT_MASTER_KEY` set and stored outside the database, if you use vaults, autoscaling providers or encrypted alert secrets.
- `RUNQY_PUBLIC_URL` set to the URL workers and people use to reach the server.
- A reverse proxy that terminates TLS, with `/metrics` restricted.
- Health checks on `/healthz`.
- Backups of the database, and the vault master key kept somewhere safe.
- Pinned image tags for the server and the workers.

Every variable named here is described in the [server configuration reference](../reference/server-config.md).

## A minimal production container

```bash
docker run -d --name runqy --restart unless-stopped -p 127.0.0.1:3000:3000 \
  -e REDIS_HOST=redis.example.internal \
  -e REDIS_PORT=6379 \
  -e REDIS_PASSWORD=<redis-password> \
  -e REDIS_TLS=true \
  -e DATABASE_HOST=postgres.example.internal \
  -e DATABASE_USER=runqy \
  -e DATABASE_PASSWORD=<database-password> \
  -e DATABASE_DBNAME=runqy \
  -e DATABASE_SSL=require \
  -e RUNQY_API_KEY=<admin-key> \
  -e RUNQY_WORKER_API_KEY=<worker-key> \
  -e RUNQY_CLIENT_API_KEY=<client-key> \
  -e RUNQY_JWT_SECRET=<random-string> \
  -e RUNQY_VAULT_MASTER_KEY=<output of openssl rand -base64 32> \
  -e RUNQY_PUBLIC_URL=https://runqy.example.com \
  -e QUEUE_WORKERS_DIR=/app/queues \
  -v /srv/runqy/queues:/app/queues:ro \
  ghcr.io/publikey/runqy:v0.4.5
```

Drop `REDIS_TLS` if your Redis does not use TLS. The port is published on `127.0.0.1` only, because the reverse proxy on the same host is the public entry point.

The released image does not set `QUEUE_WORKERS_DIR`, and the default (`../queueworkers`, relative to the working directory) does not exist in it. Set the variable and mount your queue YAML files as above, or manage queues through the API, the CLI or the dashboard only.

!!! warning "A .env file overrides the environment"
    At startup the `runqy` binary loads `../.env.secret` if it exists, otherwise `.env` in the working directory, and the values in the file replace variables already set in the environment. Do not leave such a file next to a production server.

## Database

The server stores its configuration in a SQL database: queue configs and sub-queues, vaults and their encrypted entries, autoscaling providers and instances, alert settings and the dashboard admin account. Tasks are not stored there.

Use PostgreSQL in production:

- SQLite (`--sqlite` or `RUNQY_USE_SQLITE=true`) is a file on the server's local disk. It cannot be shared between several servers, and it is lost with the container unless you mount a volume for it.
- In local mode, the CLI commands `runqy config`, `runqy queue` and `runqy task` connect to PostgreSQL directly and do not support SQLite.

Settings worth changing from their defaults:

| Variable | Default | Why change it |
|----------|---------|---------------|
| `DATABASE_DBNAME` | `sdxl_queuing_dev` | The default is a development name. Create your own database and name it here. |
| `DATABASE_SSL` | `disable` | Set a PostgreSQL `sslmode` such as `require` when the database is on another host. |
| `DATABASE_USER` | `postgres` | Use a dedicated role that owns the runqy database. |

The server creates its tables at startup if they are missing and applies its own schema migrations then, so the database role needs the right to create and alter tables in that database. There is no separate migration command. The server opens at most 25 connections.

## Redis

Redis holds everything about tasks: the pending lists, each task's payload and result, retry and schedule sets, worker heartbeats and logs, and the state of the autoscaler and the alert evaluator. The server always uses database `0`.

**Reachability.** At registration, the server sends each worker the Redis address it is itself configured with (`REDIS_HOST:REDIS_PORT`), the password and whether to use TLS. Workers then connect to Redis directly. Set `REDIS_HOST` to a name that resolves from the worker machines too, not `localhost` or a hostname private to the server's Docker network.

**TLS and password.** Set `REDIS_PASSWORD`, and `REDIS_TLS=true` when Redis is reached over an untrusted network; workers receive the TLS setting and use it as well. TLS 1.2 is the minimum.

**Persistence.** If Redis loses its data, pending and scheduled tasks are gone, and so are stored results. Enable persistence (AOF or RDB snapshots) according to how many tasks you can afford to lose.

**Eviction.** Do not let Redis evict keys. With an eviction policy other than `noeviction`, a full Redis silently deletes task data.

**Memory.** Memory grows with the number of tasks kept and the size of their payloads and results. Finished tasks stay until their TTL expires: 24 hours for completed tasks and 72 hours for failed ones by default. Shorten `ttl_completed` and `ttl_archived` for queues with large results, and keep large inputs and outputs (images, video) in object storage, passing URLs in payloads. See [Task lifecycle](../guides/task-lifecycle.md).

## API keys and secrets

| Variable | What happens without it |
|----------|-------------------------|
| `RUNQY_API_KEY` | Every authenticated endpoint rejects every request. The server logs a warning at startup. |
| `RUNQY_WORKER_API_KEY` | Workers must use the admin key. Autoscaling on real providers refuses to provision. |
| `RUNQY_CLIENT_API_KEY` | Applications that enqueue tasks must use the admin key. |
| `RUNQY_JWT_SECRET` | A random secret is generated at each start: every dashboard session ends when the server restarts. |
| `RUNQY_VAULT_MASTER_KEY` | Vaults are disabled, and queues that reference a vault cannot register workers. An invalid key also disables vaults; the server logs an error. |
| `RUNQY_PUBLIC_URL` | Autoscaling on real providers refuses to provision, and alert emails have no link to the dashboard. |

Generate the vault key with `openssl rand -base64 32`. What each API key can do is described in [Security](security.md#api-keys).

## Reverse proxy and TLS

The server speaks plain HTTP. Put a reverse proxy in front of it to terminate TLS. Three settings matter:

- **Read timeout above 30 seconds.** `GET /queue/<task-id>?wait=true` holds the request for up to 30 seconds before answering.
- **Request body size.** The server accepts bodies up to 50 MB (`RUNQY_MAX_BODY_SIZE`, in bytes). Many proxies default to much less; raise the limit if your payloads or batches are large.
- **`/metrics` and `/swagger`** need no API key. Restrict them to your monitoring system or your internal network.

A minimal nginx server block:

```nginx
server {
    listen 443 ssl;
    server_name runqy.example.com;

    ssl_certificate     /etc/ssl/certs/runqy.example.com.pem;
    ssl_certificate_key /etc/ssl/private/runqy.example.com.key;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 75s;
    }

    location /metrics {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://127.0.0.1:3000;
    }

    location /swagger {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Workers only call the server over HTTP to register (and again on a `code-update`). Their task traffic goes to Redis, so the proxy does not sit on the task path.

## Health checks

Both endpoints need no API key.

| Endpoint | Checks | Response |
|----------|--------|----------|
| `GET /health` | The HTTP server answers. | `200` with `{"status":"ok","timestamp":"..."}` |
| `GET /healthz` | Redis answers a ping. | `200` with `"status":"ok","redis":true`, or `503` with `"status":"degraded","redis":false` |

Use `/healthz` for load balancer and orchestrator checks. Neither endpoint checks the database.

For queue-level monitoring (pending tasks, latency, workers), see [Monitoring](../guides/monitoring.md) and [Email alerts](../guides/alerting.md).

## Running more than one server

Several runqy servers can run against the same Redis and the same PostgreSQL database, behind a load balancer. The two background loops are protected by leader locks in Redis:

- the autoscaler (`runqy:autoscale:leader`),
- the alert evaluator (`runqy:alerts:leader`).

Only the server holding a lock runs that loop. When it stops cleanly it releases the lock; if it crashes, another server takes over once the lock expires (about a minute for alerts).

Give every server the same configuration, in particular:

- `RUNQY_JWT_SECRET`: otherwise a dashboard session created by one server is rejected by the others.
- `RUNQY_VAULT_MASTER_KEY`: otherwise vault entries written by one server cannot be read by the others.
- The API keys, `RUNQY_PUBLIC_URL` and the queue YAML files.

## What to back up

| What | Why |
|------|-----|
| The PostgreSQL database | Queue configs, vault entries, autoscaling providers, alert settings, the dashboard account. |
| `RUNQY_VAULT_MASTER_KEY` | Without it, vault entries and provider credentials in the database cannot be decrypted. Keep it in a secrets manager, not in the database backup. |
| Your queue YAML files | If you manage queues as files, keep them in version control. The server can also load them from a git repository (`--config-repo`). |
| Redis (optional) | Only if you need pending tasks and stored results to survive the loss of the Redis server. |

## Logging

The server writes its logs to the standard streams of the process; collect them with Docker, systemd or your orchestrator. By default it logs errors and events (rejected queue files, vault resolution, autoscaler and alert activity) but not HTTP requests. `runqy serve --debug` adds a line per request and detailed startup messages; use your reverse proxy's access log for request logging in production.

Workers log to stderr, including the output of the task process. The most recent task process logs are also visible per worker in the dashboard.

## Related

- [Security](security.md)
- [Upgrading and compatibility](upgrading.md)
- [Deploying workers](../guides/deploying-workers.md)
- [Server configuration reference](../reference/server-config.md)
