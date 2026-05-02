import {
  Bot,
  Cloud,
  Database,
  FileDiff,
  FolderGit2,
  Link2,
  PlugZap,
  ServerCog,
  Terminal
} from "lucide-react";

const features = [
  {
    title: "forge-agent Runtime",
    detail: "AgentLoop, ToolRegistry, and MemoryLayer — a ZeroClaw-style framework for autonomous goal execution with reflection loops.",
    icon: Bot
  },
  {
    title: "0G Storage Sync",
    detail: "og sync push/pull stores project metadata and agent memory on the 0G Storage network — persistent across machines.",
    icon: Database
  },
  {
    title: "0G Chain Registry",
    detail: "FrameworkRegistry contract on Galileo Testnet stores sync hashes and framework entries on-chain (chainId 16602).",
    icon: Link2
  },
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
    title: "Real 0G Compute integration",
    detail: "Use OpenAI-compatible 0G Compute endpoints for real inference on every og create / og edit call.",
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
    title: "Portable project state",
    detail: "Keep `.og` manifest and sync metadata portable across environments via 0G Storage.",
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
