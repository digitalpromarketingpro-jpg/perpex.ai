import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    // Use jsdom to simulate browser environment for React component tests
    environment: "jsdom",

    // Expose vitest globals (describe, it, expect, vi) without explicit imports
    globals: true,

    // Setup file that imports jest-dom matchers
    setupFiles: ["__tests__/setup.ts"],

    // Glob patterns for test discovery
    include: ["__tests__/**/*.test.{ts,tsx}", "**/*.test.{ts,tsx}"],

    // Exclude build artifacts and node_modules
    exclude: ["node_modules", ".next", "coverage"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "coverage",
      exclude: [
        "node_modules/",
        ".next/",
        "__tests__/",
        "**/*.d.ts",
        "**/*.config.*",
        "components/ui/**", // shadcn generated components
        "app/globals.css",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },

    // Reporter for CI output
    reporters: process.env.CI ? ["verbose", "json"] : ["verbose"],

    // Output JSON results in CI
    outputFile: process.env.CI ? "test-results.json" : undefined,
  },

  resolve: {
    alias: {
      // Mirror the @/ path alias from tsconfig.json
      "@": path.resolve(__dirname, "./"),
    },
  },
})
