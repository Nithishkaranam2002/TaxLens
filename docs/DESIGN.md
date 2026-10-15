# TaxLens design spec (redesign pass)

The redesign is visual only. No change to `src/engine/`, `src/app/` or `src/data/`, no tax number, check or wording of a correction, and no feature or shortcut removed. Rule for every choice: if *looks impressive* and *clear to a CPA* disagree, choose clear.

## What the baseline shows

- **Text is small.** About 560 hard-coded sizes in `src/ui/`, most of them 11 to 13px (127 × 12px, 126 × 12.5px, 64 × 11px). Body is 14px. Badges are 11.5px, sign-off dots 9.5px.
- **Everything is open at once.** Overview runs to about 2,500px at 1440 wide: results, path to filing, all eleven area cards, needs you, since you last looked, team, and the return summary. At 390px it is 11,000px long.
- **Noise.** Each area card can show up to four coloured badges, three sign-off chips and a meter. Almost every row has a border. There are four greys of text.
- **No identity.** Focus is the same blue as the preparer's ink, there are too many equal-weight buttons, and nothing tells you which action matters most.
- **Other problems.** Toasts cover content. The welcome dialog sits on top of the live page. Inbox nests a `<button>` inside a `<button>` (a React warning in the console).

## 1. Type scale

These sizes are defined once as Tailwind v4 theme tokens in `styles.css` (`--text-*`). Every `text-[Npx]` in `src/ui` is changed to a token, so nothing is left smaller than 13px.

| Token | Size / line height | Use |
|---|---|---|
| `text-cap` | 13 / 18, medium | Captions, table headers, badges, meta lines (the smallest text anywhere) |
| `text-sm` | 14 / 20 | Secondary text, dense table cells, sidebar items |
| `text-base` | 15 / 23 | Body text, buttons, inputs, table cells (the default) |
| `text-md` | 16 / 24, semibold | Card titles, drawer section titles |
| `text-lg` | 18 / 26, semibold | Section headings |
| `text-xl` | 22 / 28, semibold | Drawer title, modal title |
| `text-2xl` | 28 / 34, semibold, -0.015em | Page title |
| `text-display` | 40 / 44, semibold, tabular | The refund or balance-due figure on the result cards |

How the old sizes map: 9.5 to 11.5px becomes `cap`, 12 to 12.5px becomes `sm`, 13 to 13.5px becomes `base`, 14 to 15px becomes `md`, 17 to 18px becomes `lg`, 20 to 22px becomes `xl` or `2xl` depending on the role. Uppercase eyebrows stay only for sidebar group labels and table headers, at 12.5px with letter spacing. Numbers always use `.num` (tabular). Amounts in tables are right-aligned at 15px.

## 2. Spacing and layout

- **Spacing scale (4px base):** 4, 8, 12, 16, 24, 32, 48. Inside a card, spacing is 16 to 24px. The gap between page sections is 32px.
- **Cards:** 20px padding (16px on a phone), radius 12px. Cards have a border and **no shadow**; a shadow is used only for things that float (drawer, menus, modals, toasts).
- **Content width:** at most 1400px, centred. Side padding is 32px on desktop, 24px at 1024 and 16px on a phone.
- **Columns:** at 1280px and wider, Overview uses 2 columns (8/12 + 4/12) and Area uses 2 columns (main + a sticky side panel). Below 1024px everything stacks.
- **Control heights:** 40px for primary buttons and inputs (`md`), 36px for compact ones (`sm`). Nothing clickable is shorter than 36px, except inline numbers and links inside text.

## 3. Colour tokens

There is one accent: **Ledger indigo**, a deep indigo. It is used **only for proof links (the underline and hover on every clickable number) and focus rings**. Primary buttons stay near-black (`--btn`), and the active navigation item and selected tabs use the neutral ink (`--fg`), not the accent.

In TaxLens, colour says *who did the work*, so the accent must never read as a person's ink. It was chosen by measuring colour distance (OKLab) against every ink in both themes. The first candidate (`#3b45c4`) sat only 0.056 from preparer blue and 0.077 from partner violet. The chosen `#312e81` (light) and `#c7c9ff` (dark) are 0.13 to 0.17 away from blue and violet in both themes, which is clearly distinguishable. Proof numbers keep their text in `--fg`; only the dotted underline carries the accent. A number's text is coloured only by the ink of the person whose change produced it, as today.

