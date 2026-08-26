import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f2f0ff",
          100: "#e2defb",
          500: "#8374db",
          600: "#7262cb",
          700: "#5e4fb1",
          900: "#302b4d",
        },
      },
    },
  },
  plugins: [],
};
export default config;
