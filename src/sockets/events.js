let ioRef = null;

export function bindSocketServer(io) {
  ioRef = io;
}

/** Emits a domain event after the database operation has committed. */
export function emitEvent(event, payload, room = 'admin') {
  if (!ioRef) return;
  ioRef.to(room).emit(event, payload);
}

export const SOCKET_EVENTS = Object.freeze({
  SETTINGS_UPDATED: 'settings:updated',
  DEVICE_STATUS: 'device:status',
  SESSION_STARTED: 'session:started',
  SESSION_UPDATED: 'session:updated',
  SESSION_PAUSED: 'session:paused',
  SESSION_RESUMED: 'session:resumed',
  SESSION_ENDED: 'session:ended',
  VISIT_UPDATED: 'visit:updated',
  VISIT_CLOSED: 'visit:closed',
  INVOICE_ISSUED: 'invoice:issued',
  INVOICE_DELETED: 'invoice:deleted',
  STOCK_LOW: 'stock:low',
  EXPENSE_CREATED: 'expense:created',
});
