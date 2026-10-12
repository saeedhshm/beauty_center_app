export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function errorBody(code: string, status: number, requestId = 'request-id') {
  return json({ error: { code, message: `رسالة ${code}` }, requestId }, status);
}
