# UAT Checklist — Wave 1 & 2 Web Pages + Pattern Interactivity

Generated: 2026-04-14
Covers: /leaderboard · /simulate · /watch · /copy · /patterns · /patterns/[id] · PatternCard · Feed page · Navigation

---

## Your app is running at http://localhost:3000. Open it in your browser, then work through each step below.

A note on data: the leaderboard, copy, and watch pages pull live data from the Pacifica testnet.
If the testnet is slow, some panels may show "no positions found" — that is expected and tested below.
The intelligence patterns pages require a local server on port 4242; steps below tell you what to expect when it is offline.

---

## Group A — Navigation

**Step 1 — Check the navbar shows all 7 links**

Go to: http://localhost:3000

Look at the top bar across the full width of the page.

You should see (left to right): **Feed · Patterns · Reputation · Leaderboard · Watch · Simulate · Copy** plus an orange "Snapshot →" button on the right.

If anything is missing or the nav looks broken, tell me which link is absent.

---

## Group B — Leaderboard (/leaderboard)

**Step 2 — Page loads and shows the header**

Go to: http://localhost:3000/leaderboard

You should see:
- A small orange label reading "/ LIVE LEADERBOARD"
- A heading "Top Traders"
- A subtitle in grey monospace text mentioning "Ranked by all-time P&L · Pacifica testnet · Live positions for top 8"

---

**Step 3 — Trader rows appear with P&L numbers**

Scroll down. You should see a list of rows, one per trader.

Each row should show:
- A rank number on the left (rank 1 is yellow, rank 2 is light grey, rank 3 is orange, ranks 4+ are dark grey)
- A trader name or shortened wallet address that turns orange when you hover over it
- Green numbers for positive P&L, red numbers for negative P&L
- An orange REP score badge on the right (visible on desktop width)

The top 3 rows should have small orange corner-bracket decorations at their corners.

---

**Step 4 — Live position pills appear under top 8 traders**

Look at the first several trader rows. Under some of them (for any trader in positions 1–8 who has open trades), you should see small coloured pills — green pills with an upward arrow for long positions, red pills with a downward arrow for shorts. Each pill shows the asset name and a dollar amount.

If a trader has no open positions, no pills appear — that is correct behaviour.

---

**Step 5 — Trader name links work**

Click on any trader name in the list.

You should land on a page at a URL like http://localhost:3000/trader/[address]. The page does not need to be fully built — landing there without a crash is a pass.

Press the back button to return to /leaderboard.

---

**Step 6 — Bottom CTA shows Copy and Intelligence Ledger buttons**

Scroll to the very bottom of the leaderboard page.

You should see a panel with:
- The text "See a trader you like?"
- An orange "Copy Trader →" button
- A grey outlined "Intelligence Ledger" button

Click "Copy Trader →" — it should take you to http://localhost:3000/copy.

---

## Group C — Trade Simulator (/simulate)

**Step 7 — Simulator form loads**

Go to: http://localhost:3000/simulate

You should see:
- Orange label "/ TRADE SIMULATOR" at the top
- Heading "Risk Simulator"
- A form on the left with these fields: Direction (Long / Short toggle), Market (dropdown), a custom market text box, Size (USD), Leverage, Entry Price, and 8h Funding Rate
- A grey placeholder panel on the right saying "Fill in the form and click Run Simulation"

---

**Step 8 — Run a valid long simulation**

Do this:
1. Click the "↑ Long" button — it should turn green
2. In the Market dropdown, select "ETH"
3. In Size (USD), type: `5000`
4. In Leverage, type: `10`
5. In Entry Price, type: `3200`
6. Leave Funding Rate at its default
7. Click the orange "Run Simulation →" button

You should see a results panel appear on the right with:
- A green "LONG" badge and "ETH-PERP 10x"
- Entry Price showing $3,200.00
- A Liquidation Price in red (it should be noticeably lower than $3,200 for a long — around $2,900 at 10x)
- Margin Required showing $500
- A "Distance to Liquidation" progress bar filled partly with an orange-red gradient
- A "P&L Scenarios" section with six rows labelled +5%, +10%, +20%, -5%, -10%, -20%, with green values for gains and red values for losses
- A "Funding Cost" section showing 8h, 24h, and 7d projections in red (cost for the long)

---

**Step 9 — Switch to short, see results flip**

Do this:
1. Click "↓ Short" — button turns red
2. Keep all other values the same
3. Click "Run Simulation →"

You should see:
- The badge now says "SHORT" in red
- The Liquidation Price is now higher than your entry (opposite direction from Step 8 — around $3,500 at 10x for a short)
- The P&L Scenarios table now lists -5%, -10%, -20% first (the profitable directions for a short), with green values

---

**Step 10 — Try a custom market**

In the "or type…" box to the right of the market dropdown, type: `WLD`

Then click "Run Simulation →" (make sure Size and Leverage and Entry Price still have values).

You should see: the results header now reads "WLD-PERP" instead of "ETH-PERP".

---

**Step 11 — Error state: empty entry price**

