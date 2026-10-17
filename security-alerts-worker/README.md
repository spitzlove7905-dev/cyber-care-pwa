# Cyber Care Security Alerts Worker

This is an independent Cloudflare Worker for the security-alert pipeline. It does **not** change the existing Pages PWA and should not be deployed to the Pages project.

## Safety defaults

* The only enabled source is the official CISA Known Exploited Vulnerabilities catalog.
* The Worker checks it on a 15-minute Cron Trigger with conditional HTTP requests (`ETag` / `Last-Modified`).
* It uses deterministic rules only. There is no AI generation, GPU work, or Mini-PC runtime dependency.
* `AUTO_PUBLISH_ENABLED` is false unless explicitly created as the string `true` in Worker secrets. The default outcome is `pending_review`.
* `/admin/` provides a review screen. API access requires `ADMIN_API_TOKEN`; the browser keeps it only in memory. Review writes additionally require `REVIEW_ACTIONS_ENABLED=true` and a same-origin JSON request. Keep review writes disabled until administrator access protection has been configured and verified.
* `/alerts` is the standalone public bulletin page, showing only published records. It can be linked from Cyber Care after preview review.
* The review screen also lists published records, supports withdrawal, and shows recent audit events. Public responses use `no-store` so a withdrawal is visible on the next request.
* Cloudflare Access setup is pending: on this account Zero Trust Free onboarding requires payment details and agreement to usage-overage billing. Do not enable review actions before the owner completes that setup and the administrator policy is verified.
* Already reviewed records are frozen during ingestion in this phase; corrections to published bulletins require a separate revision workflow before production publication is enabled.
* To keep scheduled work small, the initial CISA import considers the previous 30 days only. Later checks consider records added since the last successful run, and unchanged records do not write to D1.
* Public endpoints return only rows with `status = published`. Pending candidates cannot be reached from the public API.

## Local verification

Run `npm test` from this directory. The tests cover the official-source gate, explanation of the score, and the no-publication-on-insufficient-evidence rule.

## Deployment checklist — do not run before approval

1. Create a separate D1 database named `cyber-care-security-alerts` and replace the placeholder `database_id` in `wrangler.jsonc`.
2. Apply `migrations/0001_initial.sql` to that D1 database.
3. Set an `ADMIN_API_TOKEN` with `wrangler secret put`; never commit it or add it to Pages variables.
4. Deploy this Worker separately from `cyber-care-pwa`.
5. Exercise `/healthz` and a manual scheduled test. Confirm candidates appear only in `/admin/pending`.
6. Review actual CISA data and API usage. Leave `AUTO_PUBLISH_ENABLED` absent or false until the owner specifically authorizes automatic publication.
7. Only after public-API review should the Pages PWA be given the Worker origin for a read-only alerts view.

## Current endpoints

* `GET /healthz` — service health, no data.
* `GET /v1/alerts` — published alerts only.
* `GET /v1/alerts/:id` — a single published alert only.
* `GET /admin/pending` — Bearer-token protected review queue.

SNS/Buffer is deliberately not connected at this stage. It belongs after the approval workflow and public alerts view have been tested.
