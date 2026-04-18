import { ArrowRight, CheckCircle2, Command, ShieldCheck, TerminalSquare } from "lucide-react";
import { FeatureGrid } from "./components/FeatureGrid";
import { NavBar } from "./components/NavBar";
import { SectionHeading } from "./components/SectionHeading";
import { TerminalPanel } from "./components/TerminalPanel";
import { WorkflowSteps } from "./components/WorkflowSteps";

const README_URL = "https://github.com/karagozemin/0G/blob/main/README.md";

export default function App() {
  return (
    <div id="top" className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid bg-[length:36px_36px] opacity-20" />
      <NavBar />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 pb-20 pt-14 sm:px-6 lg:px-8">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 rounded-xl border border-line bg-panel/70 px-3 py-2">
              <img src="/0G-Forge-Logo.jpeg" alt="0G Forge logo" className="h-10 w-10 rounded-md object-cover" />
              <span className="text-sm font-medium text-white">0G Forge</span>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-textSoft">
              <TerminalSquare className="h-3.5 w-3.5 text-brand" />
              Terminal-native companion to 0G App
            </span>

            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              0G Forge brings prompt-to-app building into your shell.
            </h1>

            <p className="max-w-xl text-base leading-7 text-textSoft sm:text-lg">
              Login, initialize, create/edit with diff-first feedback, preview locally, deploy to Vercel, and sync lightweight project metadata — all from CLI.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-lg bg-brandStrong px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand"
              >
                View Demo Flow
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand hover:text-brand"
              >
                Explore CLI Commands
              </a>
            </div>
          </div>

          <TerminalPanel />
        </section>

        <section className="space-y-6 rounded-2xl border border-line bg-panel/60 p-6 md:p-8">
          <SectionHeading
            eyebrow="What it is"
            title="Browser builders exist. Terminal-first developers want the same flow in their own shell."
            description="0G Forge is the terminal-native companion to 0G App: practical prompt-to-app workflow for builders who iterate fastest in CLI."
          />
        </section>

        <section id="workflow" className="space-y-8">
          <SectionHeading
            eyebrow="Key workflow"
            title="From login to deploy in one coherent sequence"
            description="The workflow is built for fast, inspectable iteration with minimal context switching."
          />
          <WorkflowSteps />
        </section>

        <section id="features" className="space-y-8">
          <SectionHeading
            eyebrow="Feature set"
            title="Focused capabilities for real builder loops"
            description="No dashboard sprawl, no hidden automation. Just clear commands and predictable outputs."
          />
          <FeatureGrid />
        </section>

        <section id="trust" className="grid gap-5 rounded-2xl border border-line bg-panel/60 p-6 md:grid-cols-2 md:p-8">
          <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Mock mode (stable demos)
            </h3>
            <p className="text-sm leading-6 text-emerald-100/90">
              Use <code className="rounded bg-black/20 px-1 py-0.5">mock://local</code> for deterministic showcase runs and repeatable command output.
            </p>
          </article>

          <article className="rounded-xl border border-brand/30 bg-brand/10 p-5">
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-brand">
              <Command className="h-4 w-4" />
              Real proxy mode (supported)
            </h3>
            <p className="text-sm leading-6 text-slate-200">
              Works with real 0G Compute proxy endpoints. Provider runtime can still hit timeout or rate-limit constraints, surfaced with actionable CLI guidance.
            </p>
          </article>
        </section>

        <section className="space-y-5 rounded-2xl border border-line bg-panel/60 p-6 md:p-8">
          <SectionHeading
            eyebrow="Why it matters"
            title="Terminal-native matters for builders"
            description="Builders move fastest where they already work: shell, editor, git, deploy CLI. 0G Forge keeps the 0G app-building loop in that native path."
          />

          <ul className="grid gap-3 md:grid-cols-3">
            {["Fewer context switches during hackathon builds", "Clear plan + diff output before writing files", "Direct path from prompt to preview to deployment"].map((point) => (
              <li key={point} className="inline-flex items-start gap-2 rounded-lg border border-line bg-bg/40 px-4 py-3 text-sm text-textSoft">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section id="demo" className="space-y-8 rounded-2xl border border-line bg-panel/60 p-6 md:p-8">
          <SectionHeading
            eyebrow="Demo and showcase"
            title="Built to present clearly"
            description="Demo-ready workflow, install/package polish, real proxy login verification, and credible constraints documentation make this submission easy to judge."
          />

          <div className="grid gap-4 md:grid-cols-3">
            {[
              "Demo-ready with deterministic mock fallback",
              "Packaging/install flow validated for CLI distribution",
              "Built for builders, not general consumers"
            ].map((item) => (
              <div key={item} className="rounded-lg border border-line bg-bg/50 p-4 text-sm text-textSoft">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-gradient-to-r from-panel to-[#171b2d] p-8 text-center md:p-10">
          <p className="text-sm uppercase tracking-[0.18em] text-brand">Final CTA</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Ship your 0G app workflow from terminal, end to end.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-textSoft md:text-base">
            0G Forge keeps prompt, diff, preview, deploy, and sync in one serious developer path.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="#demo" className="rounded-lg bg-brandStrong px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand">
              View Demo Flow
            </a>
            <a href="#features" className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand hover:text-brand">
              Explore CLI Commands
            </a>
            <a href="#trust" className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand hover:text-brand">
              View Showcase
            </a>
            <a
              href={README_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand hover:text-brand"
            >
              Read README
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
