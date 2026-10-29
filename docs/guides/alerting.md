---
title: "Email Alerts for Queues and Workers"
description: "Get emailed when a runqy queue has no workers, backs up, has an unhealthy worker or fails to autoscale. SMTP or SendGrid, with per-queue overrides."
---

# Email Alerts

runqy watches your queues and **emails you when something needs attention**: a queue with
pending jobs and no worker, jobs waiting too long, a degraded worker, a failed autoscaling
attempt. Notifications go through **SMTP** or **SendGrid**.

Alerts are configured in two layers:

- **Global settings**: delivery (provider, sender, recipients) and the **default rules** for every queue.
- **Per-queue overrides**: mute a queue, or tighten, add or turn off rules for it.

## Quick start

Add a top-level `alerts` block to one of your queue YAML files:

```yaml
alerts:
  enabled: true
  provider: smtp
  from: "runqy <alerts@example.com>"
  recipients:
    - ops@example.com
  smtp:
    host: smtp.example.com
    port: 587
    tls: starttls
    username: alerts@example.com
    password: "vault://mail/smtp_password"
  rules:
    - type: no_workers
      for: 2m
    - type: latency
      max_latency: 10m
    - type: worker_unhealthy
      for: 2m
    - type: autoscale_failure

queues:
  inference:
    # ...
```

Reload and send yourself a test email:

```bash
runqy config reload
runqy alerts test
```

