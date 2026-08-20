import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    fontFamily: {
      sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      display: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
    },
    extend: {
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border-subtle))",
          strong: "hsl(var(--border-strong))",
          focus: "hsl(var(--border-focus))",
        },
        line: "var(--line)",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        /* Layered monochrome scale */
        surface: {
          0: "hsl(var(--bg-0) / <alpha-value>)",
          1: "hsl(var(--bg-1) / <alpha-value>)",
          2: "hsl(var(--bg-2) / <alpha-value>)",
          3: "hsl(var(--bg-3) / <alpha-value>)",
        },
        ink: {
          0: "hsl(var(--fg-0) / <alpha-value>)",
          1: "hsl(var(--fg-1) / <alpha-value>)",
          2: "hsl(var(--fg-2) / <alpha-value>)",
          3: "hsl(var(--fg-3) / <alpha-value>)",
          inverse: "hsl(var(--fg-inverse) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        /* Themeable chromatic accent (the single non-grayscale voice) */
        "accent-strong": {
          DEFAULT: "hsl(var(--accent-strong) / <alpha-value>)",
          foreground: "hsl(var(--accent-strong-fg) / <alpha-value>)",
          hover: "hsl(var(--accent-hover) / <alpha-value>)",
        },
        "accent-soft": "hsl(var(--accent-soft))",
        overlay: "hsl(var(--overlay) / <alpha-value>)",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        3: "var(--shadow-3)",
        4: "var(--shadow-4)",
      },
      transitionTimingFunction: {
        "out-quart": "var(--ease-out-quart)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "wings-marquee": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "wings-marquee-reverse": {
          from: { transform: "translateX(-50%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "wings-marquee": "wings-marquee 40s linear infinite",
        "wings-marquee-reverse": "wings-marquee-reverse 40s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
