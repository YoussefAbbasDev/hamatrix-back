export function sendOk(res, data, extraMeta = {}) {
  return res.status(200).json({
    data,
    meta: {
      requestId: res.locals.requestId,
      serverTime: new Date().toISOString(),
      ...extraMeta,
    },
  });
}

export function sendCreated(res, data, extraMeta = {}) {
  return res.status(201).json({
    data,
    meta: {
      requestId: res.locals.requestId,
      serverTime: new Date().toISOString(),
      ...extraMeta,
    },
  });
}

export function sendNoContent(res) {
  return res.status(204).end();
}

/** Sends a result produced by `runIdempotent` with fresh request metadata. */
export function sendResult(res, { status = 200, body, replayed = false } = {}) {
  return res.status(status).json({
    data: body,
    meta: {
      requestId: res.locals.requestId,
      serverTime: new Date().toISOString(),
      ...(replayed ? { replayed: true } : {}),
    },
  });
}
