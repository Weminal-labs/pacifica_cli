## Test: M12 Simulate + Backtest Redesign

Your app is running at **http://localhost:3000**. Open it in your browser, then work through these steps in order.

---

**Step 1 — Confirm the basic Simulate page loads**

Go to: http://localhost:3000/simulate

Do this:
1. Look at the page without clicking anything yet.

You should see: A two-panel layout. On the left, a form with fields for Symbol, Side (Long / Short), Leverage, Size, and Entry Price. On the right, a tall column of dark cards stacked vertically — you should be able to see at least a price chart area and a Volatility Scenarios section. The page should not be blank or show a "404" message.

If something looks wrong: Tell me "Step 1 didn't work" and describe what you see — for example a blank page, a spinner that never stops, or an error message.

---

**Step 2 — Select a symbol and watch live data auto-fill**

Stay on: http://localhost:3000/simulate

Do this:
1. Find the Symbol field on the left form — it may already show "ETH" or a similar asset.
2. Click the Symbol dropdown and select **ETH** (or change it to ETH if it is already selected, then switch it back).
3. Wait up to 5 seconds.

You should see: The Entry Price field fills in automatically with a real number (for example, something like 3,241.50). The Funding Rate field nearby also fills in automatically with a small percentage (something like +0.0125% or −0.0050%). You should NOT need to type these values yourself. A small label or badge near the funding rate may show "8h cost" and a dollar amount.

If something looks wrong: Tell me "Step 2 didn't work" and describe whether the fields stayed empty, showed "0", or showed an error message instead of real numbers.

---

**Step 3 — Check the 7-day candlestick price chart**

Stay on: http://localhost:3000/simulate (after completing Step 2)

Do this:
1. Look at the right panel — scroll down slightly if needed.
2. Find the price chart — it is a dark rectangular area showing vertical bars in green and red.

You should see: A hand-drawn candlestick chart covering roughly 7 days of price data (168 candles). The chart should have:
- An orange horizontal line marking the entry price you saw auto-filled
- A red dashed horizontal line below the entry price marking the liquidation price
- A faint orange-shaded band that stretches across the chart (the ±1 standard deviation band)

The chart does not use any interactive controls — it is a static display. You do not need to click anything.

If something looks wrong: Tell me "Step 3 didn't work" and describe what the chart area looks like — for example if it shows a blank grey box, no lines, or only shows one candle.

---

**Step 4 — Hover over the chart to see candle details**

Stay on: http://localhost:3000/simulate

Do this:
1. Move your mouse cursor slowly over the candlestick chart.
2. Hover over one of the individual candle bars.

You should see: A small tooltip or info box appears near your cursor showing four numbers labelled O, H, L, C — these stand for Open, High, Low, Close prices for that specific candle. The numbers should change as you move your cursor to different candles along the chart.

If something looks wrong: Tell me "Step 4 didn't work" and describe whether no tooltip appeared, or if the same numbers showed regardless of where you moved the cursor.

---

**Step 5 — Check the Volatility Scenarios panel**

Stay on: http://localhost:3000/simulate

Do this:
1. Look in the right panel for a section labelled "Volatility Scenarios" (you may need to scroll down past the chart).
2. Look at the rows of scenarios listed there.

You should see: Three scenario rows labelled something like **+1σ / −1σ**, **+2σ / −2σ**, and **+3σ / −3σ**. Near the top of that section there should be a small badge showing the daily volatility measurement — something like "σ = 2.4%/day". Each scenario row should show a price target and a P&L amount (in dollars or percentage). The numbers should be different from the next row — 2σ should show a bigger move than 1σ.

If no candle data loaded, you should instead see three rows labelled ±5%, ±10%, ±20% — this is the fallback and is acceptable.

If something looks wrong: Tell me "Step 5 didn't work" and describe what the panel shows — for example no rows at all, or all rows showing the same numbers.

---

**Step 6 — Check the P&L Summary and Funding cards**

Stay on: http://localhost:3000/simulate

Do this:
1. Scroll to the bottom of the right panel.
2. Look for the summary cards.

You should see: A card labelled "P&L Summary" showing an estimated profit or loss amount for your position, and a liquidation price. Below or beside it, a card labelled with something like "Funding" or "8h Cost" showing a dollar amount for the funding fee you would pay or receive over 8 hours. Both numbers should update if you change the Size field in the left form.

If something looks wrong: Tell me "Step 6 didn't work" and describe which card is missing or what the numbers show (for example "NaN", "$0.00" for everything, or no cards at all).

---

**Step 7 — Test changing form values**

Stay on: http://localhost:3000/simulate

Do this:
1. Find the **Size** field in the left form.
2. Clear it and type **500**.
3. Find the **Leverage** field and change it to **5**.
4. Look at the P&L Summary card in the right panel.