Person inks (preparer blue, reviewer green, partner violet, client amber, slate, teal) stay **only** on avatars, tickmarks and the "who changed it" numbers. Status colours (ok, bad, warn, info) are used only for status.

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--bg` | `#f6f7f9` | `#0e1116` | Neutral cool grey (was green-grey) |
| `--panel` | `#ffffff` | `#151a21` | |
| `--panel-2` | `#f9fafb` | `#1a2029` | Table header, hover |
| `--sunk` | `#eef0f3` | `#0b0e12` | |
| `--line` | `#e4e7ec` | `#262d38` | The only border colour in normal use |
| `--line-2` | `#d0d5dd` | `#353e4b` | Inputs and secondary buttons only |
| `--fg` | `#101828` | `#e9edf2` | |
| `--fg-2` | `#475467` | `#a9b3c1` | Secondary text |
| `--fg-3` | `#667085` | `#8b95a5` | Meta text; meets AA (4.5:1) on panel. The old `#7d877f` did not |
| `--accent` | `#312e81` | `#c7c9ff` | Proof underline and focus ring only |
| `--accent-bg` | `#eeeefb` | `#22234a` | Proof hover background |
| `--btn` / `--btn-fg` | `#111827` / `#ffffff` | `#e9edf2` / `#0e1116` | Primary button (near-black, unchanged role) |
| `--ok` / `--ok-bg` | `#16794a` / `#e8f5ee` | `#5fcf94` / `#10291c` | Refund, passes, signed |
| `--bad` / `--bad-bg` | `#c2361f` / `#fdecea` | `#ff8a75` / `#341a17` | Errors, blocks filing |
| `--warn` / `--warn-bg` | `#a35c00` / `#fff4e0` | `#f0b45a` / `#2e2210` | Reopened, waiting |
| `--info` | `#3460b8` | `#8aa9ff` | Projection ("if pending approved") |

The ink, paper, highlight and scrim tokens keep their current roles; their values are retuned so they match the cooler neutrals.

## 4. Component rules (`kit.tsx`)

- **Button.** There are five variants. `primary` (near-black fill, `--btn`) is used **at most once per page or per drawer section**. `secondary` has a white fill and a `line-2` border. `ghost` is text only. `ok` and `danger` are kept for approve and reject. Sizes are `sm` (36px, 14px text) and `md` (40px, 15px text). Icons are 16px.
- **Badge.** 24px tall, 13px medium text, radius 6px. Tones stay the same. **No more than one status badge per row.** Secondary facts (area, author, "needs reviewer") become plain meta text separated by `·`, not chips.
- **StatusPill.** A dot plus a label. The colour comes from the dot; the label is `fg-2`. The only filled pills are *Blocks filing* and *Overdue*.
- **Card.** It gets an optional `title`, `sub` and `action` slot, so card headers look the same on every page.
- **Tables.** Header row is 13px semibold `fg-3` with no uppercase. Cell padding is 12px × 16px. Rows are separated by a hairline with no zebra striping. Amount columns are right-aligned and tabular. Row hover uses `panel-2`.
- **Inputs, Select, TextArea.** 40px tall, 15px text, radius 8px, a 3px accent focus ring (`--accent` at 35%).
- **Tabs.** 15px, 44px tall, the active tab gets a 2px `--fg` underline, and counts sit in a neutral pill.
- **Segmented and chips.** 36px tall. The active one is filled with `--fg` (dark chip, light text).
- **Proof number (`.proof`).** A 1px dotted underline in the accent colour at 55% opacity. On hover the underline turns solid and a light accent background appears. This is the product's signature and looks the same everywhere.
- **Empty.** The current `Empty` becomes `State`: a 40px icon in a soft circle, a title (16px), one sentence (14px) and an optional single action button. It is used for empty, error and "not yet" states.
- **Loading.** The packet-loading screen shows the logo, a three-step progress list (*Reading the packet → Re-reading 3,012 values → Running 51 checks*; the counts come from the packet), and a skeleton of the shell. Lazy page loads show a skeleton of the page instead of a spinner.
- **Toasts.** Bottom centre on a phone and bottom right on desktop, placed above the drawer footer, 15px text, so they no longer cover the first rows of a list.

## 5. Shell

- **Top bar** (56px): page title (16px, semibold) on the left; search (wider, 15px); season clock; Live/This browser status shown as an icon with a tooltip; bell; theme; person switcher (avatar and name). The bar background is solid `panel` with a bottom hairline.
- **Sidebar** (264px): logo with the file card under it (filers, year, "34 items before filing" with a small progress ring). The groups are kept with clearer labels: **Work** (Overview, Open items), **Areas** (11, with a status dot and a count only when something is open), **Evidence**, **Return**, **People**, **Filing and after**, then Firm. The active item gets a white panel background, a 3px `--fg` bar and full-strength text. Items are 36px tall at 14px. Counts are shown only when greater than zero, in one neutral style; the bad style is reserved for Open items.
- **Welcome** becomes a full-screen product landing rather than a dialog over the app. Left (or top on a phone): logo, one headline (*Every number carries its proof.*), one sentence, and three value points (*Click any number for its proof*, *Rules the firm enforces*, *One log: undo, reopen, file, amend*), each with an icon and one line. Right (or below): two large choice cards (*Start fresh* as Priya, *Load the recorded season* as Daniel), each with an avatar, two lines and an arrow. The four packet facts (74 / 3,012 / 51 / 32) become a quiet strip, still computed from the packet. The footer reads "Built by Nithish Karanam · Case study for MiraFlores AI", plus *Just look around*. All existing tips stay, under a "How it works" disclosure.

