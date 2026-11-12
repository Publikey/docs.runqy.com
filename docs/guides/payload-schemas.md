---
title: "Payload schemas"
description: "Declare the fields a queue expects in its payload so the runqy server rejects malformed tasks at enqueue time."
---

# Payload schemas

A queue config can list the fields its tasks expect. The runqy server then checks each payload sent to `POST /queue/add` and rejects the ones that do not match, before they reach a worker. This guide shows how to declare a schema, what is checked, and where the check does not apply.

## Declare the input schema

Add an `input` list to the queue in its YAML file, at the same level as `deployment`:

```yaml
queues:
  inference:
    priority: 5
    deployment:
      git_url: "https://github.com/example/my-tasks.git"
      branch: "main"
      startup_cmd: "python main.py"
      redis_storage: true
    input:
      - name: "prompt"
        type: ["string"]
        description: "Text to generate from"
      - name: "steps"
        type: ["int"]
        required: false
        default: 30
      - name: "seed"
        type: ["int", "string"]
        required: false
```

Then reload the queue configs (`runqy config reload`) or restart the server.

Each entry describes one top-level field of the payload:

| Key | Default | Description |
|-----|---------|-------------|
| `name` | (required) | Field name in the payload |
| `type` | (required) | List of accepted types. The value must match at least one. |
| `required` | `true` | Whether the field must be present. A field is required unless you write `required: false`. |
| `default` | none | Value added to the payload when an optional field is absent. Ignored on a required field. |
| `description` | none | Free text, shown in the dashboard |

The accepted type names are exactly these six:

| Type | Matches |
|------|---------|
| `string` | A JSON string |
| `bool` | `true` or `false` |
| `int` | A number without a fractional part (`30`, also `30.0`) |
| `float` | Any number, including whole ones |
| `array` | A JSON array, whatever it contains |
| `object` | A JSON object, whatever it contains |

Any other name (`integer`, `number`, `boolean`, `map`) matches nothing, and the server does not report it when loading the file: a field declared with such a type is rejected on every enqueue.

## What the server checks

With the schema above:

```bash
curl -X POST http://localhost:3000/queue/add \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "inference", "data": {"prompt": "a red bicycle"}}'
```

is accepted, and the task function receives the payload with the default filled in:

```json
{"prompt": "a red bicycle", "steps": 30}
```

The rules:

- **Required fields must be present.** Otherwise the request fails with `<name> is required`.
- **Present fields must have an accepted type.** This applies to optional fields too.
- **`null` is not accepted** for a declared field, whatever its types. Leave the field out instead.
- **Defaults fill optional fields that are absent.**
- **Fields not in the schema pass through unchanged.** The schema does not forbid extra fields.
- **Only the top level is checked.** The content of an `array` or `object` is not validated.

A rejected payload returns HTTP 400 with one message; validation stops at the first problem found.

```bash
curl -X POST http://localhost:3000/queue/add \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "inference", "data": {"steps": 30}}'
```

```json
{"errors": ["prompt is required"]}
```

```bash
curl -X POST http://localhost:3000/queue/add \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{"queue": "inference", "data": {"prompt": "a red bicycle", "steps": "many"}}'
```

```json
{"errors": ["field 'steps' has type string, expected one of: int"]}
```

In these messages a number is reported as `number`, so `"steps": 2.5` gives `field 'steps' has type number, expected one of: int`.

The Python client's `enqueue()` and the CLI in remote mode call this endpoint, so they get the same check: `RunqyClient.enqueue()` raises `RunqyError` with the status and body, and `runqy task enqueue` prints the error.

## Where the check does not apply

The schema is enforced in one place only. Know the gaps before relying on it:

| Path | Validated |
|------|-----------|
| `POST /queue/add` (REST, `RunqyClient.enqueue()`, CLI with `--server`) | Yes |
| `POST /queue/add-batch` (and `RunqyClient.enqueue_batch()`) | No, and no defaults |
| CLI in local mode (no `--server`, direct Redis access) | No |
| Dashboard Playground | No, it only warns |
| Tasks written to Redis directly | No |

Two more limits:

- **The schema must come from a YAML file the server loads** from its queue config directory (`QUEUE_WORKERS_DIR`, or `runqy serve --config`). A queue created through the REST API or the dashboard has no schema to validate against.
- **If any YAML file in that directory fails to load, validation is skipped for every queue** until the file is fixed and the configs are reloaded. Run `runqy config validate` after editing.

Because of these gaps, keep the checks that matter in your task function as well. The schema is there to give callers a fast, clear error, not to guarantee what the task receives.

## Output schemas

A queue can also declare an `output` list with the same format:

```yaml
    output:
      - name: "caption"
        type: ["string"]
```

It is documentation only. The server stores it with the queue config and never compares it with what tasks return.

## In the dashboard

The Playground page uses the input schema of the selected queue:

- the payload editor starts with a skeleton built from the schema: each field with its default, or an empty value of its first type;
- an "Input schema" section lists the fields with their types, which ones are required, their defaults and descriptions;
- a warning names the required fields missing from the payload you typed.

The warning does not block sending, and tasks sent from the Playground are not validated by the server.

## Next steps

- [Enqueueing tasks](enqueueing-tasks.md)
- [Queue configuration reference](../reference/queue-config.md)
- [REST API reference](../reference/rest-api.md)
