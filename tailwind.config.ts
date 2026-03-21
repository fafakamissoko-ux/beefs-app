import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'arena-blue': '#00F0FF',
        'arena-red': '#FF0055',
        'arena-purple': '#B800FF',
        'arena-dark': '#0A0A0F',
        'arena-darker': '#050508',
        'arena-gray': '#1A1A24',
      },
      animation: {
        'shake': 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'tension-rise': 'tension-rise 0.3s ease-out',
        'gift-float': 'gift-float 2s ease-out forwards',
      },
      keyframes: {
        shake: {
          '10%, 90%': {
            transform: 'translate3d(-1px, 0, 0)',
          },
          '20%, 80%': {
            transform: 'translate3d(2px, 0, 0)',
          },
          '30%, 50%, 70%': {
            transform: 'translate3d(-4px, 0, 0)',
          },
          '40%, 60%': {
            transform: 'translate3d(4px, 0, 0)',
          },
        },
        'tension-rise': {
          '0%': { transform: 'scaleY(0.95)' },
          '50%': { transform: 'scaleY(1.05)' },
          '100%': { transform: 'scaleY(1)' },
        },
        'gift-float': {
          '0%': { transform: 'translateY(0) scale(0)', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateY(-200px) scale(1.5)', opacity: '0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'chaos-gradient': 'linear-gradient(135deg, #FF0055 0%, #B800FF 50%, #FF0055 100%)',
      },
    },
  },
  plugins: [],
};
export default config;
