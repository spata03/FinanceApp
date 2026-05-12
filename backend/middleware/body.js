/**
 * middleware/body.js — Async JSON body reader with size limit.
 */

export async function readBody(req, maxBytes = 256 * 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      const error = new Error('Payload troppo grande');
      error.status = 413;
      throw error;
    }
  }
  return body ? JSON.parse(body) : {};
}
