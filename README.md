# Amin personal portfolio

Production sources for **https://amin.kuara.dev**, extracted from the Kuara studio project. Astro serves a compact anonymous overview with randomly selected Terminal/QBasic themes and an optional, browser-local résumé assistant.

## Deployment status

Live since **2026-10-25** on the independent Cloudflare Worker **`amin-portfolio`**:

| Hostname | Worker |
| --- | --- |
| `amin.kuara.dev` | `amin-portfolio` |
| `kuara.dev` and EmDash studio/admin | `kuara-dev` — unchanged |
| `telefi.kuara.dev` | `telefi-site` — unchanged |

The `workers.dev` and preview URLs are disabled; production is served only from the custom domain. There is no EmDash, React, Three.js, CMS seed, database, storage bucket, session store or cron dependency in this app. No Kuara secrets or Git history were copied.

## Deploy and roll back

A production build needs the external résumé described below. A fresh public checkout cannot deploy the real site by itself, and generated context must not be committed.

```bash
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun audit
bunx wrangler deploy
```

`wrangler deploy` uses the compiled Worker in `dist/` and attaches only the `amin.kuara.dev` custom domain. Run it locally, never from CI with real résumé data. A domain-only change can use `bunx wrangler triggers deploy --name amin-portfolio` after a build, but that command is marked experimental by Wrangler.

Rollback does not require a DNS or database restore:

- **Bad code on the new Worker:** inspect Cloudflare versions with `bunx wrangler deployments status --name amin-portfolio`, then `bunx wrangler rollback <version-id> --name amin-portfolio`.
- **Restore the old personal site:** reassign the `amin.kuara.dev` custom domain from `amin-portfolio` back to `kuara-dev` in the Cloudflare dashboard. The old worker is still deployed. Its cutover version was `6923d9a7-f7f2-444a-abba-4db48738b6c8`, deployment `186fdf70-dc84-4629-a83b-17de6d81ea49`.
- **Local source fallback:** `../Kuara.dev` has branch `backup/pre-amin-migration-2026-10-25` (`adb6128`) containing the live source snapshot from before the move.
- The new Worker's cutover version was `abf0afd4-1ca0-40a3-9dac-1f145a121e47`.

Do not delete the old Kuara personal-site code, the old deployment or the résumé build inputs until the new Worker has been stable for a deliberate observation period. The studio, admin, `kuara.dev` homepage and unrelated routes are outside this migration.

## Run locally

Requires Bun 1.4.2+ (native YAML parsing and the version-scoped dependency override) and a professional résumé in the supported YAML schema.

```bash
bun install
bun test
bun run typecheck
bun run build
bun dev
```

- Development: **http://localhost:4323/**
- Production-style local preview: `bun run preview`, then **http://localhost:4324/**.
- `/amin` redirects to `/`. CMS URLs redirect to the existing studio admin origin.

By default, the source is `~/Sources/resume-metadata/my-resume.yaml`. Override with `RESUME_SOURCE=/absolute/path/to/resume.yaml`, for example in a gitignored `.env.local`. Missing input fails the build; demo content is never silently substituted.

Tests use fictional fixtures and run without the external résumé, generated context or local hints. Development, typecheck and build require the configured input.

## Code map

| Area | Source |
| --- | --- |
| Homepage | `src/pages/index.astro` |
| Public identity/anonymous overview | `src/data/amin.ts` |
| Icon-only repository/social links | `src/data/amin.ts`, `src/components/ProfileLinks.astro` |
| Layout/theme palette | `src/styles/portfolio.css`, `src/styles/theme.css` |
| Commands and answers | `src/scripts/portfolio.ts` |
| Local inference worker | `src/scripts/portfolio-ai.ts`, `src/scripts/portfolio-ai.worker.ts` |
| Retrieval/validation/recovery | `src/lib/portfolio-ai.ts`, `src/lib/portfolio-guide.ts` |
| Complete YAML export | `src/lib/resume-export.ts`, `scripts/sync-resume.mjs` |
| Public context API | `src/pages/api/resume-context.json.ts` |

## Keep content separate from code

`bun run resume:sync` exports every professional field, including hidden entries, and audits value preservation. Personal phone/email are excluded; the public email comes from the public profile. Build, dev startup and typecheck regenerate it.

These files stay **out of Git**:

- The external original YAML and any files in `private/`.
- `src/data/generated/resume-context.json` and `resume-coverage.json`.
- `config/resume-hints.local.json`: optional owner-specific aliases/sector hints.
- `.env*` and `.dev.vars*` except the generic `.env.example`.

Hints can be supplied via `RESUME_HINTS_SOURCE`. They contain only `title`, `entities` and `keywords`; résumé narrative comes from the YAML, not an old summary. Omitting hints is supported; explicit industry labels in the source are still used.

`config/resume-hints.example.json` shows the accepted metadata shape using fictional labels. The local extraction includes the owner's ignored hints file; a fresh clone does not, so provide your own optional hints when needed.

The published context is intentionally machine-readable/public, even though its generated file is gitignored. `noindex` is not access control. It is fetched only after AI consent; initial HTML and normal commands stay anonymous.

`examples/resume.sample.yaml` documents a fictional input schema. To use it with this personal app, set its `personal.name` to match the public identity in `src/data/amin.ts`, or update that public profile for a fork. Never deploy the fictional history as real career data.

## Model behavior

Qwen2.5 0.5B q4f32 runs through WebLLM in a browser worker (roughly 350 MB model files and around 1 GB graphics memory). No cloud-model calls or prompt logging are used. The complete corpus is searchable, while each model request uses a bounded subset. Responses use canonical source text; citations/IDs stay internal. Local search remains available, clearly labelled, if the model fails.

Routine lists are concise. Credential status/dates are discussed only when asked; missing dates do not prove current validity or expiry. Numerical outcomes remain résumé-reported claims. `hide` is formatting metadata, not access control.

## Git and source publication

Source repository: **https://github.com/aminkh17/amin**, configured as `origin`. The user selected the MIT license and approved source publication. Pushing source does not deploy the site; there is no automatic production deployment configured here.

The 2026-10-25 hosting migration is tracked in Git as a reviewed source change. Keep real input, generated artifacts, owner-specific hints and credentials out of commits and public build artifacts. Tests use fictional data; a full build still requires a deliberately configured résumé matching the public profile. This personal source repository is not a turnkey, identity-neutral template.

## Dependency security

Run `bun audit` when changing dependencies. Miniflare currently pins a vulnerable Undici 7 release, so `package.json` temporarily overrides only Undici 7 ranges below `7.30.1` to the patched `7.30.1`. Unifont's Undici 8 dependency is not downgraded. Recheck and remove the override when upstream dependencies no longer require it.

## License

Application source is available under the [MIT license](LICENSE). Dependencies and downloaded model artifacts retain their own licenses. The external résumé and generated owner-specific data are not included in this repository.
