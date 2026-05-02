import { ArrowRight, Circle } from "lucide-react";

const commands = [
  "og login --endpoint https://compute-network-4.integratenetwork.work/v1/proxy",
  "og init --template react-vite",
  "og create --prompt \"Add a hero section\" --dry-run",
  "og preview",
  "og deploy vercel --yes",
  "og sync push"
];

export function TerminalPanel() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel shadow-glow">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Circle className="h-3 w-3 fill-red-400 text-red-400" />
          <Circle className="h-3 w-3 fill-amber-400 text-amber-400" />
          <Circle className="h-3 w-3 fill-emerald-400 text-emerald-400" />
        </div>
        <span className="text-xs text-textSoft">0G Forge CLI session</span>
      </div>

      <div className="space-y-3 p-5 font-mono text-xs leading-relaxed text-slate-200 sm:text-sm">
        {commands.map((command, index) => (
          <div key={command} className="flex items-start gap-2">
            <span className="mt-0.5 text-brand">$</span>
            <span className="flex-1 break-all">{command}</span>
            {index === commands.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-brand" /> : null}
          </div>
        ))}

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300">
          ✓ Diff inspected, app previewed, deployment URL captured, sync metadata stored.
        </div>
      </div>
    </div>
  );
}