Do this:
1. Clear the Entry Price field (leave it blank)
2. Click "Run Simulation →"

You should see: a small red error message appear below the Funding Rate field reading "Enter a valid entry price." The results panel should not change.

---

**Step 12 — Error state: leverage below 1**

Do this:
1. Set Leverage to `0`
2. Fill in a valid Entry Price (e.g. `3200`)
3. Click "Run Simulation →"

You should see: red text saying "Leverage must be at least 1."

---

## Group D — Watch (/watch)

**Step 13 — Page loads with header and countdown**

Go to: http://localhost:3000/watch

You should see:
- Orange label "/ LIVE MONITOR" and heading "Watch"
- A subtitle mentioning "Auto-refreshes every 30s"
- A small "↺ Refresh" button in the top-right corner
- A countdown timer below it (e.g. "next in 30s") that ticks down every second

---

**Step 14 — Top Trader Positions panel**

Look at the "Top Trader Positions" panel (right side on desktop, below on mobile).

If the testnet has active positions, you should see rows with:
- A green ↑ or red ↓ direction arrow
- An asset name (e.g. BTC, ETH)
- A quantity and entry price in grey monospace
- An orange "REP XX" badge on the right
- A shortened wallet address that turns orange on hover

If no positions are found, you will see "No open positions found" in grey. That is acceptable.

---

**Step 15 — Active Signals panel**

Look at the "Active Signals" panel (left side on desktop).

If the local intelligence server on port 4242 is running, you should see rows with signal data.

If the server is offline, you should see "No live signals — intelligence server offline" in grey. Below the panels, a note in small text should appear: "Active signals require the local intelligence server running on port 4242."

Either state is a pass. Tell me which one you see.

---

**Step 16 — Manual refresh works**

Click the "↺ Refresh" button.

You should see: the button text changes to "Refreshing…" briefly, then returns to "↺ Refresh". The "Updated HH:MM:SS" timestamp next to the countdown should update to the current time. The countdown resets to 30.

---

**Step 17 — Quick-links grid**

Scroll down. You should see 4 tiles in a grid:
- "Simulate a Trade" — clicking it goes to /simulate
- "Leaderboard" — clicking it goes to /leaderboard
- "Copy a Trader" — clicking it goes to /copy
- "Intelligence Feed" — clicking it goes to /

Test one of them. Press back to return to /watch.

---

## Group E — Copy Trading (/copy)

**Step 18 — Page loads with left panel and empty right panel**

Go to: http://localhost:3000/copy

You should see:
- Orange label "/ COPY TRADING" and heading "Copy a Trader"
- On the left: a dark input panel with orange corner brackets, a text field labelled "Wallet Address", and an orange "Look Up Positions →" button
- Below the input, a list labelled "Top Traders — Click to Load" with 5–10 trader rows showing addresses, equity values, all-time P&L in green/red, and orange REP scores
- On the right: a grey placeholder saying "Select a trader or enter an address to see their positions"

---

**Step 19 — Click a top trader from the quick-pick list**

Click on any trader in the "Top Traders" list on the left.

You should see:
- The address field fills with their wallet address automatically
- The button changes to "Fetching…" briefly
- If that trader has open positions, cards appear on the right, each showing: a green LONG or red SHORT badge, the asset name, Size, Entry price, Liquidation price in red, and Funding
- If they have no positions: a message reads "Trader is currently flat · No open positions" — that is correct

---

**Step 20 — Simulate button per position**

If Step 19 showed any open positions, look at the top-right corner of a position card.

You should see a small "Simulate →" link.

Click it. You should land on http://localhost:3000/simulate with the direction and symbol pre-filled in the URL (visible as `?side=long&symbol=ETH` or similar). The simulator form should open normally.

Press back to return to /copy.

---

**Step 21 — Error state: empty address**

Do this:
1. Clear the address field
2. Click "Look Up Positions →"

You should see: small red text reading "Enter a wallet address." appearing above the button. The right panel should not change.

---

**Step 22 — Full Profile link**

If Step 19 showed open positions, look for a "Full Profile →" link in small orange text above the positions list.

Click it. You should land on a URL like http://localhost:3000/trader/[address].

Press back to return to /copy.

---

## Group F — Pattern Library (/patterns)

**Step 23 — Page loads**

Go to: http://localhost:3000/patterns

You should see:
- Orange label "/ PATTERN LIBRARY"
- Heading "Verified Market Patterns"
- A stats bar with four numbers: Total Patterns · Verified · Avg Win Rate · Live Right Now

---

**Step 24 — When the intelligence server is offline**

If the intelligence server is not running, you should see:
- All four stats bar numbers showing 0 or —
- A dark panel below with the text "Intelligence server offline" and an orange code snippet: `$ pacifica intelligence start`
- No pattern cards appear

This is the correct offline state. Tell me if you see this.

---

**Step 25 — When the intelligence server is online (if applicable)**

