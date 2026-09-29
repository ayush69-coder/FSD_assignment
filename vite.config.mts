import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    exclude: ['lucide-svelte']
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/user': 'http://localhost:3000',
      '/config': 'http://localhost:3000',
      '/dashboard': 'http://localhost:3000',
      '/send': 'http://localhost:3000',
      '/report': 'http://localhost:3000',
      '/scheduled-jobs': 'http://localhost:3000',
      '/batch-status': 'http://localhost:3000',
      '/batch-pause': 'http://localhost:3000',
      '/batch-resume': 'http://localhost:3000',
      '/batch-cancel': 'http://localhost:3000',
      '/parse-excel': 'http://localhost:3000',
      '/provider-info': 'http://localhost:3000',
      '/test-notification': 'http://localhost:3000'
    }
  }
});