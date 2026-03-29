# Code Conventions

> Claude follows these on every task without being reminded.

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `smart-orders.ts`, `trailing-stop.ts` |
| Directories | kebab-case | `smart-orders/`, `cli/commands/` |
| Functions | camelCase | `placeOrder()`, `getFundingRates()` |
| Types/Interfaces | PascalCase | `Market`, `OrderRequest`, `SmartOrder` |
| Constants | UPPER_SNAKE | `MAX_RETRY_ATTEMPTS`, `DEFAULT_LEVERAGE` |
| CLI commands | kebab-case | `funding-arb`, `smart-order` |
| MCP tools | snake_case | `pacifica_place_order`, `pacifica_get_markets` |
| Config keys | snake_case | `api_key`, `daily_spending_limit` |

## File & Folder Structure

```
src/
├── cli/           # CLI entry point, commands, Ink components
├── core/          # Shared business logic (SDK, config, guardrails, journal)
├── mcp/           # MCP server and tool definitions
└── skills/        # Claude Code skill files
```

- One file per command in `cli/commands/`
- One file per tool group in `mcp/tools/`
- Shared types co-located with the module that owns them
- No `utils/` or `helpers/` dumping grounds — put code where it belongs

## Patterns

### Imports
- Use `import type` for type-only imports
- Group imports: node builtins, external packages, internal modules
- No barrel files (index.ts re-exports) — import directly from the file

### Error Handling
- SDK client methods throw typed errors with clear messages
- CLI commands catch errors and print user-friendly messages (never raw stack traces)
- MCP tools return structured error objects, never throw

### Async
- Use async/await everywhere, no callbacks
- WebSocket reconnection uses exponential backoff
- File operations use `fs/promises`

### Config Access
- Load config once at startup via `loadConfig()`
- Pass config as parameter, don't use global singletons
- Validate config against schema on load

## Comments

- Don't add comments that restate the code
- Do add comments for non-obvious business logic (trading math, funding rate calculations)
- Do add comments for "why" decisions: `// REST fallback: WebSocket may have stale price during reconnection`

## Formatting

- Use TypeScript strict mode
- No `any` types — use `unknown` and narrow
- Prefer `interface` over `type` for object shapes
- Use `const` by default, `let` only when reassignment is needed
- No semicolons (or with — be consistent, pick one in tsconfig/eslint)
- 2-space indentation
