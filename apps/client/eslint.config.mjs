import tseslint from "typescript-eslint";

// "react/jsx-filename-extension": "off",
// "react/jsx-props-no-spreading": "off",
// "react/no-unused-prop-types": "off",
// "react/require-default-props": "off",
// "react/no-unescaped-entities": "off",

/**
 * Target files are left open to eslint, if need to, set via "includes" in top-level tsconfig
 */
export default tseslint.config(
  {
    extends: [ "../../eslint.config.js", "next", "next/typescript", "next/core-web-vitals"]
  },
);
