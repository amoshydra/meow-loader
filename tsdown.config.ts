import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./index.ts'],
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  outDir: 'dist',
  shims: true,
  tsconfig: 'tsconfig.json',
});
