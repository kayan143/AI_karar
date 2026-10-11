process.env.NODE_ENV = 'development';
process.env.API_PORT = process.env.API_PORT || '5001';
process.env.HOST = '127.0.0.1';
process.env.KARAR_HTTPS = 'true';

await import('./index.js');
