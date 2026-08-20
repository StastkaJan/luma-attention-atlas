# Luma — Attention Atlas

A tactile, responsive daily-planning instrument built with Vinext, React, and Cloudflare D1.

Luma supports dated plans, durable focus blocks, editing, guarded deletion,
completion tracking, and timed focus sessions.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run lint
```

The test suite covers the production worker build plus desktop and mobile Chromium flows, including persistence, keyboard interaction, reduced motion, and overflow checks.
