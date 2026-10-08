import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { testEnv } from './test/test-env';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
    env: testEnv(),
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
