import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: { include: ['src/**/*.spec.ts'], environment: 'node', env: { NODE_ENV: 'test' } },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
