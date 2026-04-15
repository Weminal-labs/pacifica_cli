## Test: M12 Portfolio Page

Your app is running at **http://localhost:3000**. Open it in your browser, then work through these steps in order.

---

**Step 1 — Confirm the "not connected" screen loads correctly**

Go to: http://localhost:3000/portfolio

Do this:
1. Look at the page without doing anything else first.

You should see: A dark page centred in the browser with the label "/ MY PORTFOLIO" in small orange text, a large heading that says "Connect your wallet", a short sentence about Phantom wallet and intelligence overlays, and an orange button labelled "Connect Wallet". Nothing else should be visible — no position data, no numbers.

If something looks wrong: Tell me "Step 1 didn't work" and describe what you see instead (for example, a blank white page, a loading spinner that never goes away, or an error message).

---

**Step 2 — Connect your Phantom wallet**

Stay on: http://localhost:3000/portfolio

Do this:
1. Click the orange "Connect Wallet" button.
2. A Phantom wallet popup will appear — approve the connection.

You should see: The page changes immediately. The "Connect your wallet" screen disappears and is replaced by portfolio content. At the top-left you should see "/ MY PORTFOLIO" in orange, a heading "My Portfolio", and your wallet address shown in a shortened form like `0xABCD...EF12`. In the top-right corner you should see a dollar amount labelled "total equity".

If something looks wrong: Tell me "Step 2 didn't work" and describe what happened — for example, the popup didn't appear, the page stayed on the "Connect Wallet" screen, or the page went blank.

---

**Step 3 — Check the equity strip**

Stay on: http://localhost:3000/portfolio (after connecting)

Do this:
1. Look at the row of numbers that appears just below your wallet address.

You should see: A dark bar containing labelled figures in this order: Equity, Available, Margin Used, Fee Tier, Maker / Taker, Open Positions, Open Orders. The Margin Used figure should be coloured — green if margin usage is healthy, yellow if it is elevated, red if it is dangerously high. The Fee Tier should show something like "L1" or "L2".

If something looks wrong: Tell me "Step 3 didn't work" and describe which label is missing or which number looks obviously broken (for example, "—" showing everywhere, or the bar not appearing at all).

---

**Step 4 — Check the summary stats bar**

Stay on: http://localhost:3000/portfolio

Do this:
1. Look at the three stat boxes below the equity strip.

You should see: Three boxes side by side labelled "Open Positions", "Accounts", and "Win Rate". Each shows a single number or percentage. Win Rate will show "—" if your wallet has no reputation history yet — that is fine.

If something looks wrong: Tell me "Step 4 didn't work" and describe what the boxes show.

---

**Step 5 — Check your open positions (if you have any)**

Stay on: http://localhost:3000/portfolio

Do this:
1. Scroll down past the stats boxes to the "Open Positions" section.
2. If you see position cards, look at one card closely.

You should see one of two things:

**If you have open positions:** One or more dark cards, each showing the asset name (for example "BTC" or "ETH"), a green "LONG" or red "SHORT" badge, leverage info (like "5x cross"), and a grid of numbers for Size, Entry, Mark price, Unrealized PnL, Liquidation price, and a "View →" link for the snapshot. The PnL number should be green if positive and red if negative. At the top-right of each card there should be a small orange-outlined link labelled "Trade on Pacifica ↗".

**If you have no open positions:** A bordered box with the message "No open positions on this account." and a link below it that says "Open Pacifica testnet to trade ↗".

If something looks wrong: Tell me "Step 5 didn't work" and describe what you see — for example the cards are there but numbers show as "NaN" or the cards are missing entirely.

---

**Step 6 — Check the intelligence overlays on a position card (if positions exist)**

Only do this step if you saw position cards in Step 5.

Do this:
1. Look at the bottom section of any position card, below the numbers grid.

You should see: One or more of the following labelled rows beneath the numbers grid:
- An orange "PATTERN" badge followed by a pattern name and a win-rate percentage — for example "72% win"
- A blue "REP" badge followed by text like "3 high-rep traders in same position" and a "view →" link
- A grey "FUNDING" badge followed by a funding rate like "+0.0125%" and a trend arrow (↑ ↓ →), plus a "next settle Xh Ym" countdown

If none of those badges appear, you should instead see the message "No active intelligence signals for this position." in small grey text.

If something looks wrong: Tell me "Step 6 didn't work" and describe what is showing where those overlays should be.

---

**Step 7 — Test the "Trade on Pacifica" deep link**

