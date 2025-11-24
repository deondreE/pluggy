import { defineConfig } from "vite";
import pluggy from "./src/pluggy.ts";

export default defineConfig({
  plugins: [pluggy()],
  resolve: { extensions: [".pluggy", ".ts", ".js"] },
});
