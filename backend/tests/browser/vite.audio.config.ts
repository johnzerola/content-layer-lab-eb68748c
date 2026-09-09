// Isolated component test only. Never used by the production Vite configuration.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: process.cwd(), envDir: false,
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', 'mp4-muxer'] },
  resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
  plugins: [
    {
      name: 'audio-smoke-isolated-tickets', enforce: 'pre',
      load(id) {
        if (id.endsWith('/src/lib/audio.functions.ts'))
          return 'export async function prepareAudioSeparation() { return window.audioSmokeTicket; }';
        if (id.endsWith('/src/lib/tts.functions.ts'))
          return 'export const NARRATION_VOICES=[{id:"test",label:"Not under test",hint:""}]; export async function generateNarration(){throw new Error("Not under test")}';
        if (id.endsWith('/src/components/editor/SoundLibrary.tsx'))
          return 'export function SoundLibrary(){return null}';
      },
    }, react(),
  ],
  server: { host: '127.0.0.1', port: 4180, strictPort: true },
});
