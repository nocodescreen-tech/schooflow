import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app.js';
import sequelize from './config/database.js';
import { syncMissingColumns } from './config/syncMissingColumns.js';
import { migrateDocumentIdentity } from './config/migrations/documentIdentity.js';
import { initWebSocket } from './services/websocket.js';

const PORT = parseInt(process.env.PORT || '4001');

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    await sequelize.sync();
    await syncMissingColumns();
    await migrateDocumentIdentity();
    console.log('Database models synchronized.');

    const httpServer = createServer(app);

    initWebSocket(httpServer);
    console.log('WebSocket server initialized.');

    httpServer.listen(PORT, () => {
      console.log(`SCHOOLFLOW server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
