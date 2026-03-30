# Day 1 Foundation Plan

## Overview
Scaffold project + build core SDK + config + init wizard + scan command.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Project scaffolding (T1) | `[ ]` | [phase-01](phase-01-scaffolding.md) |
| 2 | Config loader/writer (T26) | `[ ]` | [phase-02](phase-02-config.md) |
| 3 | Pacifica REST SDK client (T2) | `[ ]` | [phase-03](phase-03-rest-sdk.md) |
| 4 | Pacifica WebSocket client (T3) | `[ ]` | [phase-04](phase-04-websocket.md) |
| 5 | Init wizard (T27 + T28) | `[ ]` | [phase-05](phase-05-init-wizard.md) |
| 6 | Scan command (T4) | `[ ]` | [phase-06](phase-06-scan-command.md) |

## Approach
- Reference: dexscreener-cli-mcp-tool patterns (dual entry points, shared core, rate limiter, TTL cache)
- Since Pacifica API docs are TBD, build SDK with realistic mock data for demo
- Focus on working E2E flow: install -> init -> scan
