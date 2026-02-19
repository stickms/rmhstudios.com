import { Pool, neonConfig } from '@neondatabase/serverless';
import { WebSocket } from 'ws';

neonConfig.webSocketConstructor = WebSocket;

/** Only set when DATABASE_URL is defined (avoids throwing at build time). */
export const pool: Pool | null = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
