# DGH FPL Manager API Deployment

## Exact server entry point

The API starts at `server/_core/index.ts`. It creates an Express server, registers `/api/health`, mounts the tRPC router at `/api/trpc`, and listens on `process.env.PORT` (default `3000`). The production build is created with `pnpm build` and started with `pnpm start`.

## Simplest free persistent option

The included `render.yaml` targets a Render Free web service. Render documents that Free web services support Node applications, managed TLS, and a public service URL, but they spin down after 15 minutes of inactivity and require a Render account to create the service. The service must be connected to a repository or deployed through the Render dashboard.

Koyeb also documents a free web service, but account validation requires a payment card. It is therefore not the simplest no-credential path for this project.

## Required external action

A user-owned Render or equivalent hosting account must be connected to this repository and the service must be created. The resulting public HTTPS origin must be tested at:

- `GET https://<real-origin>/api/health`
- `POST https://<real-origin>/api/trpc/fpl.dashboard` with the tRPC request payload

The response must prove that the server can reach the official FPL API and return the configured league `170174` and entry `871842` data. Only then should `EXPO_PUBLIC_API_BASE_URL` be configured for an EAS build.

No localhost URL, sandbox URL, preview URL, example domain, or invented value belongs in the EAS APK configuration. Until a real origin exists, the native client intentionally reports `FPL DATA UNAVAILABLE` rather than showing sample data.
