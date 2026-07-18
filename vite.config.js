/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // SPA entry is app.html (not index.html) so the root "/" has no default
  // index for Vercel to serve — that lets the "/" -> /home.html rewrite (the
  // redesigned static landing) resolve cleanly at the root URL.
  build: { rollupOptions: { input: 'app.html' } },
  plugins: [
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
