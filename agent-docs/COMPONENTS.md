# Component architecture

The UI is a small React tree with one stateful orchestrator. There is no global store, context provider, component library or CSS-module layer. Business rules live in `lib/`; components render those rules and own only the UI state that does not belong in the draft.

## Rendering boundaries

- `app/layout.tsx` is the server layout. It renders the sticky header, `BrandMark`, the GitHub link and `<main>`.
- `app/page.tsx` and `app/editor/page.tsx` are server pages that both render `TicketEditor`.
- Interactive files start with `'use client'`: `TicketEditor`, `EventSection`, `StyleSection`, `SaveHelp`, `ConfirmSheet`, `ClearDraft`, `ImageCropDialog` and `TicketPreview`.
- `components/editor/section.tsx` has no directive; it is a presentational wrapper that becomes part of the client bundle when imported by a client component.
- `app/api/passes/route.ts` and `app/api/health/route.ts` are server-only route handlers.

## Component tree

```text
RootLayout (server)
└── TicketEditor (client, owns the draft and export flow)
    ├── EventSection (client)
    │   └── Section step 1
    │       ├── draft fields
    │       └── action: import file input + ClearDraft
    │           └── ConfirmSheet
    ├── StyleSection (client)
    │   └── Section step 2
    │       ├── style segmented control, barcode switch and fields
    │       ├── image slots and inline position illustrations
    │       ├── background mask slider
    │       └── ImageCropDialog
    ├── Section step 3 + SaveHelp
    ├── ConfirmSheet (import replacement)
    ├── ConfirmSheet (third-party signing consent)
    └── TicketPreview (client, read-only from the draft)
```

## Responsibilities

