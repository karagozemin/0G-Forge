import {
  Cloud,
  FileDiff,
  FolderGit2,
  PlugZap,
  ServerCog,
  Terminal
} from "lucide-react";

const features = [
  {
    title: "Prompt-to-app workflow",
    detail: "Run prompt-driven create/edit directly from your shell, not a separate dashboard.",
    icon: Terminal
  },
  {
    title: "Diff-first editing",
    detail: "Inspect plan and file diff before applying changes for safer iteration.",
    icon: FileDiff
  },
  {
    title: "Real 0G proxy integration",
    detail: "Use OpenAI-compatible 0G Compute proxy endpoints for real generation paths.",
    icon: PlugZap
  },
  {
    title: "Mock mode for deterministic demos",
    detail: "Switch to mock mode when you need stable, repeatable showcase runs.",
    icon: ServerCog
  },
  {
    title: "Preview and Vercel deploy",
    detail: "Preview locally and deploy from the same terminal-first workflow.",
    icon: Cloud
  },
  {
    title: "Lightweight sync + local state",
    detail: "Keep `.og` metadata and artifact context portable across environments.",
    icon: FolderGit2
  }
];

export function FeatureGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {features.map((feature) => {
        const Icon = feature.icon;

        return (
          <article
            key={feature.title}
            className="group rounded-xl border border-line bg-panel/70 p-5 transition hover:-translate-y-0.5 hover:border-brand/60 hover:bg-panel"
          >
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-bg">
              <Icon className="h-5 w-5 text-brand transition group-hover:scale-110" />
            </div>
            <h3 className="text-base font-semibold text-white">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-textSoft">{feature.detail}</p>
          </article>
        );
      })}
    </div>
  );
}
