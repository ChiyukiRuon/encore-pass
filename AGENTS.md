# Agent instructions

- Read `agent-docs/IMPLEMENTATION.md`, `agent-docs/ARCHITECTURE.md`, `agent-docs/OPERATIONS.md` and `agent-docs/VERIFICATION.md` before changes. For Apple Wallet pass rules, follow the links under “Apple references” in `agent-docs/IMPLEMENTATION.md`; read `agent-docs/DESIGN-SYSTEM.md` / `agent-docs/COMPONENTS.md` before changing UI.
- Documentation lives in `agent-docs/` and is written in English; `README.md` is the Chinese project entry point. Do not create a `docs/` directory. Keep `README.md`, `agent-docs/` links and this file current when behavior changes.
- Never vendor or copy external documentation into the repository. Link to the original Apple or Wallet MCP Pass source instead.
- Use four-space indentation, single-quoted TypeScript strings, no statement-ending semicolons, and `import type` for types. Use camelCase functions, PascalCase types and lowercase or kebab-case filenames.
- Do not commit or push without explicit permission. Use English Conventional Commits when requested.
- Keep source tickets and OCR in the browser. Never log barcode payloads, request bodies, secrets, certificate paths or provider responses. Never treat an unsigned archive as an installable pass. Do not add analytics, session replay, request-body logging or error tracking.
- Remote signing through walletmcppass must keep explicit user consent, the `X-Encore-Remote-Sign` boundary check, response validation and bounded payloads. Never add automatic retries or payments.
- Run typecheck, lint, unit/integration tests and the production build for functional changes. Run desktop/mobile Playwright tests for UI changes and `npx playwright install chromium` before the first browser run; disclose unverified device or Docker behavior. Use only synthetic tickets and ephemeral self-signed certificates in tests; never real tickets, certificates or signed passes.
- Pin exact dependency versions; `package-lock.json` owns transitive versions. Do not reintroduce browser OCR, PDF import, language-model assets or `public/vendor` steps without a specification change.
- Image sizes and outputs live in `lib/ticket/appearance.ts` and are shared by browser and server. Keep `app/icon.svg`, `BrandMark` in `app/layout.tsx` and `iconSvg` in `lib/wallet/pass-builder.ts` in sync.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
