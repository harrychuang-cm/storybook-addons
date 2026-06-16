import { copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: "src/index.ts",
    manager: "src/manager-entry.ts",
    preview: "src/preview.tsx",
    preset: "src/preset.ts",
  },
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "storybook",
    "@storybook/icons",
    "@xyflow/react",
    "storybook/internal/components",
    "storybook/manager-api",
  ],
  format: ["esm"],
  sourcemap: true,
  splitting: false,
  target: "es2022",
  tsconfig: "tsconfig.json",
  esbuildOptions(options) {
    options.jsx = "transform";
    options.jsxFactory = "createElement";
    options.jsxFragment = "Fragment";
    options.plugins = options.plugins ?? [];
    options.plugins.push({
      name: "prototype-inspector-css",
      setup(build) {
        build.onResolve(
          { filter: /^@xyflow\/react\/dist\/style\.css$/ },
          (args) => ({
            external: true,
            path: args.path,
          }),
        );
        build.onResolve({ filter: /\.css$/ }, (args) => ({
          external: true,
          path: args.path,
        }));
      },
    });
  },
  onSuccess() {
    copyFileSync(
      "src/prototype-inspector.css",
      "dist/prototype-inspector.css",
    );
    for (const artifact of [
      "index.css",
      "manager.css",
      "preview.css",
      "index.css.map",
      "manager.css.map",
      "preview.css.map",
    ]) {
      try {
        unlinkSync(join("dist", artifact));
      } catch {
        // ignore missing artifacts
      }
    }
  },
});
