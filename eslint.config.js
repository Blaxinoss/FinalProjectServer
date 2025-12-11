// eslint.config.js
import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  // 1. Base JavaScript rules
  js.configs.recommended,

  // 2. TypeScript rules
  {
    files: ["**/*.ts"],
    plugins: {
      "@typescript-eslint": ts,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      
       globals: {
    console: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    setInterval: "readonly",
    clearInterval: "readonly",
    // لو مشروع Node.js:
    process: "readonly",
    __dirname: "readonly",
    module: "readonly",
    require: "readonly",
  },
      parserOptions: {
        project: true, // read tsconfig.json automatically
      },
    },

rules: {
  // --- TypeScript Relaxed Rules ---
  "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
  "@typescript-eslint/no-non-null-assertion": "off",
"@typescript-eslint/no-unused-vars": [
  "warn",
  {
    vars: "all",
    args: "after-used",
    ignoreRestSiblings: true,
    caughtErrors: "all",
    varsIgnorePattern: "^_",
    argsIgnorePattern: "^_"
  }
],

  "no-unsafe-finally": "warn",

  // Optional: لو لسه عندك any
  "@typescript-eslint/no-explicit-any": "warn",

  // لو console مزعج:
  "no-console": "off",
},
    },
  {
    ignores: [
      "dist/",
      "build/",
      "node_modules/",
      "src/generated/",
      "src/types/",
    ],
  },
];
