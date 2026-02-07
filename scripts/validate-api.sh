#!/usr/bin/env bash
# Run OpenAPI validation without invoking npm (avoids NPM_CONFIG_DEVDIR warning in Cursor/sandbox).
set -e
unset NPM_CONFIG_DEVDIR
exec node_modules/.bin/redocly lint docs/api/openapi.yaml
