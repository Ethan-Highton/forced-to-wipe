import fs from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Resolves a request path to a file under root, or null. Only index.html, css/ and js/ qualify. */
export function resolveStaticPath(root, relPath) {
  if (relPath === '/' || relPath === '/index.html') return path.join(root, 'index.html');
  if (relPath.includes('\0') || relPath.includes('\\')) return null;
  if (!/^\/(css|js)\/./.test(relPath)) return null;
  if (relPath.split('/').includes('..')) return null;
  const full = path.resolve(root, `.${relPath}`);
  const allowed = ['css', 'js'].some((d) => full.startsWith(path.join(root, d) + path.sep));
  return allowed ? full : null;
}

/** Serves a static file. Returns false (nothing sent) when the path is not allowed or missing. */
export async function serveStatic(req, res, relPath, root) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const file = resolveStaticPath(root, relPath);
  if (!file) return false;
  let body;
  try {
    body = await fs.readFile(file);
  } catch {
    return false;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
