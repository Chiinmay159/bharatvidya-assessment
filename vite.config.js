/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// DESIGN_HARNESS=1 (npm run dev:design): alias the supabase client to the
// fixture stub so /design-preview.html renders real admin views with sample
// data and no session. Never set for builds or the normal dev server.
const designHarness = globalThis.process?.env?.DESIGN_HARNESS === '1'

const stubPath = fileURLToPath(new URL('./src/dev/supabase-stub.js', import.meta.url))

export default defineConfig({
  define: { 'import.meta.env.VITE_DESIGN_HARNESS': JSON.stringify(designHarness ? '1' : '0') },
  // SPA entry is app.html (not index.html) so the root "/" has no default
  // index for Vercel to serve — that lets the "/" -> /home.html rewrite (the
  // redesigned static landing) resolve cleanly at the root URL.
  build: { rollupOptions: { input: 'app.html' } },
  plugins: [
    ...(designHarness ? [{
      // DESIGN HARNESS ONLY: swap the supabase client for the fixture stub
      // (post-resolution match — a plain alias can't catch relative imports).
      name: 'design-harness-supabase-stub',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!source.includes('lib/supabase')) return null
        const r = await this.resolve(source, importer, { skipSelf: true, ...options })
        return r?.id?.endsWith('/src/lib/supabase.ts') ? stubPath : null
      },
    }] : []),
    {
      // DEV ONLY: with the SPA entry renamed to app.html, vite's default SPA
      // fallback (-> /index.html) no longer works, so app routes 404 in dev.
      // Rewrite them to /app.html like the Vercel rewrite does in prod.
      name: 'spa-fallback-to-app-html',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (/^\/(admin|exam|verify|check)(\/|\?|$)/.test(req.url)) req.url = '/app.html'
          next()
        })
      },
    },
    react(),
    tailwindcss(),
    // App-shell precache only: a mid-exam reload on a dead network must not
    // white-screen (the answer buffer + paper cache handle the data side).
    // registerType 'prompt', and we never prompt: an update applies on the
    // next natural full load — never a forced reload mid-exam.
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Don't precache the redesigned landing — it's a large, network-served
        // static page (public/home.html), not part of the SPA app shell.
        globIgnores: ['**/home.html'],
        navigateFallback: '/app.html',
        // The SPA fallback must NOT shadow the static landing: "/" and
        // "/home.html" navigations go to the network (Vercel serves home.html);
        // everything else keeps the offline app-shell fallback.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/$/, /^\/home\.html$/],
        runtimeCaching: [], // never intercept Supabase traffic — exam data is online-only by design
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
