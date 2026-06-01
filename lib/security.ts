export function validateRequestSize(body: unknown, maxBytes = 10 * 1024) {
  return JSON.stringify(body).length <= maxBytes;
}