# UAT Checklist: Premium Leaderboard Page

Your app is running at **http://localhost:3000**. Open it in your browser, then work through these steps one by one. For each step, check what you see against the "Pass" description. If anything looks different, note the step number and describe what you actually saw.

---

## Intelligence Panel (top of leaderboard page)

---

**Step 1 — Open the leaderboard page**

Go to: http://localhost:3000/leaderboard

You should see: A full leaderboard page loads — not a blank screen, not an error message. There should be a table of trader rows below a panel at the top of the page.

Pass: The page loads with visible content — a panel section at the top and a table with trader rows below it.
Fail: A white screen, a "404" message, or the text "Something went wrong" appears.

---

**Step 2 — Consensus Positions section**

Look at the top panel on the leaderboard page. Find the section labelled "Consensus Positions" (or similar wording).

You should see: A list of assets (for example BTC, ETH, or SOL) where at least 2 of the top 8 traders hold positions. Each asset should show:
- Whether traders are mostly long or short on it
- A number indicating how many traders are long vs short (for example "3 long / 1 short")
- A dollar figure representing the combined size of those positions

Pass: At least one asset row appears with a long count, a short count, and a dollar value next to it.
Fail: The section is empty, shows "—", shows "0 traders", or does not appear on the page at all.

---

**Step 3 — Market Regime indicator**

Still in the top panel, find the section labelled "Market Regime" (or similar wording).

You should see: A single label indicating the overall direction the top traders are leaning — it should say one of: "Long", "Short", or "Neutral". It may be colour-coded (green for long, red for short, grey for neutral).

Pass: One of the three labels appears — "Long", "Short", or "Neutral" — with no error text beside it.
Fail: The indicator is missing, shows "undefined", shows "N/A", or is completely blank.

---

**Step 4 — Breakout Watch section**

Still in the top panel, find the section labelled "Breakout Watch" (or similar wording).

You should see: A short list of trader wallet addresses (shortened, for example "0x1a2b...3c4d") that are having a better day today than their recent weekly average. Each entry should suggest the trader's 1-day performance is outpacing their 7-day trend.

Pass: At least one trader address appears in this section.
Fail: The section is empty, shows "No breakouts", or does not appear on the page. (If none of the top traders are accelerating today, this section may legitimately be empty — note it as "possibly empty, not a bug" and move on.)

---

## Per-Trader Row Features

---

**Step 5 — Consistency streak dots**

Look at the trader table. Pick any trader row and look for a set of 4 small dots or circles near their name or rank.

You should see: 4 dots in a row. Each dot represents a time period (1D, 7D, 30D, All-time). Dots should be green when the trader made money in that period, and a different colour (grey or red) when they did not.

Pass: At least one row shows 4 dots with at least one green dot visible.
Fail: No dots appear on any row, or all dots are the same colour on every row (which would suggest data is not loading).

---

**Step 6 — Momentum badge**

Look along a trader row. Find a small badge or tag — it might say "Accelerating", "Hot", or show an upward arrow symbol.

You should see: Some rows have a badge and some do not. The badge should only appear on traders whose 1-day performance is better than their 7-day daily average.

Pass: At least one row shows a momentum badge, and at least one row has no badge.
Fail: Every single row has the badge (meaning it is showing for all traders regardless of performance), or no rows have any badge at all and the table is fully populated.

---

**Step 7 — Leverage gauge**

Look at the columns in the trader table. Find the column that shows leverage — it may be labelled "Lev", "Leverage", or show a ratio like "5.2x".

You should see: A number followed by "x" (for example "3.1x" or "8.7x") on each trader row, representing how much leverage that trader is currently using relative to their account size.

Pass: Each row shows a leverage figure. Numbers vary across rows (not all the same value).
Fail: The column is missing, shows "—" on every row, or shows "0x" on every row.

---

**Step 8 — Position pills (live open positions)**

Look at each trader row for small coloured tags/pills showing asset names — for example "BTC", "ETH", "SOL".

You should see: Between 1 and 4 asset pills per row for active traders. If a trader has more than 4 open positions, the 4th pill (or after) should show "+N more" (for example "+2 more").

Pass: At least some rows show position pills. At least one row (if a trader has many positions) shows the "+N more" overflow indicator.
Fail: No pills appear on any row, or every row shows only a dash "—" with no asset names.

---

**Step 9 — Long/short bias bar**

Look at the rightmost area of a trader row (or near the position pills). Find a small horizontal bar — one side should be green/blue (long) and the other red (short).

You should see: A filled bar that leans left or right depending on whether the trader is predominantly long or short. A trader with all long positions should show a fully green/blue bar. A mixed trader should show both sides.

Pass: At least one row shows a bias bar with visible colour fill on one side.
Fail: The bar is missing, completely empty, or shows the same 50/50 split on every single row.

---

## Interactive Features

---

**Step 10 — Sort by column headers**

Look at the top of the trader table. Find the column header buttons: "1D", "7D", "30D", "All-Time", and "Equity".

Do this:
1. Click the "7D" column header.
2. Watch the table re-order.
3. Click "1D".
4. Watch the table re-order again.
5. Click "Equity".
6. Watch the table re-order again.

You should see: Each time you click a header, the rows rearrange so the trader with the best value in that column appears at the top. The clicked column header should look visually active (bold, underlined, highlighted, or an arrow appears next to it).

Pass: The table order visibly changes with each click, and the active column is highlighted.
Fail: Clicking a header does nothing, the table order stays the same every time, or the page reloads entirely.

---

**Step 11 — Filter pills**

Look above or below the column headers for a row of filter buttons: "Rising", "Consistent (3+)", "High-Leverage", and a star/watchlist filter.

