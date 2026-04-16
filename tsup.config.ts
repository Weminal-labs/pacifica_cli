import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli/index.ts',
    mcp: 'src/mcp/server.ts',
    'mcp-http': 'src/mcp/server-http.ts',
  },
  format: ['esm'],
  target: 'node18',
  dts: false,
  clean: true,
  splitting: true,
  sourcemap: true,
})
