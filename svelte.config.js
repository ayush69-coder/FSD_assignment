import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "frontend-build",
      assets: "frontend-build",
      precompress: false,
      strict: true,
    }),
    files: {
      appTemplate: "frontend/app.html",
      lib: "frontend/lib",
      routes: "frontend/routes",
    },
  },
};

export default config;
