import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./index.ts'],
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify: true,
  outDir: 'dist',
  shims: true,
  tsconfig: 'tsconfig.json',
});
