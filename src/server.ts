import Fastify from 'fastify';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

server.get('/', async () => {
  return { 
    name: '8P3P Control Layer',
    version: '0.1.0',
    endpoints: ['/health', '/signals', '/decisions']
  };
});

server.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();