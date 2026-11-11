import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { verifyToken } from '../modules/auth/service.js';
import { User } from '../modules/users/model.js';
import { bindSocketServer } from './events.js';

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const ticket = socket.handshake.auth?.ticket;
      if (!ticket) return next(new Error('unauthorized'));

      const payload = verifyToken(ticket, 'socket');
      const user = await User.findById(payload.sub);
      if (!user || user.status !== 'active' || user.tokenVersion !== payload.ver) {
        return next(new Error('unauthorized'));
      }

      socket.data.userId = user._id.toString();
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('admin');
    socket.emit('connected', { serverTime: new Date().toISOString() });
    logger.debug({ userId: socket.data.userId }, 'Socket connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ reason }, 'Socket disconnected');
    });
  });

  bindSocketServer(io);
  return io;
}
