/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
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
