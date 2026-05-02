import { Bot, CloudCog, Diff, Eye, KeyRound, Rocket, Sparkles } from "lucide-react";

const workflow = [
  { title: "Login", detail: "Authenticate with 0G Compute proxy", icon: KeyRound },
  { title: "Initialize", detail: "Scaffold project from template", icon: Sparkles },
  { title: "Prompt", detail: "Create or edit via CLI prompt", icon: Diff },
  { title: "Preview", detail: "Run locally and inspect output", icon: Eye },
  { title: "Deploy", detail: "Ship to Vercel from terminal", icon: Rocket },
  { title: "Sync", detail: "Push metadata to 0G Storage, hash to 0G Chain", icon: CloudCog },
  { title: "Agent Loop", detail: "Run autonomous goals with reflection (continue / retry / skip)", icon: Bot }
];

export function WorkflowSteps() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {workflow.map((step, index) => {
        const Icon = step.icon;

        return (
          <article
            key={step.title}
            className="rounded-xl border border-line bg-panel/70 p-4 transition hover:border-brand/60 hover:bg-panel"
          >
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg">
              <Icon className="h-4 w-4 text-brand" />
            </div>
            <p className="mb-1 text-xs text-textSoft">Step {index + 1}</p>
            <h3 className="text-base font-semibold text-white">{step.title}</h3>
            <p className="mt-1 text-sm text-textSoft">{step.detail}</p>
          </article>
        );
      })}
    </div>
  );
}
