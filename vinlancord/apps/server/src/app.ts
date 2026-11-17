import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { LIMITS } from '@vinlancord/shared';
import { config } from './config';
import { ApiError } from './lib/errors';
import { kv } from './lib/kv';
import { sha256 } from './lib/ids';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import relationshipRoutes from './routes/relationships';
import guildRoutes from './routes/guilds';
import channelRoutes from './routes/channels';
import inviteRoutes from './routes/invites';
import fileRoutes from './routes/files';
import miscRoutes, { gauges } from './routes/misc';
import { registerGateway } from './gateway';

export async function buildApp() {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          ...(config.isProd ? {} : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
        },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    routerOptions: { maxParamLength: 300 },
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  });

  const allowed = new Set(config.corsOrigins);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowed.has(origin)) return cb(null, true);
      cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    maxAge: 86400,
  });

  await app.register(rateLimit, {
    global: true,
    max: config.isTest ? 100_000 : 600,
    timeWindow: '1 minute',
    redis: kv.redis,
    nameSpace: 'vl-rl-',
    keyGenerator: (req) => {
      const h = req.headers.authorization;
      return h ? `t:${sha256(h).slice(0, 24)}` : `ip:${req.ip}`;
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: { code: 'RATE_LIMITED', message: 'Calma aí! Muitas requisições, tente de novo em instantes.' },
    }),
  });

  await app.register(multipart, { limits: { fileSize: LIMITS.ATTACHMENT_MAX_SIZE, files: 1, fields: 10, fieldSize: 4096 } });
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });

  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields } });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Calma aí! Muitas requisições.' } });
    if (status === 413 || (err as FastifyError).code === 'FST_REQ_FILE_TOO_LARGE')
      return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'Arquivo muito grande.' } });
    if (status < 500) return reply.status(status).send({ error: { code: (err as FastifyError).code ?? 'BAD_REQUEST', message: 'Requisição inválida.' } });
    req.log.error(err);
    gauges.httpErrors.inc();
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Algo deu errado do nosso lado. Tente novamente.' } });
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(relationshipRoutes);
      await api.register(guildRoutes);
      await api.register(channelRoutes);
      await api.register(inviteRoutes);
      await api.register(miscRoutes);
    },
    { prefix: '/api/v1' },
  );
  await app.register(fileRoutes);
  await app.register(registerGateway);

  // Cliente web (opcional): o mesmo servidor entrega a interface no navegador.
  const webDir = resolve(config.SERVE_WEB || '../web/dist');
  if (existsSync(resolve(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false, index: ['index.html'] });
    app.log.info(`Servindo cliente web de ${webDir}`);
  }

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }));
  return app;
}
