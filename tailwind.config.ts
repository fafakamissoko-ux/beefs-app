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
        plasma: {
          DEFAULT: "#A200FF",
          200: "#EEC6FF",
          300: "#D580FF",
          400: "#C44DFF",
          500: "#A200FF",
          600: "#7A00CC",
          700: "#5C0099",
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
      },
      boxShadow: {
        "glow-plasma": "0 0 20px rgba(162, 0, 255, 0.4)",
        "glow-cyan": "0 0 20px rgba(0, 240, 255, 0.4)",
        "glow-blood": "0 0 20px rgba(255, 0, 60, 0.6)",
        card: "0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #A200FF 0%, #7A00CC 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
