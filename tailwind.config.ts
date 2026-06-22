import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      colors: {
        obsidian: {
          DEFAULT: "#030305",
          950: "#010102",
          900: "#07070A",
        },
        cyan: {
          DEFAULT: "#00F0FF",
          200: "#B9FFFF",
          300: "#7DFFFF",
          400: "#4DFFFF",
          500: "#00F0FF",
          600: "#00B3CC",
        },
        blood: {
          DEFAULT: "#FF003C",
          400: "#FF3363",
          500: "#FF003C",
          600: "#CC0030",
        },
        volt: {
          DEFAULT: "#DFFF00",
          400: "#E6FF4D",
          500: "#DFFF00",
        },
        prestige: {
          gold: "#E5C07B",
        },
        /** Brand Spatial Monolith — Cyan premium */
        brand: {
          400: "#00F0FF",
          500: "#00B3CC",
          600: "#008B99",
        },
      },
      boxShadow: {
        "glow-brand": "0 0 20px rgba(0, 240, 255, 0.4)",
        "glow-mediator": "0 0 20px rgba(212, 175, 55, 0.6)",
        "glow-cyan": "0 0 20px rgba(0, 240, 255, 0.4)",
        "glow-blood": "0 0 20px rgba(255, 0, 60, 0.6)",
        card: "0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #00F0FF 0%, #00B3CC 100%)",
      },
      zIndex: {
        base: "10",
        overlay: "50",
        modal: "100",
        "arena-hud": "200",
        toast: "300",
        critical: "999",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
