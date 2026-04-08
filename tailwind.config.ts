import type { Config } from "tailwindcss";

/** StyleArena — Obsidian / Ember / Cobalt (charte exclusive) */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        obsidian: {
          DEFAULT: "#08080A",
          950: "#040405",
          900: "#0c0c0f",
        },
        ember: {
          DEFAULT: "#FF4D00",
          400: "#ff6a2e",
          500: "#FF4D00",
          600: "#cc3d00",
          700: "#992e00",
        },
        cobalt: {
          DEFAULT: "#0052FF",
          400: "#3377ff",
          500: "#0052FF",
          600: "#0040cc",
        },
        brand: {
          50: "#fff4ed",
          100: "#ffe0d4",
          200: "#ffc2a8",
          300: "#ff9466",
          400: "#ff6a2e",
          500: "#FF4D00",
          600: "#cc3d00",
          700: "#992e00",
          800: "#662000",
          900: "#331000",
        },
        accent: {
          DEFAULT: "#0052FF",
          dim: "#0040cc",
          bright: "#3377ff",
        },
        surface: {
          DEFAULT: "#08080A",
          1: "#0c0c0f",
          2: "#101014",
          3: "#141418",
          4: "#1a1a1f",
          5: "#222228",
        },
        "arena-blue": "#0052FF",
        "arena-red": "#FF4D00",
        "arena-purple": "#0052FF",
        "arena-dark": "#08080A",
        "arena-darker": "#040405",
        "arena-gray": "#12121a",
        prestige: {
          void: "#08080A",
          ink: "#0c0c0f",
          twitch: "#0052FF",
          "twitch-dim": "#0040cc",
          neon: "#0052FF",
          magenta: "#FF4D00",
        },
      },
      borderRadius: {
        sharp: "2px",
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
        lg: "4px",
        xl: "4px",
        "2xl": "4px",
        "3xl": "6px",
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.625rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.015em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }],
        "5xl": ["3rem", { lineHeight: "3rem", letterSpacing: "-0.03em" }],
      },
      boxShadow: {
        glow: "0 0 24px rgba(255, 77, 0, 0.35)",
        "glow-lg": "0 0 48px rgba(255, 77, 0, 0.28)",
        "glow-cyan": "0 0 24px rgba(0, 82, 255, 0.35)",
        "neon-cyan": "0 0 24px rgba(0, 82, 255, 0.45), inset 0 0 28px rgba(0, 82, 255, 0.1)",
        "neon-purple": "0 0 28px rgba(255, 77, 0, 0.35), inset 0 0 20px rgba(255, 77, 0, 0.08)",
        chrome:
          "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.65)",
        "prestige-ring":
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.55)",
        card: "0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)",
        "card-hover": "0 12px 48px rgba(0,0,0,0.6)",
        modal: "0 24px 64px rgba(0, 0, 0, 0.75)",
      },
      animation: {
        shake: "shake 0.5s cubic-bezier(.36,.07,.19,.97) both",
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "tension-rise": "tension-rise 0.3s ease-out",
        "gift-float": "gift-float 2s ease-out forwards",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "neon-pulse": "neon-pulse 2.2s ease-in-out infinite",
      },
      keyframes: {
        shake: {
          "10%, 90%": { transform: "translate3d(-1px, 0, 0)" },
          "20%, 80%": { transform: "translate3d(2px, 0, 0)" },
          "30%, 50%, 70%": { transform: "translate3d(-4px, 0, 0)" },
          "40%, 60%": { transform: "translate3d(4px, 0, 0)" },
        },
        "tension-rise": {
          "0%": { transform: "scaleY(0.95)" },
          "50%": { transform: "scaleY(1.05)" },
          "100%": { transform: "scaleY(1)" },
        },
        "gift-float": {
          "0%": { transform: "translateY(0) scale(0)", opacity: "0" },
          "50%": { opacity: "1" },
          "100%": { transform: "translateY(-200px) scale(1.5)", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "neon-pulse": {
          "0%, 100%": {
            boxShadow:
              "inset 0 0 0 1px rgba(0, 82, 255, 0.45), 0 0 22px rgba(255, 77, 0, 0.25)",
          },
          "50%": {
            boxShadow:
              "inset 0 0 0 1px rgba(255, 77, 0, 0.5), 0 0 36px rgba(0, 82, 255, 0.35)",
          },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "chaos-gradient":
          "linear-gradient(135deg, #FF4D00 0%, #0052FF 50%, #FF4D00 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
