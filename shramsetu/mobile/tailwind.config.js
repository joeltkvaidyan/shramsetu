/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefaf3",
          100: "#d6f2e1",
          200: "#aee4c6",
          300: "#7bd0a6",
          400: "#47b583",
          500: "#279a68",
          600: "#1a7c54",
          700: "#166345",
          800: "#144f39",
          900: "#0f3a2b",
        },
      },
    },
  },
  plugins: [],
};
