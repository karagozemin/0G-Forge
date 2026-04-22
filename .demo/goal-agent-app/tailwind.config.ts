import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#06070d",
        panel: "#0f1220",
        line: "#272d48",
        textSoft: "#9aa4c0",
        brand: "#8b9bff",
        brandStrong: "#6d7dff"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,155,255,.25), 0 8px 40px rgba(39,59,180,.2)"
      },
      backgroundImage: {
        grid: "linear-gradient(to right, rgba(139,155,255,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(139,155,255,.08) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;
