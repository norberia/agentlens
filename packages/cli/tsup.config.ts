import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["cjs"],
  target: "node18",
  platform: "node",
  clean: true,
  minify: false,
  sourcemap: false,
  noExternal: [/@norberia\/agentlens-core/],
});
