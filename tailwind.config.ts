import type { Config } from "tailwindcss";

// Tailwind CSS v4 uses CSS-based configuration via `@theme` in `app/globals.css`.
// This file exists for tooling/IDE compatibility and as an extension point for
// future custom utilities. Most configuration should live in CSS.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
};

export default config;
