import { Pool, neonConfig } from '@neondatabase/serverless';
import { WebSocket } from 'ws';

neonConfig.webSocketConstructor = WebSocket;

// Make database optional for build time
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';

export const pool = new Pool({
  connectionString: DATABASE_URL,
});
