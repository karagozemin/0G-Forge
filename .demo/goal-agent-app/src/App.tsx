import { ArrowRight, CheckCircle2, Command, ShieldCheck, TerminalSquare } from "lucide-react";
import { FeatureGrid } from "./components/FeatureGrid";
import { NavBar } from "./components/NavBar";
import { SectionHeading } from "./components/SectionHeading";
import { TerminalPanel } from "./components/TerminalPanel";
import { UsageGuide } from "./components/UsageGuide";
import { WorkflowSteps } from "./components/WorkflowSteps";

const README_URL = "https://github.com/karagozemin/0G-Forge";

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
              ZeroClaw-style agent framework built on 0G
            </span>

            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              0G Forge brings prompt-to-app building into your shell.
            </h1>

            <p className="max-w-xl text-base leading-7 text-textSoft sm:text-lg">
              A terminal-native agent framework and CLI — powered by 0G Compute for inference, 0G Storage for persistent memory, and 0G Chain for on-chain registration.
            </p>

            <div className="max-w-xl rounded-xl border border-line bg-panel/70 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand">Install globally</p>
              <pre className="overflow-x-auto text-xs text-slate-200 sm:text-sm">
                <code>$ npm install -g @kaptan_web3/og-cli{"\n"}$ og --help</code>
              </pre>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-lg bg-brandStrong px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand"
              >
                View Demo Flow
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#framework"
                className="inline-flex items-center rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand hover:text-brand"
              >
                Explore Framework
              </a>
            </div>
          </div>

          <TerminalPanel />
        </section>

        <section className="space-y-6 rounded-2xl border border-line bg-panel/60 p-6 md:p-8">
          <SectionHeading
            eyebrow="What it is"
            title="A ZeroClaw-style framework alternative built natively on 0G."
            description="Where OpenClaw provides autonomous agent execution loops, 0G Forge provides the code-generation and deployment substrate — a framework primitive that agent builders use to scaffold, modify, and ship on-chain AI apps."
          />
        </section>

        <UsageGuide />

        <section id="framework" className="space-y-8">
          <SectionHeading
            eyebrow="forge-agent runtime"
            title="Three primitives. Any agent can build on top."
            description="AgentLoop, ToolRegistry, and MemoryLayer are the core framework interfaces. Wire them together to run autonomous multi-step goals with reflection."
          />

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "AgentLoop",
                desc: "Goal execution engine with built-in reflection: continue / retry / skip / abort after each step.",
                code: 'loop.addGoal("Build hero section", "og:create")\n     .addGoal("Improve contrast", "og:edit");\nawait loop.run();'
              },
              {
                label: "ToolRegistry",
                desc: "Register any tool. Built-ins wrap og create, og edit, and og sync push — or plug in your own.",
                code: 'const registry = new ToolRegistry()\n  .register(createOgCreateTool(opts))\n  .register(createOgEditTool(opts));'
              },
              {
                label: "MemoryLayer",
                desc: "Backend-agnostic agent state. Reads and writes persist to local file or 0G Storage.",
                code: 'const memory = new MemoryLayer(\n  createLocalMemoryBackend("./state.json"),\n  "my-agent"\n);'
              }
            ].map((item) => (
              <article key={item.label} className="rounded-xl border border-line bg-panel/70 p-5 space-y-3">
                <h3 className="text-base font-semibold text-brand">{item.label}</h3>
                <p className="text-sm leading-6 text-textSoft">{item.desc}</p>
                <pre className="rounded-lg border border-line bg-bg p-3 text-xs text-slate-300 overflow-x-auto">
                  <code>{item.code}</code>
                </pre>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="space-y-8">
          <SectionHeading
            eyebrow="Key workflow"
            title="From login to agent loop in one coherent sequence"
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
              0G Storage — persistent memory
            </h3>
            <p className="text-sm leading-6 text-emerald-100/90">
              Enable <code className="rounded bg-black/20 px-1 py-0.5">OG_STORAGE_ENABLED=1</code> to sync project metadata and agent memory to the 0G Storage network — readable across machines.
            </p>
          </article>

          <article className="rounded-xl border border-brand/30 bg-brand/10 p-5">
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-brand">
              <Command className="h-4 w-4" />
              0G Chain — on-chain registry
            </h3>
            <p className="text-sm leading-6 text-slate-200">
              <code className="rounded bg-black/20 px-1 py-0.5">FrameworkRegistry</code> contract on Galileo Testnet stores the latest 0G Storage hash per project and registers framework entries on-chain.
            </p>
          </article>
        </section>

        <section className="space-y-5 rounded-2xl border border-line bg-panel/60 p-6 md:p-8">
          <SectionHeading
            eyebrow="Why it matters"
            title="Terminal-native matters for builders"
            description="Builders move fastest where they already work: shell, editor, git, deploy CLI. 0G Forge keeps the full agent-build loop — from inference to on-chain registration — in that native path."
          />

          <ul className="grid gap-3 md:grid-cols-3">
            {[
              "Agent framework with AgentLoop, ToolRegistry, MemoryLayer",
              "0G Compute inference → 0G Storage memory → 0G Chain registry",
              "Direct path from autonomous goal to deployed app"
            ].map((point) => (
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
            description="Demo-ready workflow, install/package polish, real proxy login verification, forge-agent runtime with reflection loop, and 0G protocol integration make this submission easy to judge."
          />

          <div className="grid gap-4 md:grid-cols-3">
            {[
              "Demo-ready with deterministic mock fallback",
              "forge-agent runtime: AgentLoop + ToolRegistry + MemoryLayer",
              "0G Compute · 0G Storage · 0G Chain all integrated"
            ].map((item) => (
              <div key={item} className="rounded-lg border border-line bg-bg/50 p-4 text-sm text-textSoft">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-gradient-to-r from-panel to-[#171b2d] p-8 text-center md:p-10">
          <p className="text-sm uppercase tracking-[0.18em] text-brand">Get started</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Build autonomous AI apps on 0G — from terminal, end to end.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-textSoft md:text-base">
            0G Forge keeps inference, agent memory, on-chain registration, and deployment in one serious developer path.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="#framework" className="rounded-lg bg-brandStrong px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand">
              Explore Framework
            </a>
            <a href="#demo" className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand hover:text-brand">
              View Demo Flow
            </a>
            <a href="#features" className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand hover:text-brand">
              Explore CLI Commands
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
