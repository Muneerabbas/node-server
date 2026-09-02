export const ok = (data, status = 200) => ({ status, body: { ok: true, data } });
export const fail = (code, message, status = 400) => ({ status, body: { ok: false, error: { code, message } } });
export const send = (response, result) => response.status(result.status).json(result.body);
export const page = (request) => ({ limit: Math.min(Math.max(Number(request.query.limit) || 50, 1), 200), offset: Math.max(Number(request.query.offset) || 0, 0) });