Do this:
1. Click "Rising".
2. Look at the table.
3. Click "Consistent (3+)".
4. Look at the table.
5. Click "High-Leverage".
6. Look at the table.
7. Click the same filter again to turn it off.

You should see: When you click a filter, the table shrinks to show only traders matching that filter. The filter button should look highlighted/selected while active. Clicking it again should remove the filter and restore all traders.

Pass: The number of rows in the table changes when you click each filter. Clicking again restores the full list.
Fail: Clicking the filters does nothing to the table, or the table becomes completely empty after clicking any filter (which could mean the filter logic is too strict or broken).

---

**Step 12 — Star / watchlist a trader**

Look at the far left of any trader row. Find a small star icon (outline, not filled).

Do this:
1. Click the star icon on any trader row.
2. The star should fill in (turn gold/yellow).
3. Refresh the page (press F5 or Cmd+R).
4. After the page reloads, look at that same trader's row.

You should see: After clicking, the star turns solid/filled. After refreshing the page, the star is still filled on that same trader — it remembered your choice.

Pass: The star fills immediately on click, and is still filled after a page refresh.
Fail: The star does not change when clicked, or it resets to empty after page refresh (meaning it did not save).

---

**Step 12b — Watchlist filter**

After starring at least one trader in Step 12, click the star/watchlist filter pill (labelled something like "Watchlisted" or showing a star icon).

You should see: The table filters down to show only the trader(s) you starred. All un-starred traders disappear from the view.

Pass: Only your starred trader(s) appear when the watchlist filter is active.
Fail: The filter shows all traders, shows no traders, or the filter pill does not exist.

---

**Step 13 — Expand a trader row**

Click anywhere on a trader row (not on the star icon or a position pill — click on the trader's address or rank number).

You should see: The row expands downward to reveal additional detail about that trader's open positions. Each position should show:
- The asset name (e.g. "BTC-PERP")
- The entry price
- The liquidation price
- The funding rate

Pass: A detail panel slides open beneath the row showing position-level data with entry price, liquidation price, and funding visible.
Fail: Nothing happens when you click the row, or the row expands but shows only dashes or blank fields.

---

## Links and Navigation

---

**Step 14 — Trader address links to their profile**

In the trader table, find the shortened wallet address (for example "0x1a2b...3c4d") displayed for any trader. Click it.

You should see: The browser navigates to a page at an address like http://localhost:3000/trader/0x1a2b...3c4d — a trader profile page with their trade history and PnL chart.

Pass: You land on a trader detail page. The URL in your browser's address bar contains "/trader/" followed by the wallet address.
Fail: Nothing happens, you get a 404 page, or you are taken back to the home page.

---

**Step 15 — CLI copy on address click**

Find the trader address again. Look for a small clipboard or copy icon near the address, or try right-clicking or hovering to see if a "Copy" action appears. Try clicking the copy icon or the copy interaction.

You should see: A brief confirmation appears — it might be a small tooltip saying "Copied!", a toast notification, or the icon briefly changes. If you paste into a text document, the text should read: `pacifica copy watch 0x...` (with the full wallet address).

Pass: A "Copied" confirmation appears. Pasting elsewhere shows the `pacifica copy watch` command with the address.
Fail: Nothing happens on click, no confirmation appears, or pasting shows only the raw address without the command prefix.

---

**Step 16 — "Copy Trader" CTA button**

Scroll to the bottom of the leaderboard page. Find a button or link labelled "Copy Trader" with an arrow (→).

Do this:
1. Click "Copy Trader →".

You should see: The browser navigates to http://localhost:3000/copy — the copy trading page.

Pass: You land on the /copy page. The URL shows "/copy".
Fail: The button is missing, clicking it does nothing, or you get a 404 page.

---

**Step 17 — "Intelligence Ledger" button**

Look on the leaderboard page (near the top panel or in the navigation area) for a button labelled "Intelligence Ledger".

Do this:
1. Click "Intelligence Ledger".

You should see: The browser navigates to http://localhost:3000/reputation — the reputation/ledger page.

Pass: You land on the /reputation page. The URL shows "/reputation".
Fail: The button is missing, clicking it does nothing, or you get a 404 page.

---

## Spot Checks — Other Pages

---

**Step 18 — Home feed page: "Top traders positioned" section**

Go to: http://localhost:3000

Scroll down and find a section labelled "Top traders positioned" or similar.

You should see: A list of assets or positions showing what the top traders currently hold. This section should have actual data — trader names or addresses, asset names, and position sizes.

Pass: The section shows at least one row of real data (an asset name and a trader reference).
Fail: The section is empty, shows "No data", shows "0 traders", or is completely missing from the page. (This was previously broken due to a bug — if it is still empty, that is a failure worth reporting.)

---

**Step 19 — Copy page is styled**

Go to: http://localhost:3000/copy

You should see: A properly styled page — it should have the same look and feel as the rest of the app (consistent colours, fonts, layout, and navigation). It should not look like a plain unstyled HTML page with black text on white background and default browser fonts.

Pass: The page matches the visual style of the leaderboard and home page.
Fail: The page looks completely unstyled — plain text, no colour, default browser font, no navigation header. (This was previously broken — if it still looks unstyled, that is a failure worth reporting.)

---

## When you're done testing

Tell me one of these:

- **"Everything looks good"** — and I'll mark this feature complete and move on
- **"Step [N] didn't work"** — describe exactly what you saw and I'll fix it
- **"I saw an error"** — copy and paste any red text or error messages you see on screen

You do not need to test every step in one go — if something fails early, report it straight away.
