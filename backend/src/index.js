import http from 'node:http';
import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import { attachWebSocket } from './ws.js';
import { bootstrap } from './scheduler.js';
import { shutdownBrowser } from './scraper.js';

const PORT = Number(process.env.PORT) || 4000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use('/api', routes);

const server = http.createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`[backend] http://0.0.0.0:${PORT}`);
  bootstrap();
});

// Clean shutdown
async function shutdown() {
  console.log('\n[backend] shutting down…');
  await shutdownBrowser().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
