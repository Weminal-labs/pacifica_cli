# UAT Checklist — Trade Simulator Improvements

Tested against: http://localhost:3000/simulate
Intelligence API: http://localhost:4242
Date: 2026-04-15

---

## Test: Trade Simulator — New Features

Your app is running at **http://localhost:3000/simulate**. Open it in your browser, then work through these steps in order.

---

**Step 1 — Empty state shows ghosted skeleton cards**

Go to: http://localhost:3000/simulate

Do this:
1. Look at the right side of the page (the wide panel to the right of the form)
2. Do not click anything yet

You should see: A dark panel with two lines of grey text ("Fill in the form and click Run Simulation" and a smaller subtitle), plus three faint ghosted card shapes below them labelled "Entry", "Liq Price", and "Margin". The cards should be very dim — almost invisible — not solid, and contain short grey placeholder bars instead of real numbers.

If something looks wrong: Tell me whether you see plain grey text with nothing below it, or whether the panel is completely empty.

---

**Step 2 — URL params pre-fill the form and auto-fetch BTC's live price**

Go to: http://localhost:3000/simulate?side=long&symbol=BTC

Do this:
1. Watch the page as it loads — within a second or two the Entry Price field should fill in on its own
2. Look at the Direction buttons at the top of the form
3. Look at the Market dropdown

You should see:
- The "Long" button is highlighted in green (not the "Short" button)
- The Market dropdown shows "BTC" selected
- The Entry Price field fills in automatically with a number (something in the range of $80,000–$110,000 for BTC)
- Below the Entry Price field, small green text appears saying "Live BTC price from Pacifica"

If the price does not auto-fill: The Entry Price field will be empty and you may see grey text saying "Price unavailable — enter manually". Tell me which you see.

---

**Step 3 — The live price button fetches a fresh price on demand**

Stay on: http://localhost:3000/simulate?side=long&symbol=BTC (or wherever you are after Step 2)

Do this:
1. Clear the Entry Price field by clicking into it and deleting the number
2. Look at the label area above the Entry Price field — you should see small orange text on the right side that says "↻ Use live price"
3. Click that "↻ Use live price" text

You should see:
- While fetching, the button text changes to "fetching…" and pulses (fades in and out)
- Within a second or two, the Entry Price field fills in again with a live BTC price
- Green text reappears below: "Live BTC price from Pacifica"

If something looks wrong: Tell me if the button text never changes, or if the field stays empty after clicking.

---

**Step 4 — Changing the market auto-fetches the new price**

Stay on the simulate page.

Do this:
1. Click the Market dropdown (currently showing BTC)
2. Select "ETH" from the list
3. Watch the Entry Price field

