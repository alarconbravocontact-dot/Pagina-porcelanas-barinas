import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // El paquete compartido se incluye en el bundle; el resto de dependencias se resuelve en runtime.
  noExternal: ['@porcelanas/shared'],
});