## 6. Page plan (progressive disclosure)

| Page | Plan |
|---|---|
| **Overview** | One primary action at the top right (*34 items before filing →*). Two **result cards** (Federal, California): label, a 40px refund or balance figure, and the struck-through **Engine as delivered** figure beside it (kept as the proof point); then three quiet cells (total tax, payments, penalty with deltas) and the "If pending changes are approved" projection as one info line. Below that, two columns. Left: **Path to filing** as a 10-step vertical stepper with progress (*6 of 10 done*); completed steps collapse into one "Show completed" row. Right: **Needs you** (first 5, then *Show all*) and **Since you last looked** (first 5). **Areas** becomes a compact table (name, sign-off marks, one status, hours) instead of 11 cards. **Team** and **Return summary against last year** move behind *Show more* disclosures, collapsed by default. Nothing is removed. |
| **Open items** | Header with the scope switch. One row of filter chips (counts), plus area and search filters on the right. Groups become collapsible sections; the first group with items is expanded and the rest show their title and count. A row shows the title, one status, the detail clamped to 1 line, and meta text. The effect (Fed/CA) sits in a right-aligned tabular column, then the action. The bulk bar sticks to the top of the list as a raised panel. Fixes the nested-button warning. |
| **Proof drawer** | 640px wide (full screen on a phone). The sticky header has the breadcrumb, the line key and form, and the title at 22px. A **value strip** shows Engine (struck through if changed), **Ours** (large, with tickmark), If pending approved, and 2024. Then, in the CPA's order, collapsible sections: *How it was built* (open), *Where it came from* (open), *Changes to this number* (open if there are any), *Checks*, *Engine history*, *Verification*, *Used by*, *Notes*, *Evidence*, *Change this number*. Sections with content show a count; empty ones collapse to a single line. Section headers are 16px sentence case, not uppercase eyebrows. |
| **Document viewer** | Same header style. Larger page text (15px). The highlighted value has a stronger outline (the highlight's own yellow, plus a 2px ring). The page navigator becomes 36px buttons. |
| **Area** | Two columns: the main column has the lines table, findings and changes in tabs; the side panel has the sign-offs (with reopen diffs), documents, budget and notes. |
| **Records** | The 16 records stay. Selection becomes a left list on desktop and a select on a phone (as today), with larger type and tables using the new table rules. |
| **Review, Client, Filing, Firm, Activity** | Same tabs and controls, restyled with the new tokens, `Card` headers, `State` empty states and one primary action per tab. The client portal gets a simpler, friendlier header (the household's name and *what we need from you*) with the same content. |

## 7. Responsive and dark mode

- **1280 to 1920:** max width 1400px, two-column Overview and Area.
- **1024:** the sidebar stays visible, layouts drop to one column, and the result cards stay side by side.
- **Below 1024:** the sidebar becomes the existing slide-in menu.
- **390:** result cards stack; tables scroll inside their own container; the proof drawer goes full width; the bulk bar wraps. 16px side gutter.
- **Dark mode:** every colour comes from tokens with dark values (as today, both `prefers-color-scheme` and `data-theme`). Each step is checked in dark mode with a screenshot.

## 8. How this is checked

After each step: `npm run build && npm test` (39 tests), then screenshots of Welcome, Overview, Open items, Area, the Proof drawer, the Document viewer, Records → Sales, Review, Filing and the Client portal at 1440px and 390px, compared with `design-review/baseline/`, plus a check that the browser console is clean.

## 9. As built: differences from the plan and known exceptions

- **Overview:** the Areas table sits full width below Path to filing and Needs you, not inside the left column. At 1280–1440px the column was too narrow and clipped the hours.
- **Top bar:** the full search field shows from 1280px up; below that it is an icon, so the page title keeps its room at 1024px.
- **Sidebar active item:** the panel background and full-strength text carry the active state. The planned 3px bar is drawn but sits at the edge of the nav padding.
- **Exceptions to the 13px minimum:**
  - Avatar initials scale with the avatar (10px at the smallest 20–24px avatars), and the full name is in the tooltip.
  - The printed filing documents (`src/ui/pages/filingDocs.ts`) keep their own print stylesheet.
- **Data rules kept:**
  - `public/packet.json` is byte-for-byte the delivered packet. Its SHA-256, `ee01f850…`, is unchanged and shown on the welcome screen and in Firm → Data.
  - Every value on screen comes from the packet, the activity log or `src/data/household.ts`. The date of the first engine run in empty states is read from the packet (`useFirstRun` in `src/ui/pages/common.tsx`).
- **Not changed, on purpose:** browser storage keys keep the old `tickmark:` prefix, so work already saved in a browser still loads after the rename.
