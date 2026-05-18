# WebCity

A browser-based SimCity 2000-style isometric city builder.

Built with TypeScript, Vite, Preact, and HTML5 Canvas 2D.

## Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173.

**Controls:**
- Left-click: place selected zone/tool
- Middle-mouse drag / right-mouse drag: pan camera
- Scroll wheel: zoom

## Build

```bash
pnpm build      # outputs to dist/
pnpm preview    # serve dist/ locally
pnpm typecheck  # run tsc without emitting
```

## Deploy

Build and rsync to the VPS:

```bash
pnpm build
rsync -avz --delete dist/ user@vps:/var/www/webcity/
```

nginx serves `dist/` as a static SPA with an `/index.html` fallback. SSL via Certbot.
See `simcity-plan.md` for full server setup.