You should see:
- The Entry Price field clears and then refills with a new number (ETH's live price, likely in the $1,500–$4,000 range)
- The green hint text updates to "Live ETH price from Pacifica"
- The funding rate link below the 8h Funding Rate field now reads "ETH Snapshot page" (not "BTC Snapshot page")

If something looks wrong: Tell me if the Entry Price stays at BTC's price, stays blank, or if the funding link still says BTC.

---

**Step 5 — Funding rate link points to the correct market's snapshot page**

Stay on the simulate page with ETH selected.

Do this:
1. Scroll down to the "8h Funding Rate (%)" field
2. Look at the small text below it — it should say "Check funding on the ETH Snapshot page" where "ETH Snapshot page" is an orange clickable link
3. Right-click that link and choose "Copy Link Address" (or hover over it and check the URL shown at the bottom of your browser)

You should see: The link points to http://localhost:3000/snapshot/ETH — not /snapshot/BTC and not /snapshot/ETH hardcoded from a different market.

Now change the market dropdown to "SOL" and check the same link again.

You should see: The link now says "SOL Snapshot page" and points to http://localhost:3000/snapshot/SOL.

If something looks wrong: Tell me what market name appears in the link text, and what URL the link points to.

---

**Step 6 — Size preset buttons work**

Stay on the simulate page.

Do this:
1. Look below the "Size (USD)" input field — you should see four small buttons in a row: $100, $500, $1k, $5k
2. Click the "$500" button
3. Look at the Size (USD) field above the buttons

You should see:
- The Size field now shows "500"
- The "$500" button turns orange/highlighted to show it is selected
- The other three buttons remain dim

Now click "$5k".

You should see:
- The Size field now shows "5000"
- The "$5k" button is now highlighted orange
- The "$500" button goes back to dim

If something looks wrong: Tell me if the buttons are not visible, or if clicking them does not change the number in the Size field.

---

**Step 7 — Leverage preset buttons work**

Stay on the simulate page.

Do this:
1. Look below the "Leverage" input field — you should see five small buttons in a row: 2x, 5x, 10x, 20x, 50x
2. The "5x" button should already be highlighted orange (since the default leverage is 5)
3. Click the "10x" button
4. Look at the Leverage field

You should see:
- The Leverage field now shows "10"
- The "10x" button is highlighted orange
- The "5x" button goes back to dim

Now click "2x".

You should see:
- The Leverage field shows "2"
- The "2x" button is highlighted

If something looks wrong: Tell me if the leverage preset buttons are not visible, or if clicking them has no effect.

---

**Step 8 — Run a complete simulation (the golden path)**

Stay on the simulate page.

Do this:
1. Set Direction to "Long" (click the Long button if not already selected)
2. Set Market to "BTC"
3. Click "↻ Use live price" to fill in the Entry Price — wait for the green confirmation text
4. Click the "$1k" size preset button (so Size shows 1000)
5. Click the "5x" leverage preset button (so Leverage shows 5)
6. Leave the 8h Funding Rate as-is (0.01 is fine)
7. Click the orange "Run Simulation →" button

You should see: The right panel fills in with three result cards:

- A summary card showing: a green "LONG" badge, "BTC-PERP", "5x", your Entry Price, a red Liquidation Price below the entry price, Position Size of $1,000, and Margin Required of $200. There is also a thin coloured bar showing Distance to Liquidation.
- A "P&L Scenarios" card listing six rows: +5%, +10%, +20%, -5%, -10%, -20%. Positive rows show green dollar amounts; negative rows show red dollar amounts.
- A "Funding Cost (at current rate)" card showing costs at 8h, 24h, and 7d intervals in red (since Long pays funding when the rate is positive).

If something looks wrong: Tell me which card is missing, or paste any red error text you see above the Run Simulation button.

---

**Step 9 — Error state: run simulation without an entry price**

Stay on the simulate page. (You may need to reload it first to reset the form.)

Do this:
1. Make sure the Entry Price field is empty — clear it if it has a number
2. Click "Run Simulation →"

You should see: A red error message appears above the Run Simulation button that says "Enter a valid entry price." The right panel does not change.

If something looks wrong: Tell me if no error message appears, or if the simulation runs anyway and shows results with a zero price.

---

**Step 10 — Demo quick-links at the bottom**

Go to: http://localhost:3000/simulate (reload the page to get a fresh empty form)

Do this:
1. Look at the area directly below the "Run Simulation →" button
2. You should see small dim text that reads: "Try: Long BTC · Short ETH · Long SOL" where each of those is an orange clickable link

Click "Short ETH".

You should see:
- The page reloads with the form pre-filled: Direction set to "Short" (highlighted red), Market set to "ETH"
- The Entry Price field fills in automatically with ETH's live price within a second or two
- Green text below the Entry Price confirms "Live ETH price from Pacifica"
- The quick-link row at the bottom disappears (it only shows when no result is displayed)

Click "Long SOL" from the URL: http://localhost:3000/simulate?side=long&symbol=SOL

You should see:
- Direction shows "Long" (green)
- Market shows "SOL"
- Entry Price fills in with SOL's live price
- The funding link below the funding rate field says "SOL Snapshot page"

If something looks wrong: Tell me if the quick-links are not visible, or if the form does not change when you click one.

---

## When you're done testing

Tell me one of these:
- **"Everything looks good"** — and I'll move on to the next task
- **"[Step N] didn't work"** — describe what you saw and I'll fix it
- **"I saw an error"** — copy and paste any red text or error messages you see on the page