| Component         | Responsibility                                                                                                 | State and props                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TicketEditor`    | Owns the draft, persistence, import/export, signing consent, status messages and layout composition.           | `draft`, `message`, `storageError`, `clearing`, `importing`, `exporting`, `remoteSign`, `consentOpen`, `walletUrl`, `pendingImport`; refs for the file input, save timer, cleared draft, consent switch and pending save. Passes `draft`, `update`, `setDraft` and `onMessage` down. |
| `Section`         | iOS-style inset group: numbered heading, description, optional heading action and footer.                      | Presentational props `step`, `title`, `description`, `footer`, `action`, `children`. Uses `useId` for `aria-labelledby`.                                                                                                                                                             |
| `EventSection`    | Renders event, venue, seat and timezone fields. Exports the shared `DraftUpdate` generic updater type.         | Controlled by `draft` and `update`; reports conversion errors through `onMessage`; accepts a heading `action`.                                                                                                                                                                       |
| `StyleSection`    | Style selector, barcode switch and editor, image slots, mask slider and crop flow.                             | Controlled draft plus local `barcodeFormat` (ephemeral display choice) and `cropRequest` (open picker). Uses `setDraft` for nested appearance/barcode changes.                                                                                                                       |
| `ImageCropDialog` | Full-source crop picker with draggable/resizable frame, locked aspect, keyboard handles and focus restoration. | Controlled props `title`, `source`, `initialCrop`, `aspect`, `lockLabel`, `onCancel`, `onConfirm`; local `crop`, `box`, `natural`, `failed`, `closing`.                                                                                                                              |
| `SaveHelp`        | Question-mark trigger and four-section save/privacy sheet.                                                     | Owns dialog open/close animation and focus return; no business state.                                                                                                                                                                                                                |
| `ConfirmSheet`    | Shared destructive/primary confirmation sheet used by clear, import replacement and signing consent.           | Controlled props `open`, `title`, `message`, `confirmLabel`, `closeLabel`, `confirmTone`, `returnFocus`, `onCancel`, `onConfirm`; owns `closing` and the pending action.                                                                                                             |
| `ClearDraft`      | Icon-only clear action that opens a destructive `ConfirmSheet`.                                                | `disabled`, `onConfirm`; owns `open`.                                                                                                                                                                                                                                                |
| `TicketPreview`   | Draws the 343x474 pt Wallet approximation, barcode canvas, poster band and collapse toggle.                    | Read-only `draft`; local `collapsed` and `posterTone`. Uses `usesPosterLayout`, `activeBarcode`, `passFields` and `genericPosterFields` from `lib/`.                                                                                                                                 |

## State ownership

- **Business state lives in `TicketEditor`.** The draft is one `TicketDraft` object; `update(key, value)` applies a shallow immutable update, and `setDraft` is passed down for nested appearance, crop and barcode changes. Do not create parallel copies of pass fields in child components.
- **Persistence stays in `TicketEditor`.** The 400 ms debounce, `loadDraft`/`saveDraft`/`deleteDraft`, pending-save draining and storage errors are all handled there.
- **Ephemeral UI state stays local.** `barcodeFormat` holds the chosen format before a barcode object exists; once content is entered, the draft's `barcode` owns the format. `cropRequest` describes an open dialog; `collapsed` and `posterTone` are preview-only.
- **Dialogs are controlled from the parent.** A parent passes `open` and callbacks; the dialog owns its closing animation, backdrop dismissal, scroll lock and focus return. Do not mount/unmount dialogs solely to animate them.
- **The preview never mutates the draft.** It derives layout, fields, barcode and tone from the draft, so preview and signing share `usesPosterLayout` and `activeBarcode`.

## Interaction patterns

- **Native `<dialog>` with `showModal()`.** The save guide, confirm sheet and crop picker use the platform dialog, `::backdrop`, a `closing` state and a timer fallback. Backdrop clicks are detected by comparing the click point to the dialog box because `::backdrop` is not a DOM node.
- **Focus and scroll are explicit.** Opening stores the trigger, closing returns focus, and `body.has-dialog` locks scrolling. The root reserves a scrollbar gutter to avoid layout shift.
- **Reduced motion is honoured.** Closing timers and CSS animations have reduced-motion variants; the pass keeps a short fade instead of the height transition.
- **Section composition.** The editor uses `Section` for the numbered groups. Form controls use `.row`, `.field`, `.field-label`, `.toggle-row` and `.switch` so labels, borders and spacing stay consistent.
- **Inline SVG, no icon package.** The brand mark, GitHub icon, import/trash icons and image-slot illustrations are inline SVG. Keep `app/icon.svg`, `BrandMark` and the pass-icon SVG in sync.
- **Barcode rendering is browser-local.** `TicketPreview` dynamically loads `bwip-js` to draw the canvas; barcode content never goes to the server for preview.
- **Image flow.** File selection -> `appearanceImage` downscale -> `ImageCropDialog` -> `cropImage` -> draft data URLs plus optional `imageSources`/`imageCrops`. Signing strips the sources and crops before `POST /api/passes`.
- **No portal or animation library.** Dialog animation and focus management are hand-written in the component and `globals.css`.

## Styling and testing conventions

- Add component styles to `app/globals.css` near the related block, using the design tokens from `agent-docs/DESIGN-SYSTEM.md`. Do not add CSS modules or a second global stylesheet.
- The pass preview exposes `data-style`, `data-layout` and `data-collapsed`. Playwright tests select `.pass[data-layout="poster"]` and similar attributes; keep these stable.
- Use roles, labels and `aria-*` for test selectors where possible. The tests use `getByRole('switch', { name: '显示条码' })`, `getByLabel('条码内容')` and `getByRole('button', { name: '活动门票(海报)' })`.
- Keep the 1280 px desktop and 375 px mobile layouts working. The editor grid collapses below 860 px and image slots become rows below 640 px.
- Add or update Playwright coverage for new interaction, and unit coverage for new domain rules in `lib/`, not in components.

## Adding or changing a component

1. Decide whether it needs `'use client'`. Use it only for hooks, browser APIs, event handlers or canvas; keep data-only pieces server-compatible.
2. Put validation, layout gating, field mapping and image rules in `lib/`. Import the shared helper instead of re-deriving the rule in JSX.
3. Reuse `Section`, `.row`, `.field`, `.button`, `.icon-button`, `.switch` and `.segmented`; add a token if a new colour is unavoidable.
4. Cover keyboard access, focus return, `aria-*`, reduced motion and the 44 px touch target.
5. Run typecheck, lint, unit/integration tests and the production build; run desktop and mobile Playwright tests for UI changes.
