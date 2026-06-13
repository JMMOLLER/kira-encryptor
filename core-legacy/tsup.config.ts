import { defineConfig } from "tsup";

const common = {
  entry: [
    "index.ts",
    "libs/**/*.ts",
    "utils/**/*.ts",
    "adapters/**/*.ts",
    "configs/**/*.ts",
    "crypto/**/*.ts",
    "workers/**/*.ts"
  ],
  splitting: false, // no code-splitting
  bundle: false, // 👉 transpila pero no agrupa
  sourcemap: true,
  dts: false, // ya lo hace tsc en build:types
  clean: false
};

export default [
  defineConfig({
    ...common,
    outDir: "dist/esm",
    format: ["esm"]
  }),
  defineConfig({
    ...common,
    outDir: "dist/cjs",
    format: ["cjs"]
  })
];