If pattern cards are visible, each card should show:
- An orange "VERIFIED" pill badge in the top-left
- A "LIVE" badge with a pulsing orange dot if that pattern is currently active (top-right)
- The pattern name in white (turns orange on hover)
- Two condition chips below the name in small grey monospace text
- Three stats in a grid: Win Rate (orange), Sample, Avg P&L (green)
- Clickable asset chips (e.g. BTC, ETH) below the stats — these should be separate clickable links
- An action bar at the bottom of each card with three links: "Snapshot →", "Simulate →", "Details →"

---

**Step 26 — Pattern card interactivity**

If cards are visible:

1. Hover over the pattern name on any card — it should turn orange
2. Click an asset chip (e.g. "ETH") — you should land on http://localhost:3000/snapshot/ETH, not on the pattern detail page. Press back.
3. Click "Simulate →" in the action bar — you should land on /simulate with side and symbol pre-filled. Press back.
4. Click "Details →" — you should land on the pattern detail page. Press back.
5. Click anywhere else on the card — you should also land on the pattern detail page.

---

**Step 27 — LiveSignalBanner (if server is online)**

Near the top of the /patterns page, just above the stats bar, look for a banner that shows live signals.

If the server is online, it should show a banner with signal data and auto-refresh every 60 seconds.

If the server is offline, the banner does not appear — that is correct.

---

## Group G — Pattern Detail (/patterns/[id])

**Step 28 — Offline state: "not found" error**

Go to: http://localhost:3000/patterns/fake-id-that-does-not-exist

You should see:
- Orange label "/ PATTERN NOT FOUND"
- Heading "Pattern not found"
- A message: "The pattern you're looking for doesn't exist or the intelligence server is offline."
- A link "← Back to pattern library" that returns you to /patterns

---

**Step 29 — Online state: pattern detail page (if server is running)**

If you have a real pattern ID (visible in the URL when you clicked "Details →" in Step 26), visit that URL directly.

You should see:
- "← All patterns" back link
- The pattern name as a large heading
- "VERIFIED" orange badge + "LIVE" pulsing badge if currently active
- A stats bar with four large numbers: Win Rate (orange), Sample Size, Avg P&L (green), Avg Hold
- A "/ CONDITIONS" section listing each required market condition with: condition label, threshold value, current live value, and a status chip — green "✓ MATCH", orange "~ NEAR", red "✗ NO", or grey "— OFFLINE"
- A "/ LIVE MARKET SCAN" section with cards for each primary asset, each showing a "● MATCHING" or "○ NO MATCH" badge
- An action bar at the bottom with "Simulate (best match) →", "View Snapshot →", and "← All Patterns" links

If the server is offline, conditions show "— OFFLINE" chips and market cards show "OFFLINE" badges — that is correct.

---

**Step 30 — Simulate (best match) button**

On the pattern detail page, click the orange "Simulate (best match) →" button.

You should land on /simulate with a URL like `?side=long&symbol=ETH` or similar — the side and symbol should be pre-filled based on the pattern's conditions.

---

## Group H — Intelligence Feed (/) 

**Step 31 — Hero section loads**

Go to: http://localhost:3000

You should see a large dark hero section with large white text. Below it, a stats bar with four numbers: Verified Patterns · Intelligence Records (showing "80+") · Top Pattern Win Rate (showing "72.3%") · Tracked Traders.

---

**Step 32 — Active Patterns section — offline state**

Scroll down past the hero to the "/ ACTIVE PATTERNS" section.

If the local server is offline, you should see a dark panel with:
- "Intelligence server offline" in white bold
- "Patterns are detected from your live trade data." in grey
- An orange code snippet
- Two grey links: "Browse pattern library →" and "What are patterns? →" — both should go to /patterns

---

**Step 33 — Whale Activity and High Rep Signals sections**

Keep scrolling. You should see two side-by-side sections: "/ WHALE ACTIVITY" and "/ HIGH REP SIGNALS".

These pull from the live Pacifica testnet API. If the testnet has data:
- Whale Activity rows show: a coloured dot (green for long, red for short), asset name, direction label, dollar amount, and time ago
- High Rep Signals rows show: asset, direction label, an orange "REP XX" badge, and time ago

If no data is returned, grey "No live data available" / "No high-rep traders with open positions" messages appear.

---

**Step 34 — Bottom CTA section**

Scroll to near the bottom. You should see a large section with a subtle diagonal crosshatch pattern and an orange radial glow behind the text "Intelligence compounds over time."

Below that text, two buttons: an orange "Explore Patterns" button and an outlined "Reputation Ledger" button with orange corner brackets.

Click "Explore Patterns" — should go to /patterns. Press back.
Click "Reputation Ledger" — should go to /reputation. Press back.

---

## When you're done testing

Tell me one of these:

- **"Everything looks good"** — I'll move on to the next task
- **"[Step N] didn't work"** — describe what you saw and I'll fix it
- **"I saw an error"** — copy and paste any red text or error messages visible on screen

Things that are expected and not bugs:
- /watch and /leaderboard showing "no positions" — testnet may have no live activity
- /patterns showing "Intelligence server offline" — the local server on port 4242 is not running
- /patterns/[id] showing "Pattern not found" when you visit a fake ID
- Signal panels on /watch being empty if port 4242 is offline
