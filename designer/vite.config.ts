import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/* es2022 for the top-level await that waits on the brand fonts before the first render. */
export default defineConfig({ plugins: [svelte()], base: "/", build: { target: "es2022" } });
