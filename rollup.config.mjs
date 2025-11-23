// Rollup configuration for Pluggy
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

export default [
  // ESM build
  {
    input: "src/index.ts", // single entry point
    output: {
      file: "dist/index.mjs",
      format: "esm",
      sourcemap: true,
    },
    plugins: [
      resolve({ extensions: [".js", ".ts"] }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationDir: "dist/types",
      }),
    ],
    external: ["vite", "typescript"],
  },

  // CommonJS build
  {
    input: "src/index.ts",
    output: {
      file: "dist/cjs/index.cjs",
      format: "cjs",
      sourcemap: true,
    },
    plugins: [
      resolve({ extensions: [".js", ".ts"] }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
      }),
    ],
    external: ["vite", "typescript"],
  },
];
