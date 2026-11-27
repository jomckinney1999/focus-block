import Link from "next/link";
import { Keyboard, Brain, Moon, RotateCcw, Mic, Gauge, Waves, Code2, Globe, Download, ArrowRight } from "lucide-react";
import ScrollExpandMedia from "@/components/ui/scroll-expansion-hero";
import { GlowCard } from "@/components/ui/spotlight-card";
import { LiveDemo } from "@/components/live-demo";

const STEPS = [
  { icon: Keyboard, title: "Type", text: "The music rises.", color: "gold" as const },
  { icon: Brain, title: "Pause", text: "It softens while you think.", color: "sea" as const },
  { icon: Moon, title: "Leave", text: "It fades out.", color: "sea" as const },
  { icon: RotateCcw, title: "Return", text: "It picks up where it left off.", color: "gold" as const },
];

const WHY = [
  { icon: Mic, title: "No lyrics", text: "Words compete with code for your attention." },
  { icon: Gauge, title: "Slow and soft", text: "Calm music is easier to read and think with." },
  { icon: Waves, title: "No sudden changes", text: "Every fade is slow, so nothing pulls you out." },
];

function Section({ id, label, title, children }: { id?: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto flex w-full max-w-5xl scroll-mt-8 flex-col gap-10 py-20 sm:py-24">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-sea">{label}</span>
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-fog sm:text-4xl">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <main className="relative isolate">
      {/* One underwater world for the whole page: the hero's scene, dimmed, stays behind everything,
          getting darker the further you scroll, so the page reads as one dive rather than separate blocks. */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-ink">
        <div className="absolute inset-0 bg-[url('/media/underwater-bg.jpg')] bg-cover bg-top opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_0%,rgba(120,203,187,0.10),transparent_70%),linear-gradient(180deg,rgba(7,16,18,0.35)_0%,rgba(7,16,18,0.82)_60%,rgba(7,16,18,0.95)_100%)]" />
      </div>
      <ScrollExpandMedia
        mediaType="video"
        mediaSrc="/media/underwater-surface.mp4"
        posterSrc="/media/underwater-surface-poster.jpg"
        bgImageSrc="/media/underwater-bg.jpg"
        title="Flow has a sound"
        date="Undercurrent"
        scrollToExpand="Scroll to dive in"
      >
        <div className="flex flex-col items-center">
          {/* Intro */}
          <section className="flex max-w-2xl flex-col items-center gap-6 pb-4 pt-16 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sea">Focus music for code</p>
            <p className="text-balance font-display text-4xl font-bold leading-tight tracking-tight text-fog sm:text-5xl">
              Music that follows your keyboard.
            </p>
            <p className="text-lg text-mist">You never press play. You just start working.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href="#get" className="flex items-center gap-2 rounded-full bg-sea px-6 py-3 font-medium text-ink transition hover:brightness-110">
                Get it free <ArrowRight className="size-4" />
              </a>
              <a href="#try" className="glass rounded-full px-6 py-3 font-medium text-fog">Try it</a>
            </div>
          </section>

          {/* Live demo */}
          <Section id="try" label="Try it" title="Type below and listen">
            <LiveDemo />
          </Section>

          {/* How it works */}
          <Section label="How it works" title="It follows your hands">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, text, color }) => (
                <GlowCard key={title} glowColor={color} customSize className="min-h-44 w-full">
                  <div className="flex flex-col justify-between gap-6">
                    <Icon className={color === "gold" ? "size-7 text-warm" : "size-7 text-sea"} aria-hidden />
                    <div>
                      <h3 className="font-display text-xl font-semibold text-fog">{title}</h3>
                      <p className="mt-1 text-sm text-mist">{text}</p>
                    </div>
                  </div>
                </GlowCard>
              ))}
            </div>
          </Section>

          {/* Why it works */}
          <Section label="Why it works" title="Built on research">
            <div className="grid gap-4 sm:grid-cols-3">
              {WHY.map(({ icon: Icon, title, text }) => (
                <GlowCard key={title} glowColor="sea" customSize className="w-full">
                  <div className="flex flex-col gap-4">
                    <Icon className="size-6 text-sea" aria-hidden />
                    <div>
                      <h3 className="font-display text-lg font-semibold text-fog">{title}</h3>
                      <p className="mt-1 text-sm text-mist">{text}</p>
                    </div>
                  </div>
                </GlowCard>
              ))}
            </div>
            <a
              href="https://github.com/jomckinney1999/focus-block/blob/master/flow/RESEARCH.md"
              className="mx-auto text-sm text-sea underline-offset-4 hover:underline"
            >
              Read the research
            </a>
          </Section>

          {/* Get it */}
          <Section id="get" label="Get it" title="Free for VS Code and Chrome">
            <div className="grid gap-4 md:grid-cols-2">
              <GlowCard glowColor="sea" customSize className="w-full">
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <Code2 className="size-7 text-sea" aria-hidden />
                    <h3 className="font-display text-2xl font-semibold text-fog">VS Code</h3>
                  </div>
                  <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-mist marker:text-sea">
                    <li>Download the file.</li>
                    <li>In VS Code, run <span className="text-fog">Install from VSIX</span>.</li>
                    <li>Open the player and start typing.</li>
                  </ol>
                </div>
                <a href="/download/undercurrent.vsix" download className="flex items-center justify-center gap-2 rounded-xl bg-sea px-5 py-3 font-medium text-ink transition hover:brightness-110">
                  <Download className="size-4" /> Download for VS Code
                </a>
              </GlowCard>

              <GlowCard glowColor="gold" customSize className="w-full">
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <Globe className="size-7 text-warm" aria-hidden />
                    <h3 className="font-display text-2xl font-semibold text-fog">Chrome <span className="text-base font-normal text-mist">beta</span></h3>
                  </div>
                  <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-mist marker:text-warm">
                    <li>Download and unzip.</li>
                    <li>In <span className="text-fog">chrome://extensions</span>, turn on Developer mode, then Load unpacked.</li>
                    <li>Type anywhere. Distracting sites wait while you&apos;re in flow.</li>
                  </ol>
                </div>
                <a href="/download/undercurrent-chrome.zip" download className="flex items-center justify-center gap-2 rounded-xl bg-warm px-5 py-3 font-medium text-ink transition hover:brightness-110">
                  <Download className="size-4" /> Download for Chrome
                </a>
              </GlowCard>
            </div>
          </Section>

          <footer className="flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 border-t border-white/10 py-10 text-sm text-mist">
            <p>Undercurrent. Made for the minutes when the code writes itself.</p>
            <Link href="/privacy" className="hover:text-fog">Privacy</Link>
          </footer>
        </div>
      </ScrollExpandMedia>
    </main>
  );
}
