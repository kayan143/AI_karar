export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        karar: {
          50: '#f8f7ff',
          100: '#f0edff',
          200: '#e6d9ff',
          300: '#d4b5ff',
          400: '#ba87ff',
          500: '#9d5dff',
          600: '#8b3fff',
          700: '#7a2fd4',
          800: '#5f1fa6',
          900: '#4a0a78',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}
