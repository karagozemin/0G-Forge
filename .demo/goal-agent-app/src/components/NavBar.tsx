const DOCS_URL = "https://github.com/karagozemin/0G-Forge";

const navItems = [
  { label: "How to Use", href: "#how-to-use" },
  { label: "Framework", href: "#framework" },
  { label: "Workflow", href: "#workflow" },
  { label: "Features", href: "#features" },
  { label: "Trust", href: "#trust" },
  { label: "Demo", href: "#demo" }
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="inline-flex items-center gap-2 font-semibold tracking-tight text-white">
          <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-line bg-panel">
            <img src="/0G-Forge-Logo.jpeg" alt="0G Forge logo" className="h-full w-full object-cover" />
          </span>
          <span>0G Forge</span>
        </a>

        <nav className="hidden items-center gap-6 text-sm text-textSoft md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>

        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-white transition hover:border-brand hover:text-brand md:text-sm"
        >
          View Docs
        </a>
      </div>
    </header>
  );
}
