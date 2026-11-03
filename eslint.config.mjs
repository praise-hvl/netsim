import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The studio's code box, bundled (scripts/studio/build-editor.sh).
    "studio/editor.js",
    // The Mac app's build output (mac/build.sh): Node and npm unpacked, and copies of the studio.
    "mac/.build/**",
    "mac/.cache/**",
    "mac/dist/**",
  ]),
]);

export default eslintConfig;
