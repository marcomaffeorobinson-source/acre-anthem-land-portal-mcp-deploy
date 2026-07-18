# Acre & Anthem Land Portal connector

This folder contains a secure MCP bridge for connecting ChatGPT Business/Work to Land Portal API v2.

Why a bridge is needed: Land Portal's own MCP server (`https://mcp.landportal.com`) authenticates with a static Land Portal bearer token. ChatGPT custom apps cannot send a user-supplied static API key to an MCP server. This bridge keeps the Land Portal key server-side and gives ChatGPT an OAuth 2.1 login instead.

## What the connector can do

| Tool | Action | Quota behavior documented by Land Portal |
|---|---|---|
| `connector_status` | Check the bridge | No Land Portal request |
| `land_portal_search_properties` | Search by parcel number, owner, address, city, ZIP, FIPS, or state | Non-empty result consumes search quota; empty result is free |
| `land_portal_get_property` | Fetch one known property ID | Successful call consumes single-property quota, then export-row balance |
| `land_portal_list_comp_reports` | Find existing comp reports | Does not consume comp-report quota |
| `land_portal_get_comp_report` | Fetch an existing report | Does not consume comp-report quota |
| `land_portal_create_comp_report` | Start an asynchronous comp report | Consumes daily comp-report quota and requires `confirmQuotaCharge=true` |

Skip tracing is **not available through Land Portal's current v2 API or MCP tool list**. Do not ask ChatGPT to run it through this connector. Continue using the Land Portal interface for skip tracing until Land Portal documents a supported endpoint/tool.

## Key handling

The integration key must never be pasted into ChatGPT, source code, screenshots, support tickets, or Git.

1. Create a dedicated key under **Land Portal → Profile → API v2** named `Acre & Anthem ChatGPT MCP`.
2. Save the one-time value in the Acre & Anthem password manager.
3. During deployment, paste it directly into the host secret named `LAND_PORTAL_API_KEY`.
4. Rotate/revoke it immediately if it is ever exposed. A 90-day rotation schedule is a good default.

The repository contains only `.env.example`; `.env` is ignored by Git. Production application logs deliberately exclude environment variables, authorization headers, API responses, and owner/contact data.

## Verified API details

- API origin: `https://api.landportal.com`
- Authentication: `Authorization: Bearer <token>`
- Baseline rate limit: 60 requests per minute per token
- Property search: `GET /v2/properties`
- Property detail: `GET /v2/properties/{propertyId}`
- Comp reports: `GET/POST /v2/reports/comps` and `GET /v2/reports/comps/{reportId}`
- Land Portal MCP: `https://mcp.landportal.com` (static bearer token; useful for Codex/IDE clients, not a direct ChatGPT custom-app connection)

## Local verification

Requirements: Node.js 20 or later.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run check
pnpm run dev
```

For local development only, set the real token in `.env`, keep `NODE_ENV=development`, and keep `AUTH_DISABLED=true`. Never expose or tunnel the local server while authentication is disabled.

Check `http://127.0.0.1:2091/healthz`, then use MCP Inspector with `http://127.0.0.1:2091/mcp`. Start with `connector_status`. For an authentication smoke test that does not consume search quota, search an intentionally impossible parcel number and confirm the result is empty.

## Hosted setup (Render + Auth0)

The included `render.yaml` is the simplest hosted path.

1. Put this folder in a private Git repository; verify `.env` is absent.
2. In Auth0, create an OAuth API/resource server for the connector.
3. Use the connector's final HTTPS origin as the audience, for example `https://landportal-mcp.acreandanthem.com`.
4. Add the scope `landportal.read`.
5. Configure an OAuth client flow supported by ChatGPT custom apps. Add the ChatGPT callback URL shown during app setup to Auth0's allowed callback URLs.
6. In Render, create a Blueprint from the repository.
7. Enter these values only in Render's secret/environment screen:
   - `LAND_PORTAL_API_KEY`: the dedicated Land Portal key
   - `MCP_PUBLIC_URL`: the final HTTPS origin, without `/mcp`
   - `AUTH_ISSUER`: the Auth0 issuer URL ending in `/`
   - `AUTH_AUDIENCE`: the same resource-server audience configured in Auth0
   - `AUTH_JWKS_URI`: optional; leave blank for the issuer default
8. Deploy. Confirm `/healthz` returns OK and unauthenticated `/mcp` returns HTTP 401.
9. Complete an OAuth login and test `connector_status` plus one empty property search in MCP Inspector.

Production refuses to start if `AUTH_DISABLED=true`. The bridge validates OAuth signature, issuer, audience, expiration, and `landportal.read` scope on every MCP request.

## Add it to ChatGPT Business/Work

Workspace labels can vary slightly by rollout:

1. A workspace owner/admin enables developer mode for custom apps.
2. Create a custom MCP app named **Acre & Anthem Land Portal**.
3. Use MCP URL `https://YOUR-HOST/mcp`.
4. Complete the OAuth sign-in.
5. Keep the app private to the Acre & Anthem workspace, then publish/approve it if your workspace requires approval.
6. In a new chat, attach the app from the composer and run the status prompt below.

## Ready-to-use ChatGPT prompts

Connector check:

> Use Acre & Anthem Land Portal to check connector status. Do not run a Land Portal search or any quota-consuming action.

Property search:

> Search Acre & Anthem Land Portal for parcel number 123-45-678 in Tennessee. Show the matching Land Portal property IDs, APNs, owner names, acreage, and situs addresses. Do not fetch full property details yet. Tell me whether the search returned a match before doing anything else.

Full property detail after choosing a match:

> Fetch Land Portal property ID 123456. This is a read-only call but may consume single-property quota. Return owner, APN, acreage, situs and mailing addresses, land-use fields, and any access, flood, slope, or valuation fields available. Do not create an export or comp report.

Use an existing comp report first:

> List existing Land Portal comp reports for property ID 123456. If a completed report exists, fetch it and summarize the subject, comparable sales, distance, sale date, acreage, price, and price per acre. Do not create a new report.

Create a comp report only after confirmation:

> First list existing comp reports for property ID 123456. If no completed report exists, tell me that creating one consumes daily comp-report quota and stop for my confirmation. After I explicitly confirm, create it, then poll the returned report ID until completed and summarize the comparable sales.

Skip trace request:

> Skip tracing is not supported by the current Acre & Anthem Land Portal connector. Give me a clean CSV-ready list of the selected APNs and owner names so I can submit them in Land Portal manually; do not invent contact information.

## Operational safeguards

- Search before fetching full property details.
- List/fetch existing comp reports before creating a new one.
- Never set `confirmQuotaCharge=true` without explicit user approval in the conversation.
- Do not log request headers, secrets, full API responses, owner contact information, or skip-trace results.
- Keep production OAuth enabled and the app restricted to Acre & Anthem.
- Refresh the ChatGPT app after changing tool names or descriptions.
