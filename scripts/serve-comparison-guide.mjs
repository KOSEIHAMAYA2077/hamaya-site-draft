import { createServer } from 'node:http';
import { guideFiles } from './comparison-guide.mjs';
const port = Number(process.env.GUIDE_PORT || 4347);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('GUIDE_PORTは1024〜65535です。');
const files = await guideFiles();
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  if (
    ![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)
  ) {
    response.writeHead(403).end('Local guide only');
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const path = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  const file = files.get(path);
  if (!file) {
    response
      .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('この比較ガイドにはないファイルです。');
    return;
  }
  response.writeHead(200, {
    'Content-Type': file.type,
    'Content-Length': file.body.length,
  });
  response.end(request.method === 'HEAD' ? undefined : file.body);
});
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? '指定ポートは使用中です。既存プロセスを止めず、GUIDE_PORTで別のポートを指定してください。'
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(`比較ガイド: http://127.0.0.1:${port}/ (localhostのみ)`),
);
