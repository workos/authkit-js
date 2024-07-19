import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // format: ["cjs", "esm"], // Build for commonJS and ESmodules
  format: ["esm"], // Build for esm only
  dts: true, // Generate declaration file (.d.ts)
  splitting: false,
  sourcemap: true,
  clean: true,
});
