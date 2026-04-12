# Architecture Decision Log

> Log significant decisions here as they are made.
> Never delete entries — add a "superseded by" note instead.

---

### D1: Terminal-first, no web UI

**Decision:** Build a CLI/TUI tool, not a web dashboard.
**Date:** 2026-03-29 (setup)
**Context:** Hackathon project for Pacifica DEX needs a differentiated approach. Most hackathon entries are web dashboards.
**Options Considered:** Web app, mobile app, CLI tool, browser extension
**Rationale:** Terminal is where power traders already live. CLI is pipe-friendly, scriptable, and doesn't compete with Pacifica's own web UI. Also embodies CROPS values — no hosted frontend to geo-block, no server logging trades.
**Consequences:** No visual charts (ASCII only). Users must be terminal-comfortable. Can't demo by just opening a URL.

---

### D2: Local-only, no server

**Decision:** Everything runs on the trader's machine. No hosted backend.
**Date:** 2026-03-29 (setup)
**Context:** Need to decide where trading logic and data lives.
**Options Considered:** Hosted server with API, serverless functions, local-only
**Rationale:** Privacy (no trading pattern leakage), security (no third-party holding keys), censorship resistance (can't geo-block a local binary). Also zero hosting cost — fits hackathon budget.
**Consequences:** Smart orders stop when CLI closes. No cross-device sync. All data is local files.

---

### D3: File-based storage, no database

**Decision:** Use `.pacifica.yaml` for config and `.pacifica/*.json` for runtime data.
**Date:** 2026-03-29 (setup)
**Context:** Need persistence for config, trade journal, agent logs, smart order state.
**Options Considered:** SQLite, LevelDB, JSON files, YAML files
**Rationale:** Simplest approach for a 3-day hackathon. Human-readable. Inspectable. No dependencies. Traders can `cat` their own trade log.
**Consequences:** No concurrent access safety. No indexing for large datasets. Acceptable for single-user local tool.

---

### D4: Ink (React for CLI) as TUI framework

**Decision:** Use Ink for terminal rendering instead of blessed, raw ANSI, or inquirer-based output.
**Date:** 2026-03-29 (setup)
**Context:** Need rich, auto-updating terminal UI for live market data.
**Options Considered:** Ink, blessed/neo-blessed, raw chalk+readline, plain console.log
**Rationale:** Component model enables live updates via React state. Good ecosystem (ink-table, ink-spinner). TypeScript support. Handles terminal resizing. Familiar React mental model.
**Consequences:** Heavier dependency tree than raw ANSI. Must ensure pipe-friendliness — core commands should also work without Ink when piped.

---

### D5: MCP as the agent interface

**Decision:** Build an MCP server rather than a custom API or LangChain integration.
**Date:** 2026-03-29 (setup)
**Context:** Need a way for AI agents to interact with Pacifica.
**Options Considered:** Custom REST API, LangChain tools, MCP server, OpenAI function calling
**Rationale:** MCP is the standard protocol. Works with Claude Code natively. Any MCP-compatible agent can use the tools. No vendor lock-in. This is the project's core differentiator.
**Consequences:** Tied to MCP protocol evolution. Need `@modelcontextprotocol/sdk` dependency.

---

### D6: Commander over yargs for CLI parsing

**Decision:** Use commander for argument parsing.
**Date:** 2026-03-29 (setup)
**Context:** Need CLI argument parser for `pacifica <command> [options]`.
**Options Considered:** commander, yargs, clipanion, oclif
**Rationale:** Lighter than yargs, simpler API, good TypeScript support, widely adopted. Subcommand model maps well to `pacifica trade buy/sell`, `pacifica smart trailing`, etc.
**Consequences:** Less auto-generated help than yargs. Manual help text needed for complex subcommands.

---

### D7: Agent guardrails are a P0 feature

**Decision:** Ship guardrails alongside the MCP server, not as an afterthought.
**Date:** 2026-03-29 (setup)
**Context:** Judges will ask "isn't letting AI trade dangerous?" This needs an answer in the demo.
**Options Considered:** Ship MCP tools without guardrails, add guardrails as P1
**Rationale:** Trust is the product story. Kill switch, spending limits, and audit trail are what make agent trading viable, not reckless. Also a strong demo moment.
**Consequences:** More work on Day 2. But without guardrails, the MCP server is a liability, not a feature.

---

### D8: Ed25519 wallet signing instead of API key HMAC

**Decision:** Use Solana Ed25519 wallet signatures for authentication, not traditional API key HMAC.
**Date:** 2026-03-29 (Day 1 build)
**Context:** Pacifica uses Solana-style wallet authentication. Need to decide how to handle auth in the CLI.
**Options Considered:** HMAC API key/secret, Ed25519 wallet signing
**Rationale:** Pacifica's API requires Ed25519 signatures, not HMAC. Config stores a Base58-encoded private key. Using `tweetnacl` for signing and `bs58` for Base58 encoding/decoding. This eliminates API key management entirely — the user just needs their wallet keypair.
**Consequences:** No API key rotation or management. Private key must be kept secure in `.pacifica.yaml`. Signing process involves recursive key sorting, compact JSON serialization, and Base58-encoded signatures.

---

### D9: Stable JSON schema for agent-readable output

**Decision:** All intelligence MCP tools return data conforming to versioned TypeScript interfaces
defined in `src/core/intelligence/schema.ts`. Raw API passthrough is prohibited.

**Date:** 2026-04-05
**Context:** Agents consuming MCP tools need consistent, predictable data shapes.
Raw API fields change format (strings vs numbers, field renames). Schema version field
allows future breaking changes to be detected.

**Rationale:** AI agents cannot tolerate schema drift. A stable contract = agents can
be written once and work across API updates. `schemaVersion: "1.0"` on snapshots lets
agents verify compatibility.

**Consequences:** All intelligence functions must parse, transform, and validate before returning.
Minor overhead vs. raw passthrough.
