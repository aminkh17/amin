# Amin personal portfolio

Standalone Astro + Cloudflare-adapter source project for `amin.kuara.dev`, extracted from `../Kuara.dev`. No EmDash, React, Three.js, D1, R2, KV, Images or scheduled maintenance is required.

## Source-only extraction, not a hosting cutover

- The user requested **sources only**. Production still runs from the `kuara-dev` Worker and the transitional sources in `../Kuara.dev`.
- Do not deploy, attach/transfer domains, delete Kuara's copy or change the studio/admin without separate authorization. This project intentionally has no deploy script or custom-domain route.
- This is an independent Git repository. The user selected `https://github.com/aminkh17/amin.git` as `origin`, chose MIT and approved the first source-only commit/push. Source publication does not authorize a hosting cutover; later commits/pushes still need task-specific authorization.

## Commands

```bash
bun install
bun test
bun run typecheck
bun run build
bun dev                 # localhost:4323/
bun run preview         # localhost:4324/ after build
```

## Data and privacy

- `src/data/amin.ts` is the public, anonymous overview and identity configuration. It deliberately contains no employer/client/project names.
- The canonical YAML remains external: `~/Sources/resume-metadata/my-resume.yaml`, overridable via `RESUME_SOURCE`. Never copy it into tracked files.
- Include all professional fields, all `hide`/`onlytitle` entries, strengths, credentials, work eligibility and reported achievements. Exclude personal phone/email and use the configured public email.
- Generated context/coverage (`src/data/generated/`) and optional owner-specific aliases (`config/resume-hints.local.json`) are gitignored. No `.env`, source secrets or Kuara encryption keys should be copied here.
- The professional context endpoint is intentionally public and `noindex`, not secret or authenticated. Fetch it only after AI consent, never in the initial page/bundle.
- Source statements/figures are as recorded, not independently verified. Missing credential dates do not establish active or expired status.

## UI and inference

- Preserve the short, fully readable overview, random Terminal/QBasic themes, manual preference and shared answer/model state.
- Inference uses WebLLM in a browser worker, with no cloud inference or prompt logging.
- Validate selected source IDs; render only canonical text with DOM text APIs. Do not display arbitrary model HTML/prose or citation/source-ID badges.
- Answer the question directly. Routine credential lists/details must not append source-verification or expiry/taxonomy commentary. Status/date information is separate and explicit-query-only.
- Keep context byte limits, stateless resets and honest labelled local-search recovery. Model errors must not wipe loaded résumé knowledge.
- Sector/project/credential matching must not substitute generic recent work for a specific question. Presentation flags never hide data from the assistant.

## Public source boundaries

The application source is MIT-licensed. Public identity and URLs are deliberately configured for Amin; real résumé data and aliases must remain untracked. Keep generated content, local hints, credentials and production artifacts out of public commits and CI artifacts. A sample schema and synthetic tests are included; a fresh full build still needs explicit résumé/profile configuration. This is personal source code, not a generic turnkey template.

Miniflare currently pins a vulnerable Undici 7 version. A version-scoped override patches only Undici 7 to `7.30.1`, leaving Undici 8 untouched. Use Bun 1.4.2+ and re-audit before removing it.
