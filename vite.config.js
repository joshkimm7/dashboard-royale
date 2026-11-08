import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createReadStream, existsSync } from 'node:fs';

const DATA_FILE = 'data/dashboard.json';

// In dev, serve the prepared dataset at /data.json; production builds inline it (scripts/inject-data.mjs).
const serveData = {
  name: 'serve-dashboard-data',
  configureServer(server) {
    server.middlewares.use('/data.json', (req, res) => {
      if (!existsSync(DATA_FILE)) {
        res.statusCode = 404;
        res.end('Run `python build_data.py <official-data>` first to create ' + DATA_FILE);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      createReadStream(DATA_FILE).pipe(res);
    });
  },
};

export default defineConfig({
  plugins: [react(), viteSingleFile(), serveData],
  build: { outDir: 'build', emptyOutDir: true },
});
