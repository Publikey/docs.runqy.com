# Runqy docs

Documentation for [runqy](https://github.com/Publikey/runqy), published at **https://runqy.com/docs/**. Built with Material for MkDocs.

Contributions are welcome: edit the Markdown under `docs/` and open a pull request.

## Local Development

```bash
pip install -r requirements.txt
mkdocs serve
```

Site runs at http://127.0.0.1:8000

## Deployment

On push to `main`:

- the runqy.com build pulls this repository and publishes the docs under `runqy.com/docs/`;
- `docs.runqy.com` is deployed from `redirect/`, which only redirects (301) each old page to its new URL.

The redirect list in `redirect/staticwebapp.config.json` covers the pages that existed when the docs moved (October 2026). New pages do not need an entry.
