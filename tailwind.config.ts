import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Monochrome "brand" ramp — black/white/grey. Keeps every `brand-*`
        // utility working while rendering the UI in greyscale.
        brand: {
          50: "#f5f5f5",
          100: "#e5e5e5",
          200: "#d4d4d4",
          300: "#a3a3a3",
          400: "#525252",
          500: "#404040",
          600: "#171717",
          700: "#000000",
          800: "#000000",
          900: "#000000",
        },
        // Secondary accent, also greyscale.
        teal: {
          500: "#404040",
          600: "#262626",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
