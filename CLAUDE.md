# 5ABI.FX site: standing rules for every thread

Each of these broke once, got fixed, then came back in a later redesign. Read before touching any page.

## Layout (public/guards.css is loaded LAST on every page: never delete or weaken it)
- Wide PC (1920, 2560+): members content is capped at **1680px and centred**. Never stuck to the left, never full-bleed
  (owner said full width is "too big", PR #65). Public pages keep their own centred `.wrap` widths.
- Round icon buttons (☰ menu, What's new, any circle with an icon): icon in the **exact centre**. Global `button` styles
  add padding/uppercase/letter-spacing; reset them (`padding: 0`) on any new icon button.
- Phones: one ☰ button opens one panel with every page; the page must never scroll sideways.
- When the menu or page shell changes (side menu, top bar, etc.), re-check the two rules above. That is how they regressed (PR #100).
- `public/style.css` is huge: close every `@media {` block you open (an unclosed one broke the whole site twice).
- CSS/JS links get `?v=<build>` added automatically (src/server.js); link new files as plain `href="/x.css"` / `src="/x.js"` so phones never show stale styles.
- Cinematic pages (home, mentorship) keep motion even with iPhone "Reduce Motion" on (owner wants it, PR #33).

## Look
- Dark 5ABI.FX theme: near-black #050507, orange #ff5a1f accent, teal #26c6a0 profit, red #f0464b loss; Sora / Manrope. Load the `5abifx-brand` skill for design work.
- Members can pick any Appearance background (public/look.js). Text must stay readable on every one, light pictures included: keep panels dark glass, never hardcode text that assumes a black page behind it.
- Keep members pages compact (public/compact.css): small text, tight cards.

## MT5 / product
- MT5 chart label text is cut at 63 characters: keep every label short.
- KATANA is named on broker/help pages; never name 5ABI.FX there. Never name "Bookmap" (say "heatmap") and never reveal the mentorship method publicly.

## What's new (automatic, the owner never writes it)
- Every PR that changes something members can see adds 1-3 lines to `src/whatsnew-notes.json`
  (`id` unique like `2026-11-26-my-tools`, `name` ≤30 chars, `line` ≤50 chars in plain words, optional `link`, `icon`
  from src/whatsnew.js ICONS, `audience` all/students/admins). They publish by themselves on the next deploy.
- Anything about Compass gets `"audience": "students"`. Never edit or reuse an old id (members would see it twice).

## How we work (saves credits)
- New designs: show a mockup or screenshots to the owner FIRST, open a PR only after they approve. The owner merges.
- Before every PR run the screenshot check and attach the shots:
  `node scripts/shots.js --out /mnt/project-files/shots/<change> /page [/page ...]` (add `--public` for signed-out pages,
  `--look ph-gt` to test a light background). It saves exactly 3 shots per page (PC 2560, laptop 1366, phone 390) and
  prints FAIL for off-centre content, off-centre icons or sideways scroll. Keep to these 3 shots per change.
- Reuse what exists before making anything new: images, logos, backgrounds, mockups and past screenshots live in
  `/mnt/project-files/` (brand/, appearance/, references/, cards/ ...). Don't regenerate assets that are already there.
- Lean work: no subagents unless asked, short replies, re-run only failing tests (`npm test` is the smoke test).
