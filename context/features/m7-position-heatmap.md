# Feature: Position Heatmap Visualization (M7)

> **Status:** `draft`
> **Phase:** v1 — P1
> **Last updated:** 2026-03-29

---

## Summary

ASCII-art visualization of where positions sit relative to liquidation, TP, SL, and current price. Turns numbers into instant spatial comprehension. Quick to build if position data is already working. Strong demo visual.

---

## Users

- **Minh:** "I have 4 positions open. I can see the numbers, but I can't instantly feel how close I am to getting liquidated on each one."
- **AI Agent:** Uses risk_summary to make automated decisions ("close anything where liq distance < 5%")

---

## User Stories

- As a **trader**, I want a visual heatmap of my positions so I can instantly see risk levels
- As an **AI agent**, I want structured risk data so I can make decisions about position management

---

## Behaviour

### `pacifica heatmap`
For each position, render ASCII bar showing LIQ, SL, ENTRY, NOW, TP positions:
```
ETH-PERP  LONG  0.5 ETH  5x  PnL: +$21.00 (+0.55%)
$3,420         $3,700      $3,800    $3,842       $4,000
LIQ            SL          ENTRY     ▼ NOW        TP
░░░░░░░░░░░░░░░████████████████████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░
```

Below all positions: Risk Summary
- Closest to liquidation: [market] ([%])
- Closest to stop loss: [market] ([%])
- Overall margin health: [%] used

### `pacifica heatmap --compact`
One line per position: market, side, PnL, mini ASCII bar, liq distance.

### Edge Cases & Rules
- Positions without TP/SL: show "no TP" / "no SL" instead of markers
- Short positions: reversed axis (TP below entry, liq above)
- Terminal width detection: adapt bar width to available columns
- Thresholds: <5% to liq = DANGER (red), <10% = WATCH (yellow), >10% = OK (green)

---

## Connections

- **Depends on:** M1 (position data from SDK)
- **Shares data with:** M2 (could show smart order levels on heatmap)

---

## Security Considerations

- None specific to this feature (read-only visualization)

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T29 | `[ ]` | Build HeatmapBar Ink component (single position visualization) |
| T30 | `[ ]` | Build HeatmapView with risk summary |
| T31 | `[ ]` | Implement `pacifica heatmap` and `pacifica heatmap --compact` commands |
| T32 | `[ ]` | Add MCP tools: position_heatmap, risk_summary |

---

## User Acceptance Tests

**UAT Status:** `pending`

---

## Archive
