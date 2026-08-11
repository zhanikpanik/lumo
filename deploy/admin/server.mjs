import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

async function listDir(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries.map(e => `${e.parentPath ?? dir}/${e.name}`).join('\n');
  } catch (e) { return String(e); }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/__debug') {
      const files = await listDir(process.cwd());
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(`cwd=${process.cwd()}\nport=${PORT}\ndist=${DIST}\n---\n${files}`);
    }

    const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const data = await readFile(join(DIST, filePath));
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    try {
      const data = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}).listen(PORT, () => console.log(`Admin on ${PORT}, cwd=${process.cwd()}, dist=${DIST}`));
