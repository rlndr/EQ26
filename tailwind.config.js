/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Sampled from the DecoPortal brass gradient at the height the LAND3R letters sit
        brass: {
          light: '#e6c67a',
          DEFAULT: '#d8b553',
          dark: '#c9a227',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

