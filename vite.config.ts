import { defineConfig, Plugin } from 'vite';
import express from 'express';
import { apiRouter } from './src/api';

function apiPlugin(): Plugin {
  return {
    name: 'api-server-plugin',
    configureServer(server) {
      const app = express();
      app.use(express.json({ limit: '20mb' }));
      app.use(express.urlencoded({ extended: true, limit: '20mb' }));
      app.use('/api', apiRouter);
      server.middlewares.use(app);
    }
  };
}

export default defineConfig({
  plugins: [apiPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
