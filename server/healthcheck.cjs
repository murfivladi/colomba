// Проверка здоровья контейнера: HTTPS, если включён TLS, иначе HTTP.
const tls = !!process.env.TLS_CERT_FILE;
const mod = require(tls ? 'https' : 'http');
mod
  .get({ host: '127.0.0.1', port: process.env.PORT || 8080, path: '/api/health', rejectUnauthorized: false, timeout: 4000 }, (r) => process.exit(r.statusCode === 200 ? 0 : 1))
  .on('error', () => process.exit(1));
