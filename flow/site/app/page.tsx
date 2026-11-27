import Link from "next/link";
import { Keyboard, Brain, Moon, RotateCcw, Mic, Gauge, Waves, Code2, Globe, Download, ArrowRight } from "lucide-react";
import ScrollExpandMedia from "@/components/ui/scroll-expansion-hero";
import { GlowCard } from "@/components/ui/spotlight-card";
import { LiveDemo } from "@/components/live-demo";

const STEPS = [
  { icon: Keyboard, title: "Type", text: "The music rises.", color: "orange" as const },
  { icon: Brain, title: "Pause", text: "It softens while you think.", color: "blue" as const },
  { icon: Moon, title: "Leave", text: "It fades out.", color: "purple" as const },
  { icon: RotateCcw, title: "Return", text: "It picks up where it left off.", color: "green" as const },
];

const WHY = [
  { icon: Mic, title: "No lyrics", text: "Words compete with code for your attention." },
  { icon: Gauge, title: "Slow and soft", text: "Calm music is easier to read and think with." },
  { icon: Waves, title: "No sudden changes", text: "Every fade is slow, so nothing pulls you out." },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-16 sm:py-20">
      <h2 className="text-balance text-center font-display text-3xl font-semibold tracking-tight text-fog sm:text-4xl">{title}</h2>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <main className="bg-ink">
      <ScrollExpandMedia
        mediaType="video"
        mediaSrc="/media/undercurrent-demo.mp4"
        posterSrc="/media/demo-poster.jpg"
        bgImageSrc="/media/deep-water.jpg"
        title="Flow has a sound"
        date="Undercurrent"
        scrollToExpand="Scroll to dive in"
        textBlend
      >
        <div className="flex flex-col items-center">
          {/* Intro */}
          <section className="flex max-w-2xl flex-col items-center gap-6 py-10 text-center">
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
          <section id="try" className="w-full scroll-mt-8 py-10">
            <LiveDemo />
          </section>

          {/* How it works */}
          <Section title="How it works">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, text, color }) => (
                <GlowCard key={title} glowColor={color} customSize className="min-h-44 w-full">
                  <div className="flex flex-col justify-between gap-6">
                    <Icon className="size-7 text-fog" aria-hidden />
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
          <Section title="Built on research">
            <div className="grid gap-4 sm:grid-cols-3">
              {WHY.map(({ icon: Icon, title, text }) => (
                <GlowCard key={title} glowColor="blue" customSize className="w-full">
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
          <Section title="Get it free">
            <div id="get" className="grid scroll-mt-8 gap-4 md:grid-cols-2">
              <GlowCard glowColor="green" customSize className="w-full">
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

              <GlowCard glowColor="orange" customSize className="w-full">
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
