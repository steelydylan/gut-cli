import { defineConfig } from 'tsup'

export default defineConfig([
  // CLI entry point
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['keytar'],
    banner: {
      js: '#!/usr/bin/env node'
    }
  },
  // Library entry point
  {
    entry: ['src/lib/index.ts'],
    outDir: 'dist/lib',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    external: ['keytar']
  }
])
