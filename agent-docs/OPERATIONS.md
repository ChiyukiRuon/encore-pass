# Operations

## Local signing

Preview mode needs no Apple developer account. Local installation needs a valid Apple Pass Type ID certificate, its private key and the applicable WWDR intermediate from an authorized team. Remote signing uses walletmcppass's own certificate instead.

1. Create a Pass Type ID and certificate in the Apple Developer account. See [Apple's certificate setup](https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates).
2. Convert the certificate, key and WWDR intermediate to PEM and place them at `secrets/pass-cert.pem`, `secrets/pass-key.pem` and `secrets/wwdr.pem`. These paths are ignored by Git and the Docker build context.
3. Configure `.env.local`:

```dotenv
EncorePass_SIGNING_MODE=local
PASS_TYPE_IDENTIFIER=pass.your.identifier
APPLE_TEAM_ID=YOURTEAMID
PASS_ORGANIZATION_NAME=Your organization
PASS_CERT_PATH=/run/secrets/pass-cert.pem
PASS_KEY_PATH=/run/secrets/pass-key.pem
APPLE_WWDR_CERT_PATH=/run/secrets/wwdr.pem
PASS_KEY_PASSWORD=
ACCESS_PASSWORD=a long random password
```

4. Run `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`. For local development outside Docker, use absolute paths to the PEM files.
5. Create a synthetic event, export it, open it in iPhone Safari and check the fields, times and an independent scan. Record the iOS version and certificate expiry.

The server checks certificate validity, UID/Pass Type ID, OU/Team ID, key pairing and the leaf signature against WWDR. Apple's trust chain, revocation status and Wallet's final acceptance remain authoritative on Apple devices. The health endpoint reports the configured mode, not certificate readiness.

Certificate failures return `SIGNING_UNAVAILABLE` without paths or keys. The app does not log ticket bodies or barcodes. Restart the instance after rotating certificates and repeat device acceptance. Never put real tickets, certificates or pre-signed passes into fixtures.

## Deployment and security

- Docker binds `127.0.0.1:3000` by default. Copy `.env.example` to `.env.local`, set `ACCESS_PASSWORD`, then run `docker compose up -d --build`. Production refuses to serve without a password; `ALLOW_UNAUTHENTICATED=true` is only for a trusted local preview.
- Public access requires an HTTPS reverse proxy and `APP_ORIGIN=https://your.domain`; the proxy must preserve the original Host header. Basic-auth credentials are only protected over HTTPS. Do not expose the HTTP port directly. `/api/health` is unauthenticated and returns only liveness and the signing mode.
- The container runs as a non-root user from a multi-stage standalone build with a read-only root filesystem, a temporary directory and read-only certificate mounts. Grant the container uid 1000 the minimum read access to the certificate files. Secrets must not enter images or build arguments.
- API protections are instance-local: JSON type and same-origin checks, a strict field whitelist, a 10 MB streamed request limit with a 15-second read timeout, 30 requests per minute, at most 2 concurrent generations, a 20-second generation deadline, a 5-second image timeout and a 30-second client deadline. Forwarded IP headers are not trusted. Rate limits are not shared across instances, so this is not a public anonymous signing service.
- API errors and downloads use `Cache-Control: no-store`. Do not log bodies, barcodes, private keys or certificate paths. Barcode content is sent to walletmcppass only when the barcode switch is on, the user consents to third-party signing and an export runs; switching the barcode off keeps retained content in the browser.
- Drafts are stored unencrypted in IndexedDB. Clear all data removes the draft, editor content and signing consent. Import/export happens only in the browser; imported JSON does not restore signing consent. Shared devices should clear data after use.
- Do not enable reverse-proxy request-body logging, analytics, session replay or error tracking. Back up without `secrets/`. Run `npm audit` and the full verification after upgrades.

## Remote signing

EncorePass calls the [Wallet MCP Pass REST API](https://walletmcppass.com/#api) from the server. It needs no API key and no local Apple certificate.

1. Edit the event, images and style. Without signing consent, export downloads an editable JSON draft.
2. Turn on the signing switch and confirm sending the current data to the third party. If a barcode is visible, confirm its format and content separately.
3. The server prepares the images, sends `POST https://walletmcppass.com/api/passes` and reads `download_url`.
4. The server downloads and validates the archive, then returns the `.pkpass`. Safari on Apple platforms opens the provider link; other browsers download `ticket.pkpass` and the page offers a phone-install link.

Original ticket files, crop sources and crop rectangles are never sent. A retained barcode is not sent while the switch is off. Signing consent is never saved or imported.

### Style mapping

| Project style  | Condition              | API parameters and resources                                                                                                       |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| All styles     | No background          | `style: eventTicket`, classic fields, logo and thumbnail, optional bottom barcode                                                  |
| 活动门票       | Background             | `style: eventTicket`, background, logo, thumbnail, optional bottom barcode                                                         |
| 活动门票(海报) | Background, no barcode | Same as classic event ticket                                                                                                       |
| 活动门票(海报) | Background, barcode    | `style: eventTicket`, `semantic_layout: true`, `semantics`, artwork, primary logo, optional secondary logo                         |
| 通用凭证       | Background             | `style: generic`, `poster: true`, native iOS 27+ poster generic; background, logo and primary logo; no thumbnail or secondary logo |

The poster generic face has at most four primary fields (event, section, row, seat) and a venue footer. The header shows the date; the start time stays in back fields and `relevantDate`. The background is processed at 345x505 pt and sent as a 1035x1515 PNG. Older systems use the file's `generic` fallback. Without a background, the request falls back to a classic `eventTicket`.

Poster event requests use `eventName`, `venueName`, `venueRegionName` and `venueRoom` semantics. The editor exposes region and room as optional; missing values are sent as empty strings rather than invented places. A performer selects the live-performance event type; otherwise the generic type is used. Accepting these parameters does not guarantee that every iOS version uses the poster layout; devices may fall back to the classic layout.

The mask only applies to classic layouts: 活动门票, and 活动门票(海报) without an active barcode. Thumbnails remain uploadable and visible in classic layouts; poster generic passes hide them until the background is removed.

### Barcodes and download validation

Formats map to QR, PDF417, Aztec and Code128, with `altText` fixed to 仅供展示. The provider source hardcodes Latin-1 and exposes no encoding parameter: remote signing only accepts content whose bytes survive as ASCII UTF-8 or a draft explicitly set to Latin-1. Content that cannot be converted losslessly is rejected before the request. Local signing keeps the draft encoding.

Only HTTPS download URLs on the fixed provider host are accepted; redirects, credentials, query strings and fragments are rejected. The server checks the response type, file and expanded sizes, signature presence, manifest hashes, returned layout, serial number (when supplied) and barcode. A mismatch blocks the install link. These checks are not Apple trust-chain validation and do not modify the signed archive.

Provider links are valid for about one hour. HTTP 400 maps to a parameter error, 402/429 to quota exhaustion, and 503 to provider capacity. EncorePass never retries, pays or enables updatable passes. Quotas and retention follow the [provider documentation](https://walletmcppass.com/llms-full.txt).

### Troubleshooting

HTTP 413 means the request body is too large, not a network failure. Before sending, the server serializes the whole JSON (including base64 expansion) with a conservative 900 KiB budget. Oversized PNGs are palette-quantized and progressively resized while preserving alpha, aspect ratio, text and barcode data. Small requests are unchanged. If compression still exceeds the budget or the provider returns 413, the server returns `REMOTE_PAYLOAD_TOO_LARGE` and does not retry.

`127.0.0.1:3000` in the browser is EncorePass, not the signing service. Remote signing connects from the Node server; a browser that can reach the internet does not prove that Node can.

- `REMOTE_NETWORK_ERROR`: server connection failed; the message includes a safe transport code such as EACCES or ENOTFOUND.
- `REMOTE_TIMEOUT`: the remote operation exceeded 15 seconds.
- `REMOTE_HTTP_ERROR`: the provider returned a non-success status.
- `REMOTE_RESPONSE_INVALID`: the response or download URL is invalid.
- `REMOTE_DOWNLOAD_FAILED`: the pass was created but the download failed; quota may already be consumed.
- `REMOTE_LAYOUT_MISMATCH`, `REMOTE_BARCODE_MISMATCH`, `REMOTE_IDENTITY_MISMATCH`, `REMOTE_PASS_INVALID`: downloaded content failed validation; do not disable the checks.

If the machine needs a proxy, Node's built-in fetch requires explicit startup opt-in. On Node 24.5+, stop the dev server and run this in the same PowerShell (replace the proxy address):

```powershell
$env:HTTP_PROXY = 'http://192.168.31.33:7890'
$env:HTTPS_PROXY = $env:HTTP_PROXY
$env:NO_PROXY = 'localhost,127.0.0.1,::1'
$env:NODE_USE_ENV_PROXY = '1'
npm run dev
```

The variable is read at Node startup; putting it only in Next's `.env.local` is not reliable. Test a read-only connection without consuming quota:

```sh
node --use-env-proxy -e "fetch('https://walletmcppass.com/llms-full.txt').then(r=>console.log(r.status)).catch(e=>console.log(e.cause?.code||e.name))"
```

EACCES/EPERM means the process has restricted network access; enabling a proxy does not guarantee it is lifted. See [Node's enterprise network configuration](https://nodejs.org/learn/http/enterprise-network-configuration).
