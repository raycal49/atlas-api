import createDebug from 'debug';
import http from 'node:http';

import { createDatabase } from './config/database.js';
import { createJwtSecret } from './config/jwt.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';

const debug = createDebug('atlas:server');

const sql = createDatabase();
const jwtSecret = createJwtSecret();
const container = createContainer({ sql, jwtSecret });
const app = createApp(container);

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */

const server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Close the server and the container's resources on shutdown.
 */

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return; // a second Ctrl-C shouldn't re-enter this
  shuttingDown = true;

  debug(`${signal} received, closing server`);

  // stop accepting connections, then drain the database pool
  server.close(async (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    try {
      await container.close();
      process.exit(0);
    } catch (closeErr) {
      console.error(closeErr);
      process.exit(1);
    }
  });
}

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  const parsed = parseInt(val, 10);

  if (isNaN(parsed)) {
    // named pipe
    return val;
  }

  if (parsed >= 0) {
    // port number
    return parsed;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
  debug('Listening on ' + bind);

  if (typeof addr === 'string') {
    console.log(`Server is running on pipe ${addr}`);
  } else {
    console.log(`Server is running at http://localhost:${addr.port}`);
  }
}
