# Introduction

runqy is a distributed task queue system designed for machine learning inference and other workloads that require:

- **Stateless workers** that receive configuration at startup
- **Server-driven bootstrap** for centralized control
- **Long-running Python processes** that stay warm between tasks

## Key Concepts

### Server-Driven Bootstrap

Unlike traditional task queues where workers are pre-configured, runqy workers start with minimal configuration (just the server URL and API key). At startup, they:

1. Register with the server via `POST /worker/register`
2. Receive Redis credentials and deployment configuration
3. Clone the task code from a git repository
4. Set up a Python virtual environment
5. Start the Python process and wait for it to be ready

### One Worker = One Parent Queue = One Process

Each worker instance processes tasks from a single parent queue using a single supervised Python process. Sub-queues of the same parent (e.g., `inference.high` and `inference.low`) share the same code deployment and runtime.

**Queue configuration options:**

- `queue: "inference"` — Listen on **all** sub-queues of `inference`
- `queues: [inference.high, inference.low]` — Listen **only** on specific sub-queues

This constraint ensures:

- Predictable resource usage
- Simple failure isolation
- Easy horizontal scaling (add more workers for more capacity)
- Efficient resource sharing across sub-queues with different priorities

### Long-Running vs One-Shot Modes

runqy supports two execution modes:

- **Long-running** (`long_running`): The Python process stays alive between tasks, ideal for ML inference where model loading is expensive
- **One-shot** (`one_shot`): A new Python process is spawned for each task

## Next Steps

- [Quick Start](quickstart.md) — Set up a local development environment
- [Architecture](architecture.md) — Deep dive into how the components interact
