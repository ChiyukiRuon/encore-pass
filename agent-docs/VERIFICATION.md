# Verification

## Commands

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Run `npx playwright install chromium` once before browser tests. Every suite uses synthetic tickets from `scripts/generate-fixtures.mjs` and ephemeral self-signed certificates. Never add real tickets, certificates or signed passes to fixtures.

## Automated coverage

| Suite                                      | Coverage                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/ticket.test.ts`                | Draft validation, barcode confirmation, styled defaults and legacy migration, mask gating, crop source bounds, lossy barcode encodings, timezone/DST resolution and pass mapping for all three styles.                          |
| `tests/unit/crop.test.ts`                  | Crop frames (1:1, 343:503, 358:448), default centred selection, move/resize bounds, locked aspect and stored rectangle validation.                                                                                              |
| `tests/unit/timezone.test.ts`              | Full IANA option list, UTC fallback, validity checks and device-zone defaults.                                                                                                                                                  |
| `tests/unit/barcode.test.ts`               | Round-trips QR, PDF417, AZTEC and CODE128 through an independent decoder.                                                                                                                                                       |
| `tests/unit/remote-payload.test.ts`        | 900 KiB serialized payload budget, palette quantization and resizing, preservation of alpha, aspect, text and barcode data, and byte-for-byte pass-through for small requests.                                                  |
| `tests/integration/api.test.ts`            | Health response, origin and Host checks, preview refusal, client identity injection, oversized and malformed JSON, unsupported barcodes, unavailable local keys and unsigned resource builds.                                   |
| `tests/integration/auth.test.ts`           | Production fail-closed without auth and Basic-auth acceptance.                                                                                                                                                                  |
| `tests/integration/signing.test.ts`        | Local classic event-ticket ZIP resources, barcode fields, manifest hashes and detached PKCS7 signature with synthetic certificates.                                                                                             |
| `tests/integration/poster-signing.test.ts` | Local 通用凭证 signing with the shared posterGeneric layout and no barcode.                                                                                                                                                     |
| `tests/integration/remote.test.ts`         | Mocked walletmcppass contract for every style/background/barcode combination, remote field and image mapping, layout and barcode rejection, off-site URLs, unsigned archives, consent, error stages, timeouts and upstream 413. |
| `tests/e2e/editor.spec.ts`                 | Desktop and mobile editor, three styles, barcode switch, layout fallbacks, image slots, mask, collapse, poster generic field and header alignment, poster event band fallback and two-line header time, draft restore/delete and preview structure.      |
| `tests/e2e/image-crop.spec.ts`             | Crop sheet defaults, drag/lock/reset/cancel, re-editing and omission of crop sources from signing requests.                                                                                                                     |
| `tests/e2e/save-ticket.spec.ts`            | JSON export/import, pending-save draining, clear confirmation, Safari Wallet badge, third-party consent sheet and save guide.                                                                                                   |

## Visual comparison

- Classic event ticket and poster event ticket previews were compared with real Wallet screenshots generated from a local `data.json`.
- The poster event barcode panel, 118 pt footer, seat row and secondary-logo position match the iPhone captures.
- A live Wallet MCP Pass request verified the QR remote signing fields; PDF417, AZTEC and CODE128 were verified on a device.
- The 通用凭证 native poster layout was redrawn from a user-supplied iPhone screenshot. The band, field row, barcode panel and header match that capture; the band tone samples the artwork above the band.

## Device and deployment verification

The project owner confirmed that the following checks are complete:

- Real iPhone rendering of 通用凭证 with `posterGeneric`.
- Full installation of a remotely signed pass on a real iPhone, including PDF417, AZTEC and CODE128 signing.
- Docker execution and certificate mounts.
- A live REST smoke test with synthetic fixtures.
- Visual equivalence of the provider-rebuilt image resources on a real device.

Different iOS versions may still fall back, truncate or reposition content. Apple trust-chain validation remains out of scope: tests verify manifest hashes and detached-signature math only.
