/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#8B5E3C', // Warm Bread Brown
        primaryLight: '#A67B5B',
        primaryDark: '#6F4E37',
        accent: '#E6CCB2', // Flour/Cream
        surface: '#FDFCFB', // Warm Paper
      }
    },
  },
  plugins: [],
}
