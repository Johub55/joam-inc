import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({command}) => {
  const isBuild = command === 'build';
  const buildTime = isBuild ? Date.now() : 0;
  const buildVersion = isBuild
    ? `1.0.${buildTime}-${Math.random().toString(36).slice(2, 7)}`
    : 'dev';

  return {
    base: './',
    define: {
      __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
      __APP_BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'werkpay-version-manifest',
        closeBundle() {
          if (!isBuild) return;
          const distDir = path.resolve(__dirname, 'dist');
          fs.mkdirSync(distDir, {recursive: true});
          fs.writeFileSync(
            path.join(distDir, 'version.json'),
            JSON.stringify({version: buildVersion, buildTime}),
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