You should see: The P&L Summary card updates to reflect your new position size and leverage. The liquidation price shown on the chart's red dashed line should also shift to a new position. The Funding card should show a different 8h cost amount compared to what it showed before you changed the values.

If something looks wrong: Tell me "Step 7 didn't work" and describe whether the right panel cards did not change after you updated the form fields.

---

**Step 8 — Navigate to the Patterns page and find Simulate links**

Go to: http://localhost:3000/patterns

Do this:
1. Look at the list of pattern cards on the page.
2. Find a link on any pattern card that says "Simulate →" or similar.
3. Click that "Simulate →" link on any pattern card.

You should see: After clicking, your browser goes to the Simulate page. Look at the URL in the address bar — it should contain `?patternId=` followed by a pattern ID code (for example `?side=long&symbol=ETH&patternId=seed_pat_001`). The Simulate page should load with a new panel visible at the top-right showing backtest information for that pattern.

If something looks wrong: Tell me "Step 8 didn't work" and describe whether the "Simulate →" link was not visible on any pattern card, or whether clicking it took you somewhere unexpected.

---

**Step 9 — Check the Pattern Backtest panel**

Stay on the Simulate page after completing Step 8 (your URL should contain `?patternId=`)

Do this:
1. Look at the top of the right panel for a section that did not appear in earlier steps.
2. Look for a row of small coloured squares and a set of stats below them.

You should see: A "Pattern Backtest" banner containing:
- An **Outcome Strip**: a row of 100 small squares, some coloured green (wins) and some red (losses). The proportion of green vs red should roughly match a win rate percentage shown nearby.
- **Stats** beneath the strip: four figures labelled Win Rate (a percentage), Avg P&L (a dollar or percentage amount), Hold Time (a duration like "4.2h"), and Trades (a number like "48").
- A **Distribution Curve**: a small SVG bell curve shape, labelled "modelled", showing the spread of historical outcomes.
- A **Target Price** hint or reference price somewhere in the panel.

If something looks wrong: Tell me "Step 9 didn't work" and describe what appeared where the backtest panel should be — for example if only an empty box appeared, or if the stats all showed as "—".

---

**Step 10 — Open the pattern Simulate URL directly**

Go to: http://localhost:3000/simulate?side=long&symbol=ETH&patternId=seed_pat_001

Do this:
1. Paste that full URL into your browser address bar and press Enter.
2. Wait for the page to load fully (up to 5 seconds).
3. Check both the symbol on the form and the backtest panel.

You should see: The form should pre-fill with ETH as the symbol and Long as the side. The right panel should show the Pattern Backtest panel as described in Step 9. On the chart, in addition to the orange entry line and red dashed liquidation line, there should also be a **green dotted line** marking the pattern's target price.

If something looks wrong: Tell me "Step 10 didn't work" and describe what loaded — for example if the page was blank, the form did not pre-fill, the backtest panel did not appear, or no green dotted line appeared on the chart.

---

**Step 11 — Test with a missing or fake pattern ID (error state)**

Try this on purpose:
1. Go to: http://localhost:3000/simulate?patternId=FAKE_PATTERN_DOES_NOT_EXIST
2. Wait for the page to load fully.

You should see: The Simulate page loads normally — the chart, volatility scenarios, and P&L cards should all appear as usual. The Pattern Backtest panel area should either be hidden entirely, or show a message like "Pattern not found" or "No backtest data available". You should NOT see the whole page crash, go blank, or show an unhandled error in a red banner across the page.

If something looks wrong: Tell me "Step 11 didn't work" and paste any red error text you see on the page.

---

**Step 12 — Test with no symbol selected (edge case)**

Try this on purpose:
1. Go to: http://localhost:3000/simulate
2. If the Symbol field has a dropdown, try to clear it or select a blank option (if one exists).
3. If you cannot clear the symbol, instead disconnect from the internet briefly and reload the page, then reconnect.

You should see: One of the following:
- The Entry Price and Funding Rate fields show "—" or "0.00" or a placeholder, but the rest of the form stays usable.
- The chart shows a message like "No data" or a flat empty chart area.
- A small notice appears near the Entry Price field saying something like "Could not load live price" or "Using fallback data".

You should NOT see the page crash entirely or show a raw code error.

If something looks wrong: Tell me "Step 12 didn't work" and describe what you see when live price data cannot be loaded.

---

## When you are done testing

Tell me one of these:

- **"Everything looks good"** — and I will move on to the next task
- **"Step [N] didn't work"** — describe exactly what you saw and I will fix it
- **"I saw an error"** — copy and paste any red text or error messages shown on the page and I will diagnose it
