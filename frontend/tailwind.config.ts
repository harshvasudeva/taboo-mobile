import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Team colors for dynamic team support
    'text-blue-400', 'text-red-400', 'text-green-400', 'text-blue-300', 'text-red-300', 'text-green-300',
    'bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-blue-500/10', 'bg-red-500/10', 'bg-green-500/10',
    'border-blue-500/20', 'border-red-500/20', 'border-green-500/20',
    'border-blue-500/30', 'border-red-500/30', 'border-green-500/30',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          dark: '#4338CA',
          light: '#6366F1',
        },
        team: {
          blue: '#3B82F6',
          red: '#EF4444',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
    },
  },
  plugins: [],
}
export default config
