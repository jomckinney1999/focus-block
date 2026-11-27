# Undercurrent website (Next.js)

The landing page for Undercurrent, built with Next.js (App Router), TypeScript, Tailwind CSS and the shadcn folder layout.

```
app/            page.tsx (home), privacy/, layout + global styles
components/ui/  shadcn-style UI components: scroll-expansion-hero, spotlight-card
components/     live-demo.tsx: the interactive typing demo
lib/engine/     the shared flow model + synth, synced from ../engine (don't edit here)
public/         media (hero video, poster, background), download/ (extension builds)
```

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

After changing `flow/engine/` or rebuilding an extension download, run `npm run sync` from `flow/` to refresh the copies here.

## Deploy (Vercel)

Set the project's **Root Directory** to `flow/site`. `vercel.json` selects the Next.js framework.

## Why `components/ui`

shadcn components live in `components/ui` (configured in `components.json`), so `npx shadcn add …` drops new components next to these, and imports stay `@/components/ui/...` everywhere.
