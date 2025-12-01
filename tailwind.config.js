/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary-orange": "#FF5722", // Example orange from the image style
        "dark-bg": "#121212",
        "card-bg": "#1E1E1E",
      },
    },
  },
  plugins: [],
}

