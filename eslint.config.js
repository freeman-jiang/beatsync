import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import { includeIgnoreFile } from "@eslint/compat";
import { fileURLToPath } from "node:url";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

/**
 * Links to rulebooks:
 * ESLint: https://eslint.org/docs/latest/rules/
 * Typescript-ESLint: https://typescript-eslint.io/rules/
 * Stylistic: https://eslint.style/rules
 */

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

/**
 * Target files are left open to eslint, if need to, set via "includes" in top-level tsconfig
 */
export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  {
    settings: {
      "import/resolver": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`

          bun: true, // resolve Bun modules https://github.com/import-js/eslint-import-resolver-typescript#bun

          // We have the option to include multiple tsconfigs, but our main one holds the relevant "paths" value for all modules
          project: "./tsconfig.json",
        }),
      ],
    },
  },
  stylistic.configs.customize({
    commaDangle: "only-multiline",
    indent: 2,
    jsx: false,
    quoteProps: "consistent-as-needed",
    semi: true,
  }),
  eslint.configs.recommended,
  tseslint.configs.stylisticTypeChecked,
  tseslint.configs.recommendedTypeChecked,
  {
    // For the above ^
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // ESLint
    rules: {
      "import/no-anonymous-default-export": "off",
      "no-constant-condition": [
        "warn",
        {
          checkLoops: "allExceptWhileTrue",
        },
      ],
      // I would prefer to also disable this for ^_ vars
      "prefer-const": ["warn", {
        destructuring: "all",
        ignoreReadBeforeAssign: true,
      }]
    },
  },
  {
    // Typescript-ESLint
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "none",
          varsIgnorePattern: "(^_.+)|(^[A-Z\\-_])",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": [
        "warn",
        {
          allowConstantLoopConditions: true,
          checkTypePredicates: true
        },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        {
          ignorePrimitives: {
            boolean: true,
          },
        },
      ],
      "@typescript-eslint/restrict-plus-operands": [
        "error",
        {
          allowNumberAndString: true,
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/prefer-optional-chain": "warn"
    },
  },
  {
    // Stylistic
    rules: {
      "@stylistic/array-bracket-spacing": "off",
      "@stylistic/no-multiple-empty-lines": [
        "error",
        {
          max: 4,
        },
      ],
      "@stylistic/brace-style": [
        "warn",
        "1tbs",
        {
          allowSingleLine: true,
        },
      ],
      "@stylistic/arrow-parens": "off",
      "@stylistic/eol-last": "error",
      "@stylistic/member-delimiter-style": [
        "error",
        {
          multiline: {
            delimiter: "semi",
          },
        },
      ],
      "@stylistic/no-extra-semi": "error",
      "@stylistic/no-multi-spaces": [
        "error",
        {
          ignoreEOLComments: true,
        },
      ],
      "@stylistic/quotes": [
        "error",
        "double",
        {
          avoidEscape: true,
          allowTemplateLiterals: "avoidEscape",
        }
      ],
      "@stylistic/no-trailing-spaces": ["warn", {
        ignoreComments: true
      }],
    },
  }
);
