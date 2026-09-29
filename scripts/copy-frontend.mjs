import { cp, mkdir, rm } from 'node:fs/promises';

await mkdir('public', { recursive: true });
await rm('public/_app', { recursive: true, force: true });
await cp('frontend-build', 'public', { recursive: true, force: true });
console.log('Merged SvelteKit pages and assets into public/.');