import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Undercurrent" };

const POINTS = [
  "Undercurrent notices that you typed, never what you typed.",
  "What it learns (your pause lengths and flow times) stays on your computer.",
  "All music is made on your computer. Nothing is streamed or sent anywhere.",
  "The Chrome extension runs on every page only to notice typing. On sites you choose to hold back, it shows the pause screen while you're in flow.",
  "This website keeps no analytics. It's hosted on Vercel, which keeps standard server logs.",
];

export default function Privacy() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-20">
      <Link href="/" className="font-mono text-xs uppercase tracking-[0.25em] text-sea">Undercurrent</Link>
      <h1 className="font-display text-4xl font-bold tracking-tight text-fog">Privacy</h1>
      <ul className="flex flex-col gap-4 text-mist">
        {POINTS.map((p) => (
          <li key={p} className="glass rounded-2xl px-5 py-4">{p}</li>
        ))}
      </ul>
    </main>
  );
}
