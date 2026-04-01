/**
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    "./app/**/*.{js,ts,tsx}",
    "./components/**/*.{js,ts,tsx}",
    "./app/components/**/*.{js,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0A1F3E",
        accent1: "#3A86FF",
        accent2: "#8338EC",
        bgLight: "#FFFFFF",
        bgGray: "#F8F9FA",
        textDark: "#1F2937",
        textGray: "#6B7280",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
      },
      boxShadow: {
        lg: "0 4px 12px rgba(0,0,0,0.1)",
      },
    },
  },
  plugins: [],
};