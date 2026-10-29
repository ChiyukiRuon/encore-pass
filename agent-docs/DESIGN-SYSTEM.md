# Design system

The interface uses 晴空樱 (Festival Sky): a daytime summer-festival palette drawn from live concerts. Sky blue carries interaction; sakura and lemon are decorative accents. The same tokens drive light and dark mode in `app/globals.css`, which is the source of truth. Component composition and state ownership are documented in `agent-docs/COMPONENTS.md`.

## Colour tokens

| Token              | Light                     | Dark                      | Role                                                    |
| ------------------ | ------------------------- | ------------------------- | ------------------------------------------------------- |
| `--bg`             | `#f2f7ff`                 | `#08111f`                 | Page background, also the lightest pass-preview surface |
| `--surface`        | `#ffffff`                 | `#111d33`                 | Grouped cards                                           |
| `--surface-raised` | `#ffffff`                 | `#1a2a47`                 | Sheets and the selected segment                         |
| `--fill`           | `rgb(40 120 220 / 0.09)`  | `rgb(100 170 255 / 0.14)` | Tinted buttons, icon buttons, chips                     |
| `--fill-strong`    | `rgb(40 120 220 / 0.18)`  | `rgb(100 170 255 / 0.26)` | Switch track, selected image wells                      |
| `--label`          | `#12274a`                 | `#eef5ff`                 | Primary text                                            |
| `--secondary`      | `#546684`                 | `#a3b3cc`                 | Supporting text, labels, captions                       |
| `--tertiary`       | `#8493ab`                 | `#7f90ab`                 | Placeholders, disabled marks                            |
| `--separator`      | `rgb(30 80 160 / 0.13)`   | `rgb(100 170 255 / 0.18)` | Row dividers, borders                                   |
| `--tint`           | `#1f8bff`                 | `#5cb6ff`                 | Focus rings and solid sky accents                       |
| `--tint-text`      | `#0a63c4`                 | `#7cc4ff`                 | Tint-coloured text and links on fills                   |
| `--destructive`    | `#d3183f`                 | `#ff6f8a`                 | Destructive actions and required marks                  |
| `--success`        | `#087a50`                 | `#3fd99b`                 | Checked switch track                                    |
| `--warning`        | `#a85400`                 | `#ffbd59`                 | Warning notices                                         |
| `--material`       | `rgb(242 247 255 / 0.82)` | `rgb(8 17 31 / 0.8)`      | Sticky header over a blurred backdrop                   |

The preview stage is a separate gradient, `--stage`: a sky with white light pools and a lemon glow in light mode, and a star field with a sakura glow in dark mode. It is decorative and must not carry text contrast requirements.

## Usage rules

- **Sky blue carries interaction.** Use `--tint` for focus rings and `--tint-text` for links, icon buttons and plain actions. Use `--fill` / `--fill-strong` for tinted surfaces. Checked switches are the deliberate exception and use `--success`.
- **Pink and lemon are accents only.** They may appear in the brand mark, the stage and decorative highlights, but must not become button, link or focus colours. Red is reserved for destruction, so pink must not compete with it.
- **Destructive actions stay red.** Clear/remove actions and required-field marks use `--destructive`; confirmation sheets tint the destructive button with a red wash rather than a solid red fill.
- **Checked switches use `--success`,** matching iOS settings switches rather than the sky tint.
- **One primary action per page.** The export action uses Apple's black badge asset (`public/wallet/add-to-apple-wallet-cn.svg`) at 50 px high with 8 px corners when Safari on an Apple platform is detected; otherwise it is a tinted grey capsule. Secondary actions use `--fill` or transparent plain styling.
- **The pass is user content.** Pass colours come from the draft (`backgroundColor`, `foregroundColor`, `labelColor`) and are not mapped from UI tokens. New drafts default to `#1668c7` / `#ffffff` / `#fff3b0`. `TicketPreview` binds them inline as `background-color`, `color`, `--pass-bg` and `--pass-label`; the poster band uses `--poster-tone` sampled from the artwork, and the barcode card stays white.
- **Do not introduce new raw colours in components.** Add or adjust a token in `:root` and its dark counterpart instead. Fixed colours are acceptable only where Wallet requires them: the black background mask, the white barcode panel and the poster scrim.
- **Dark mode follows the system.** There is no manual theme toggle; `color-scheme: light dark` and `@media (prefers-color-scheme: dark)` control both the page and form controls.

## Typography

- UI font stack: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Helvetica Neue`, `PingFang SC`, `Hiragino Sans GB`, `Microsoft YaHei`, `Segoe UI`, sans-serif.
- Monospace stack: `ui-monospace`, `SF Mono`, `SFMono-Regular`, `Menlo`, `Consolas`, monospace. Use it for hex values, barcode content and crop coordinates.
- Body text is 16 px with 1.5 line height. Field values are 17 px; labels are 13 px; captions are 12–13 px. Section headings are 20 px, the page title clamps from 30 to 44 px.
- Use Chinese copy in the product UI. Keep the tone calm and concrete; the hero line is the only romantic copy.

## Shape and spacing

- `--radius-card: 16px` for grouped cards; `--radius-control: 10px` for controls; sheets use 20 px with 20 px top corners on mobile. Capsule buttons and switches use `999px`.
- Page frame: maximum width 1200 px, 24 px side padding on desktop and 16 px on mobile. Editor and preview columns are separated by 48 px and collapse below 860 px.
- Grouped rows use 12 px vertical and 16 px horizontal padding; section spacing is 40 px (32 px on mobile).
- Controls have at least a 44 px touch target; the `pointer: coarse` media query enlarges small buttons and icon buttons.

## Motion

- The pass collapse uses 200 ms `cubic-bezier(0.32, 0.72, 0, 1)` for height and body opacity. Reduced motion removes the height movement and keeps a 150 ms fade.
- Sheets animate in over 0.38 s with the same drawer curve and out over 0.22 s with `cubic-bezier(0.4, 0, 1, 1)`. The backdrop dims and blurs by 2 px.
- Buttons scale to 0.97 on press; icon buttons scale to 0.94. Hover effects only apply with `(hover: hover)`.
- The switch knob moves over 0.25 s with `cubic-bezier(0.3, 0.7, 0.4, 1)`.
- Respect `prefers-reduced-motion`; do not add motion that ignores it.

## Accessibility

- Text, control, focus-ring, export-label and default pass colour pairs are documented as meeting WCAG AA in both themes.
- There is no automated contrast test. Recheck any token change with a contrast calculator before merging.
- Keep a visible 3 px `--tint` focus ring with 2 px offset. `:focus-visible` is global; do not remove it.
- Inputs are wrapped in labels, switches use `role="switch"`, segmented controls use `aria-pressed`, and dialogs use native `<dialog>` with labelled titles.
- Do not rely on colour alone: required fields also carry a `*`, errors are text, and status messages use live regions.
- Keep the 44 px target rule when adding icon-only controls.

## CSS conventions

- `app/globals.css` imports Tailwind v4, but the UI is authored with semantic classes (`.group`, `.row`, `.field`, `.pass-*`) rather than utility-class strings. Add new styles in the relevant section of that file instead of introducing CSS modules or a second stylesheet.
- Reuse the existing primitives: `Section` for grouped sections, `.row`, `.field`, `.button`, `.icon-button`, `.switch`, `.segmented`, `.notice`.
- Pass-preview geometry is expressed in `--pt` units derived from the 343 px card width via container queries. Do not hard-code pixel positions that break when the card scales.
- Test both 1280 px desktop and 375 px mobile; the editor grid collapses and the image slots become rows below 640 px.
