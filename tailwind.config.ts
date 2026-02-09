import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#111827",
          hover: "#1A2236",
          card: "#151D2E",
        },
        border: {
          DEFAULT: "#1E293B",
          light: "#2A3A52",
        },
        brand: {
          DEFAULT: "#6366F1",
          hover: "#818CF8",
          bg: "rgba(99,102,241,0.08)",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
