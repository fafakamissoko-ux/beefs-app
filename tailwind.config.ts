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
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Primary — fire red/orange
        brand: {
          50: '#FFF4ED',
          100: '#FFE2CC',
          200: '#FFC299',
          300: '#FF9A5C',
          400: '#FF6B2C',
          500: '#E83A14',
          600: '#C42D0E',
          700: '#9E2209',
          800: '#7A1B07',
          900: '#521205',
        },
        // Accent — electric cyan
        accent: {
          DEFAULT: '#00E5FF',
          dim: '#00B8D4',
          bright: '#6EFFFF',
        },
        // Surfaces
        surface: {
          DEFAULT: '#000000',
          1: '#0A0A0C',
          2: '#111114',
          3: '#18181C',
          4: '#1F1F24',
          5: '#27272E',
        },
        // Legacy arena colors
        'arena-blue': '#00E5FF',
        'arena-red': '#E83A14',
        'arena-purple': '#B800FF',
        'arena-dark': '#0A0A0F',
        'arena-darker': '#050508',
        'arena-gray': '#1A1A24',
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '8px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'base': ['0.9375rem', { lineHeight: '1.5rem' }],
        'lg': ['1.0625rem', { lineHeight: '1.625rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.015em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.025em' }],
        '5xl': ['3rem', { lineHeight: '3rem', letterSpacing: '-0.03em' }],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(232, 58, 20, 0.3)',
        'glow-lg': '0 0 40px rgba(232, 58, 20, 0.4)',
        'glow-cyan': '0 0 20px rgba(0, 229, 255, 0.25)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 10px 40px rgba(0, 0, 0, 0.5)',
        'modal': '0 25px 50px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'shake': 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'tension-rise': 'tension-rise 0.3s ease-out',
        'gift-float': 'gift-float 2s ease-out forwards',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        shake: {
          '10%, 90%': { transform: 'translate3d(-1px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(2px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-4px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(4px, 0, 0)' },
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
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'chaos-gradient': 'linear-gradient(135deg, #E83A14 0%, #B800FF 50%, #E83A14 100%)',
      },
    },
  },
  plugins: [],
};
export default config;
