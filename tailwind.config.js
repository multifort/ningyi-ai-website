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
        primary: "#071B33",
        accent1: "#1F6FFF",
        accent2: "#4BD7E8",
        accentWarm: "#F2A55D",
        bgLight: "#FFFFFF",
        bgGray: "#F4F7FB",
        textDark: "#13243A",
        textGray: "#66758A",
      },
      fontFamily: {
        sans: ["Avenir Next", "PingFang SC", "Microsoft YaHei", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["DIN Alternate", "Avenir Next Condensed", "PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
      },
      boxShadow: {
        lg: "0 18px 50px rgba(7, 27, 51, 0.12)",
      },
    },
  },
  plugins: [],
};
