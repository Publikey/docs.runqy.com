# Runqy docs

Documentation for [runqy](https://github.com/Publikey/runqy), published at **https://runqy.com/docs/**. Built with Material for MkDocs.

Contributions are welcome: edit the Markdown under `docs/` and open a pull request.

## Local development

```bash
pip install -r requirements.txt
mkdocs serve
```

The site runs at http://127.0.0.1:8000. Before opening a pull request, run the same check
as CI: a broken link, anchor or nav entry fails it.

```bash
mkdocs build --strict
```

## Layout

| Path | Content |
|------|---------|
| `docs/getting-started/` | Quickstart, first task, installation |
| `docs/concepts/` | How runqy works: architecture, queues, workers |
| `docs/guides/` | How-to guides, one goal per page |
| `docs/operate/` | Production, security, upgrading |
| `docs/reference/` | CLI, REST API, configuration, Python SDK |
| `docs/examples/`, `docs/troubleshooting.md` | Examples gallery, troubleshooting |
| `docs/stylesheets/`, `docs/assets/`, `overrides/` | Theme: design tokens, self-hosted fonts, logo, head additions |

Writing rules: every command, flag, default and response shown must be checked against the
code or run for real; one job per page (concept, guide or reference); say each thing once and
link to it.

## Moving or renaming a page

Never reuse an old path. When a page moves:

1. add `old/path.md: new/path.md` to `redirect_maps` in `mkdocs.yml`;
2. add a 301 route for `/docs/old/path*` in `static/staticwebapp.config.json` of the runqy.com
   repository, and update its links to the page;
3. point the old-domain route in `redirect/staticwebapp.config.json` at the new URL;
4. if other sites link to an anchor of the old page, add it to
   `docs/javascripts/anchor-redirects.js`.

## Deployment

On push to `main`:

- the runqy.com build pulls this repository and publishes the docs under `runqy.com/docs/`.
  It copies `llms.txt` and `llms-full.txt` to the site root, and fails without them;
- `docs.runqy.com` is deployed from `redirect/`, which only redirects (301) each old page to
  its current URL.

`requirements.txt` pins exact versions on purpose: the docs are built during the runqy.com
deploy, so an unplanned upgrade of the theme could break it.
