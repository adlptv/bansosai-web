// Astro configuration for the rebuilt bansos-web.
//
// Deployment shape mirrors the measured production runtime: Astro SSR behind a
// Node adapter, served on the local port that the reverse proxy expects. The
// adapter is pinned to `standalone` because the production service runs the
// generated server entry directly rather than mounting Astro into another
// server.
//
// NOTE ON SCOPE: this project is a controlled reimplementation. The original
// source was never recovered (only compiled `dist` exists on the host), so this
// config is derived from the observed runtime shape, not from upstream source.
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // SSR: every request hits the server, because pages render session-scoped
  // and announcement data per viewer.
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    // Bound to loopback: the reverse proxy terminates the public connection.
    host: '127.0.0.1',
    port: 4321,
  },
  // Trailing-slash behaviour must match the existing app so route parity holds;
  // the deployed app answers canonical paths without a trailing slash.
  trailingSlash: 'ignore',
  build: {
    // Inline small assets so the standalone server does not depend on an
    // external asset path being correct at runtime.
    inlineStylesheets: 'auto',
  },
  devToolbar: {
    enabled: false,
  },
});