A complete example lives in [`examples/alerts.yaml`](https://github.com/Publikey/runqy/blob/main/examples/alerts.yaml).

## Where settings live

The global settings are stored in the database. You can write them from either place:

- **YAML**: the top-level `alerts` block, applied on server start and on every `runqy config reload`
  (and by the config watcher). Define it in **one** file only; more than one is an error.
- **Dashboard**: the **Alerts** page has the same form, a test button, the active alerts and the
  notification history.

!!! note "YAML wins on reload"
    Both write the same settings, so changes made in the dashboard are replaced the next time a
    YAML file containing an `alerts` block is reloaded. If you manage alerts from the dashboard,
    leave the block out of your YAML.

## Delivery

### SMTP

```yaml
alerts:
  provider: smtp
  smtp:
    host: smtp.example.com
    port: 587           # default: 587 (starttls), 465 (tls), 25 (none)
    tls: starttls       # starttls (default) | tls | none
    username: alerts@example.com
    password: "vault://mail/smtp_password"
```

- `starttls` (default) **requires** the server to offer STARTTLS; runqy never sends credentials
  over an unencrypted connection by accident.
- `tls` connects with implicit TLS (port 465).
- `none` is for local relays and test inboxes (e.g. Mailpit on port 1025).

### SendGrid

```yaml
alerts:
  provider: sendgrid
  sendgrid:
    api_key: "vault://mail/sendgrid_api_key"
```

The sender address must be a verified sender in your SendGrid account.

### Secrets

The SMTP password and the SendGrid API key accept three forms:

| Form | Example | Notes |
|------|---------|-------|
| Vault reference | `vault://mail/smtp_password` | Recommended. Resolved at send time from a [vault](vaults.md) |
| Empty | — | Falls back to `RUNQY_SMTP_PASSWORD` / `RUNQY_SENDGRID_API_KEY` on the server |
| Literal value | `hunter2` | Only accepted when `RUNQY_VAULT_MASTER_KEY` is set; then stored encrypted |

In the dashboard, literal secrets are shown masked. Saving the form without retyping them keeps
the stored value.

## Rules

| Type | Fields | Fires when |
|------|--------|------------|
| `no_workers` | `when_idle` | Jobs are pending and **no live worker** serves the queue. With `when_idle: true`, also when nothing is pending. |
| `latency` | `max_latency` | The **oldest pending job** has waited longer than `max_latency` |
| `pending` | `threshold` | More than `threshold` jobs are pending |
| `worker_unhealthy` | — | A worker serving the queue reports `healthy: false`: its Python process is down (crashed, being restarted by auto-recovery, or [degraded](../worker/configuration.md#degraded-state) after repeated crashes). Add `for: 2m` to ignore quick automatic restarts. |
| `autoscale_failure` | — | The [autoscaler](autoscaling.md) failed to provision an instance, is missing a prerequisite, or destroyed an instance that never became ready or lost its worker |

Every rule except `autoscale_failure` accepts `for`: how long the condition must hold
**continuously** before the alert fires (default `0`). Use it to ride out short blips, e.g. an
autoscaled queue whose first worker takes a few minutes to boot:

```yaml
rules:
  - type: no_workers
    for: 5m
```

!!! info "Paused queues are skipped"
    A paused queue is expected to accumulate jobs, so no rule is evaluated for it. An alert
    that was firing when the queue got paused (or muted, removed, or its rule removed) is
    closed with a `RESOLVED` email giving the reason, so no alert is left open.

## Per-queue overrides

Add an `alerts` block next to the queue's `deployment` (or use the **Alerts** section of the queue
configuration in the dashboard):

```yaml
queues:
  reports:
    priority: 1
    deployment:
      # ...
    alerts:
      rules:
        - type: latency          # replaces the global latency rule for this queue
          max_latency: 2m
        - type: pending          # only for this queue
          threshold: 500
        - type: worker_unhealthy # turned off for this queue
          disabled: true

  nightly-batch:
    priority: 1
    deployment:
      # ...
    alerts:
      disabled: true             # mute every alert for this queue
```

A queue rule **replaces** the global rule of the same type; global rules it doesn't mention still
apply. `disabled: true` on a rule turns that type off; `disabled: true` on the block mutes the queue.

## Notifications

- **One email per evaluation.** Everything that changed in a cycle is grouped into a single
  digest, whose subject names the affected queues (`[runqy] 2 firing — inference, reports`).
- **Resolved.** When a firing alert clears, you get a `RESOLVED` email (`send_resolved: false` to disable).
- **Reminders.** A still-firing alert is re-sent every `repeat_interval` (default `4h`; `"0"` = once).
- **Events.** `autoscale_failure` events are grouped per queue and throttled to one email per
  `repeat_interval` (at least one hour when it is `0`).
- **Retries.** If sending fails, the notification is retried on the next evaluation, and the error
  is shown on the Alerts page and in `runqy alerts status`.

Emails include a link to the queue in the dashboard when `RUNQY_PUBLIC_URL` is set.

### Settings reference

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Turn alerting on |
| `provider` | — | `smtp` or `sendgrid` |
| `from` | — | Sender, e.g. `"runqy <alerts@example.com>"` |
| `recipients` | — | List of addresses |
| `smtp` / `sendgrid` | — | Delivery settings (see above) |
| `rules` | — | Default rules for every queue |
| `repeat_interval` | `4h` | Re-send a still-firing alert (`"0"` = once) |
| `send_resolved` | `true` | Email when an alert clears |

## How evaluation works

Rules are evaluated **every 30 seconds** by one server (a Redis lock elects it when several
servers share one Redis). Alert state is kept in Redis, so a server restart or a leader change
neither re-sends firing alerts nor loses pending `RESOLVED` notifications.

## CLI and API

```bash
runqy alerts status          # active alerts + recent notifications
runqy alerts status --history 100
runqy alerts test            # test email with the saved settings
```

```
Alerting: enabled
Last evaluation: 2026-10-14T11:58:21+02:00

STATE   QUEUE      RULE        SINCE  DETAILS
FIRING  inference  no_workers  2m10s  no live worker is serving the queue (3 job(s) pending)
```

The REST endpoints (admin API key) are listed in the [API Reference](../server/api.md#alert-endpoints).

## Prometheus alternative

runqy also exports queue metrics at `/metrics`. If you already run Prometheus and Alertmanager,
you can alert from there instead (see [Monitoring](monitoring.md#alerting)). Built-in alerts
need no extra infrastructure and know about workers and autoscaling.
