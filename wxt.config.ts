import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Low-Effort Post Alarm',
    description:
      'Analyze Reddit post pages for low-effort, spammy, or rage-bait signals.',
    permissions: ['storage'],
  },
  webExt: {
    binaries: {
      firefox: 'C:\\Program Files\\Zen Browser\\zen.exe',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': resolve('.'),
      },
    },
  }),
});
