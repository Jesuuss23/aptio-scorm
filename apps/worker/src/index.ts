import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
});

console.log('👷 Aptio Worker inicializado...');

redis.on('connect', () => {
  console.log('🔌 Worker conectado exitosamente a Redis en localhost:6379');
});

redis.on('error', (err) => {
  console.error('❌ Error de conexión en Worker Redis:', err.message);
});