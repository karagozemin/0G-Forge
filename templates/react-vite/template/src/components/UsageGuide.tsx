import { CheckCircle2 } from "lucide-react";

const steps = [
  {
    title: "1) Login",
    detail: "Authenticate using either real proxy mode or mock mode."
  },
  {
    title: "2) Init",
    detail: "Choose a template and initialize your project directory."
  },
  {
    title: "3) Create/Edit",
    detail: "Write a prompt, inspect diff output, then apply changes."
  },
  {
    title: "4) Preview",
    detail: "Run locally and verify the result immediately."
  },
  {
    title: "5) Deploy",
    detail: "Deploy to Vercel directly from your terminal."
  },
  {
    title: "6) Sync",
    detail: "Push/pull `.og` metadata state across environments."
  }
];

const commandBlocks = [
  {
    title: "Real proxy (standard usage)",
    command: [
      "og login --token $OG_REAL_TOKEN --endpoint https://compute-network-4.integratenetwork.work/v1/proxy",
      "og init --template react-vite --dir ./my-app --yes",
      "cd ./my-app && pnpm install",
      "og create --prompt \"Add a hero section\" --dry-run --yes",
      "og preview",
      "og deploy vercel --yes",
      "og sync push"
    ]
  },
  {
    title: "Mock mode (demo-safe)",
    command: [
      "og login --token mock-token --endpoint mock://local",
      "og init --template react-vite --dir ./my-app --yes",
      "og create --prompt \"Add a hero section\" --dry-run --yes"
    ]
  }
];

export function UsageGuide() {
  return (
    <section id="how-to-use" className="space-y-8 rounded-2xl border border-line bg-panel/60 p-6 md:p-8">
      <div className="space-y-3">
        <span className="inline-flex rounded-full border border-line bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-brand">
          How to use
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          Get started in minutes: simple, clear, terminal-first
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-textSoft md:text-base">
          0G Forge is a CLI product. The fastest path is: login → init → create/edit → preview → deploy → sync.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <article key={step.title} className="rounded-xl border border-line bg-bg/40 p-4">
            <h3 className="text-sm font-semibold text-white">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-textSoft">{step.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {commandBlocks.map((block) => (
          <article key={block.title} className="overflow-hidden rounded-xl border border-line bg-bg/50">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-medium text-white">{block.title}</div>
            <pre className="overflow-x-auto p-4 text-xs text-slate-200 sm:text-sm">
              <code>
                {block.command.map((line) => `$ ${line}`).join("\n")}
              </code>
            </pre>
          </article>
        ))}
      </div>

      <div className="inline-flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-slate-200">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        Start with <code className="rounded bg-black/20 px-1 py-0.5">--dry-run</code> to inspect plan and diff before applying changes.
      </div>
    </section>
  );
}
