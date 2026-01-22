# runqy Documentation

<div class="hero" markdown>
  <div class="hero-content">
    <p class="hero-eyebrow">Distributed Task Queue</p>
    <h1>Run Any Task, Anywhere</h1>
    <p class="hero-description">
      Server-driven workers. Zero configuration.<br>
      Deploy Python tasks at scale.
    </p>
    <div class="hero-buttons">
      <a href="getting-started/quickstart/" class="btn-primary">Get Started</a>
      <a href="https://github.com/Publikey/runqy" class="btn-secondary">GitHub</a>
    </div>
  </div>
</div>

## What is runqy?

runqy is a task queue system where workers are stateless. They receive all configuration (Redis credentials, code deployment specs, task routing) from a central server at startup. This architecture enables:

- **Zero-configuration workers**: Workers only need to know the server URL
- **Centralized control**: All queue and deployment configuration lives on the server
- **Dynamic code deployment**: Workers automatically pull and run your task code
- **Powerful CLI**: Manage queues, tasks, and workers locally or remotely

## Components

<div class="component-cards" markdown>
  <div class="component-card" markdown>
### [runqy Server](server/index.md)
Go HTTP server for worker registration, queue management, and REST API
  </div>
  <div class="component-card" markdown>
### [runqy Worker](worker/index.md)
Go binary that processes tasks from Redis and supervises Python processes
  </div>
  <div class="component-card" markdown>
### [runqy-task](python-sdk/index.md)
Python SDK with `@task` and `@load` decorators for building task handlers
  </div>
</div>

## Quick Links

<div class="quick-links" markdown>
  <a href="getting-started/quickstart/" class="quick-link">
    <span class="quick-link-icon">:material-rocket-launch:</span>
    <span class="quick-link-text">Quick Start Guide</span>
  </a>
  <a href="getting-started/architecture/" class="quick-link">
    <span class="quick-link-icon">:material-sitemap:</span>
    <span class="quick-link-text">Architecture Overview</span>
  </a>
  <a href="server/cli/" class="quick-link">
    <span class="quick-link-icon">:material-console:</span>
    <span class="quick-link-text">CLI Reference</span>
  </a>
  <a href="python-sdk/decorators/" class="quick-link">
    <span class="quick-link-icon">:material-language-python:</span>
    <span class="quick-link-text">Python SDK Reference</span>
  </a>
</div>

## Source Code

<div class="source-links" markdown>
  <a href="https://github.com/Publikey/runqy" class="source-link">:material-github: runqy-server</a>
  <a href="https://github.com/Publikey/runqy-worker" class="source-link">:material-github: runqy-worker</a>
  <a href="https://github.com/Publikey/runqy-python" class="source-link">:material-github: runqy-python</a>
</div>
