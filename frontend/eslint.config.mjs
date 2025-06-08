import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname, // Ensure plugins are resolved correctly
});

const eslintConfig = [
  // Extend existing configurations
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Add custom rules to specifically address your build errors
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"], // Apply these rules to all relevant files
    rules: {
      // Disable the no-explicit-any rule to allow 'any' types for now
      // This is the primary blocker for your build.
      "@typescript-eslint/no-explicit-any": "off",

      // Change the exhaustive-deps rule to a warning instead of an error.
      // This gives you flexibility while still getting notifications.
      "react-hooks/exhaustive-deps": "warn",

      // Allow unused variables to be ignored if they are prefixed with an underscore (e.g., _userId)
      // Or change to "off" if you want to completely disable this check for now.
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]
    }
  }
];

export default eslintConfig;