Do this:
1. If you have a position card, click the orange "Trade on Pacifica ↗" link in its top-right corner.
2. If you have no positions, skip to Step 8.

You should see: A new browser tab opens and takes you directly to the Pacifica testnet trading page for that specific market — for example `https://test-app.pacifica.fi/trade/BTC-PERP`. The URL in the new tab should end with the asset symbol that matched your position card.

If something looks wrong: Tell me "Step 7 didn't work" and describe where the link sent you, or if it did not open a new tab.

---

**Step 8 — Check the quick links section**

Stay on: http://localhost:3000/portfolio

Do this:
1. Scroll to the bottom of the page to the section labelled "Intelligence Features".
2. Look at the four link boxes.

You should see: Four dark cards in a row (two per row on a small screen) labelled "Pattern Library", "Reputation Ledger", "ETH Snapshot", and "Public Profile". Each card has a small subtitle beneath it. Hovering over a card should make its corner brackets turn more visible orange.

If something looks wrong: Tell me "Step 8 didn't work" and describe which cards are missing or what text appears instead.

---

**Step 9 — Test the quick links navigate correctly**

Do this:
1. Click "Pattern Library".
2. Check that the page changes to the patterns section.
3. Click your browser's back button to return to the portfolio page.
4. Click "ETH Snapshot".
5. Check that it takes you to an ETH snapshot page.
6. Click back to return to the portfolio page.

You should see: Each link takes you to a different page of the app. The back button works normally. You should not land on an error page or see a "404 Not Found" message.

If something looks wrong: Tell me "Step 9 didn't work" and say which link took you somewhere unexpected.

---

**Step 10 — Test the skeleton loading state (deliberate interrupt)**

Try this on purpose:
1. Open a new browser tab.
2. Go to: http://localhost:3000/portfolio
3. Watch the very first moment the page loads, before your wallet connection is recognised.

You should see: For a brief moment (less than a second) the page shows several grey/dark rectangular placeholder blocks — a short bar at the top, a wide bar below it, and two tall stacked rectangles. These blocks pulse or fade gently. Then they disappear and the real content appears. If the page loads instantly with no skeleton, that is also fine — it just means the wallet session was already cached.

If something looks wrong: Tell me "Step 10 didn't work" — for example if the page stays as grey blocks and never resolves into real content.

---

**Step 11 — Test the error state (deliberate break)**

Try this on purpose:
1. Open a new browser tab.
2. In that tab, go to: http://localhost:3000/portfolio
3. While staying connected (do not disconnect your wallet), temporarily block access to the intelligence data — you can do this by adding `?_test=error` to the URL to see if the page naturally handles an unavailable data source, OR simply note that this state would appear if the intelligence server at port 4242 were offline.

Actually do this instead — it is simpler:
1. Stay on the portfolio page.
2. Look at the top-right area of the header for the text "stale data" in small yellow text.

You should see: Either the portfolio loads normally (good — the server is up), OR if the intelligence server is unavailable, the page shows your wallet address, the four quick-link boxes (Pattern Library, Reputation Ledger, ETH Snapshot, Public Profile), and a bordered message box that says "Could not load Pacifica data right now." with a link "Open Pacifica testnet ↗" below it. You should NOT see a blank page or an unhandled crash.

If something looks wrong: Tell me "Step 11 didn't work" and describe what the page shows — paste any red text or error messages you see on screen.

---

**Step 12 — Check subaccount tabs (if you have multiple subaccounts)**

Only do this step if the "Accounts" stat in Step 4 showed a number greater than 1.

Do this:
1. Look for a row of tab buttons just below the equity strip.
2. Click on a tab that is not the currently active one.

You should see: The tab you clicked becomes highlighted with an orange border. The "Open Positions" section below updates to show the positions for the account you switched to. If that account has no positions, you should see the "No open positions" message instead. The tab you were on before should no longer be highlighted. Each tab shows the account's equity below its name.

You should also see: When you hover over a tab, a small pencil icon (✎) appears next to the account name. Clicking it opens a prompt asking you to rename the account. Type a new name and press OK — the tab label should update to your new name.

If something looks wrong: Tell me "Step 12 didn't work" and describe what the tabs show or what happened when you clicked.

---

## When you are done testing

Tell me one of these:

- **"Everything looks good"** — and I will move on to the next task
- **"Step [N] didn't work"** — describe exactly what you saw and I will fix it
- **"I saw an error"** — copy and paste any red text or error messages shown on the page and I will diagnose it
