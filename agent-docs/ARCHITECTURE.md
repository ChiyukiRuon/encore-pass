# Architecture

## Repository layout

| Path                                    | Responsibility                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`                                  | Next.js App Router. `page.tsx` renders the editor, `editor/page.tsx` is the editor route, `layout.tsx` holds metadata and `BrandMark`, and `globals.css` holds the 晴空樱 (Festival Sky) design tokens.                              |
| `app/api/passes/route.ts`               | Signing endpoint: origin check, JSON size limit, barcode validation, draft validation, remote-consent header and a 20-second deadline.                                                                                               |
| `app/api/health/route.ts`               | Public liveness endpoint. It reports the configured signing mode, never certificate readiness.                                                                                                                                       |
| `components/editor/`                    | Editor sections, save/clear/import sheets and the image crop dialog.                                                                                                                                                                 |
| `components/preview/ticket-preview.tsx` | 343x474 pt Wallet preview for the classic, poster event and poster generic layouts.                                                                                                                                                  |
| `lib/ticket/`                           | Shared Zod schema and migration (`schema.ts`), timezone conversion (`timezone.ts`), layout/barcode gating (`validation.ts`), image specifications (`appearance.ts`), crop geometry (`crop.ts`) and IndexedDB storage (`storage.ts`). |
| `lib/import/files.ts`                   | Browser-only image decoding, @3x downscaling and poster band tone sampling.                                                                                                                                                          |
| `lib/barcode/decode.ts`                 | Retained ZXing decoder and tests. It is not reachable from the editor and is kept for the specification's M3.                                                                                                                        |
| `lib/wallet/`                           | Draft-to-pass mapping (`pass-mapper.ts`), field construction (`pass-fields.ts`), resource rendering (`pass-builder.ts`), remote payload compression (`remote-payload.ts`) and signers (`signers/local.ts`, `signers/remote.ts`).     |
| `lib/server/`                           | `errors.ts` (error contract) and `limits.ts` (single-process request and generation budgets).                                                                                                                                        |
| `tests/`                                | `unit/`, `integration/`, `e2e/` and `fixtures/`. `scripts/generate-fixtures.mjs` creates synthetic images.                                                                                                                           |
| `agent-docs/`                           | English documentation: architecture, implementation, operations, design system, components and verification.                                                                                                                         |

## Data flow

1. The editor holds a `TicketDraft`. Incomplete drafts are valid; `ticketDraftSchema` validates complete drafts and `exportTicketSchema` additionally requires barcode confirmation when the switch is on.
2. A 400 ms debounce writes the draft to IndexedDB. JSON import is bounded to 32 MB, migrated and validated before replacing the editor; signing consent is never persisted or imported.
3. Export without signing consent serializes the editable draft in the browser.
4. Signing posts the draft to `POST /api/passes`. The route checks origin, size, barcode, schema and the remote-consent header, then `buildPass` renders resources with sharp and calls the configured signer.
5. Local signing reads the certificate, key and intermediates from environment paths and writes the pkpass archive. Remote signing maps the pass to the walletmcppass contract, downloads the result and validates layout, barcode, identity and archive hashes before exposing the download URL.
6. Images are cropped in the browser. Crop sources and rectangles stay in the local draft and exported JSON; the editor strips them from signing requests, so the server receives one image per slot.

## Image pipeline

`lib/ticket/appearance.ts` is the single source for image sizes. The browser and server both import it.

| Output                        | Size (pt)                      | Fit               | Used by               |
| ----------------------------- | ------------------------------ | ----------------- | --------------------- |
| `logo`                        | 160x50, minimum width 50       | inside            | Classic event ticket  |
| `primaryLogo`                 | 126x30                         | inside            | Poster event ticket   |
| `thumbnail`                   | 90x90, rounded transparent PNG | cover             | Classic event ticket  |
| `background`                  | 343x503                        | cover             | Classic event ticket  |
| `background` (generic poster) | 345x505                        | cover             | Native poster generic |
| `artwork`                     | 358x448                        | cover             | Poster event ticket   |
| `secondaryLogo`               | 135x12                         | inside, uncropped | Poster event ticket   |

`passImageOutputs` maps one upload to these outputs; `imageSourceSizes` gives the browser the largest source size (logo 160x50, thumbnail 90x90, background 358x503, secondaryLogo 135x12). Images export at @2x/@3x; the required `icon.png` exports at 1x/2x/3x. The crop sheet locks the thumbnail to 1:1 and the background to 343:503 (classic), 358:448 (poster event) or 345:505 (generic poster); logos keep a free selection. `backgroundMaskOpacity` is composited into `background.png` and `artwork.png` only for classic layouts.

Legacy `heroDataUrl` drafts migrate to the thumbnail. Strips are never produced.

## Configuration

| Variable                                                                       | Purpose                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `EncorePass_SIGNING_MODE`                                                      | `preview` (default), `local` or `remote`. Any other value is treated as `preview`.               |
| `PASS_TYPE_IDENTIFIER`, `APPLE_TEAM_ID`, `PASS_ORGANIZATION_NAME`              | Pass identity. The server always generates serials.                                              |
| `PASS_CERT_PATH`, `PASS_KEY_PATH`, `PASS_KEY_PASSWORD`, `APPLE_WWDR_CERT_PATH` | Local signing certificate pair and intermediates.                                                |
| `MAX_REQUEST_SIZE_MB`                                                          | Request limit, clamped to 10 MB.                                                                 |
| `ACCESS_PASSWORD`                                                              | Basic-auth password. Production refuses to serve without it unless `ALLOW_UNAUTHENTICATED=true`. |
| `ALLOW_UNAUTHENTICATED`                                                        | Explicit opt-out for trusted local previews only.                                                |
| `APP_ORIGIN`                                                                   | External HTTPS origin when reverse-proxying.                                                     |

Remote signing also requires the editor's `X-Encore-Remote-Sign: walletmcppass` consent header at the API boundary. Standard proxy variables need `NODE_USE_ENV_PROXY=1` on supported Node releases.

## Commands

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm audit
```

Run `npx playwright install chromium` once before browser tests. `npm test` runs the unit and integration suites; Playwright covers 1280x900 desktop and 375x812 mobile Chromium.

## Documentation map

- `README.md`: Chinese project entry point and document index.
- `agent-docs/IMPLEMENTATION.md`: behavior and signed-pass implementation notes, with external Apple references.
- `agent-docs/ARCHITECTURE.md`: this file.
- `agent-docs/OPERATIONS.md`: local signing, deployment, security and remote signing troubleshooting.
- `agent-docs/DESIGN-SYSTEM.md`: palette, tokens, typography, motion and CSS conventions.
- `agent-docs/COMPONENTS.md`: component tree, state ownership and interaction patterns.
- `agent-docs/VERIFICATION.md`: test coverage and verification status.
