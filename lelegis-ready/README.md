# LeLegis

Louisiana Legislature civic-tech project under Le Comrade.

## Cloudflare build settings

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The build command intentionally succeeds without compiling anything because this is a plain Cloudflare Worker.

## Required binding

Bind the existing D1 database named `lelegis` to the Worker using variable name `DB` in Cloudflare.

## Checks

- `/api/health`
- `/api/db-check`
- `/api/bills`
