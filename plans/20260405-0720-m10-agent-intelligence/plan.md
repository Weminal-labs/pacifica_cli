# M10: Agent-Readable Market Intelligence

**Created:** 2026-04-05
**Branch:** feat/m10-agent-intelligence (to be created from main)
**Status:** Planning

## Goal

Close the gap between raw Pacifica chain data and actionable market understanding. Ship agent-ready recipes, stable JSON schema, and terminal-accessible intelligence filters so both humans and AI agents can move from "what is the data?" to "what should I do?" in one step.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Context Folder Updates | `[ ]` | [phase-01-context-updates.md](./phase-01-context-updates.md) |
| 2 | Core Intelligence Layer | `[ ]` | [phase-02-core-intelligence-layer.md](./phase-02-core-intelligence-layer.md) |
| 3 | New MCP Tools (5 read tools) | `[ ]` | [phase-03-mcp-tools.md](./phase-03-mcp-tools.md) |
| 4 | CLI Commands (alerts + scan flags) | `[ ]` | [phase-04-cli-commands.md](./phase-04-cli-commands.md) |
| 5 | Agent Skill + Docs | `[ ]` | [phase-05-skill-and-docs.md](./phase-05-skill-and-docs.md) |

## Deliverables Summary

- `context/features/m10-agent-intelligence.md` + 6 context file updates
- `src/core/intelligence/` — 4 new modules (filter, patterns, alerts, schema)
- `src/mcp/server.ts` — 5 new read tools (total: 28 tools)
- `src/cli/commands/alerts.ts` — new `pacifica alerts` command
- `src/cli/commands/scan.tsx` — `--gainers/--losers/--min-volume/--json` flags
- `.claude/commands/intelligence.md` — agent recipe skill

## Key Constraints

- No new npm dependencies
- Pacifica API only (no external data sources)
- All new MCP tools are read-only (no guardrails)
- Alerts polling only (no websocket streaming)
- TypeScript strict mode throughout
