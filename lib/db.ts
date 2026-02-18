import { Pool, neonConfig } from '@neondatabase/serverless';
import { WebSocket } from 'ws';

neonConfig.webSocketConstructor = WebSocket;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
