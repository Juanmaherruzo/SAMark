/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#1a1a2e",
        panel: "#16213e",
        accent: "#0f3460",
      },
    },
  },
  plugins: [],
};
