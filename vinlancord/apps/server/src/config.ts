import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

if (existsSync('.env') && !process.env.VINLANCORD_SKIP_DOTENV) process.loadEnvFile('.env');

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(8787),
  PUBLIC_URL: z.string().url().default('http://localhost:8787'),
  WEB_URL: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  REDIS_URL: z.string().optional().default(''),
  SECRET_KEY: z.string().optional(),
  CORS_ORIGINS: list,
  TRUST_PROXY: bool(false),
  /** HTTPS direto no servidor (modo anfitrião, sem proxy na frente) */
  TLS_CERT_FILE: z.string().optional().default(''),
  TLS_KEY_FILE: z.string().optional().default(''),
  LOG_LEVEL: z.string().default('info'),
  SERVE_WEB: z.string().optional(),

  REGISTRATION_ENABLED: bool(true),
  REGISTRATION_CODE: z.string().optional().default(''),
  REQUIRE_EMAIL_VERIFICATION: bool(false),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./data/uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool(true),
  S3_PUBLIC_ENDPOINT: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool(false),
  MAIL_FROM: z.string().default('Vinlancord <no-reply@vinlancord.local>'),
  MAIL_OUTBOX_DIR: z.string().default('./data/mail-outbox'),

  MEDIASOUP_LISTEN_IP: z.string().default('0.0.0.0'),
  MEDIASOUP_ANNOUNCED_IP: z.string().optional().default(''),
  /** Endereço extra na rede local (porta = MEDIASOUP_PORT + 50): permite chamadas no próprio PC/LAN sem depender do roteador */
  MEDIASOUP_LAN_ANNOUNCED_IP: z.string().optional().default(''),
  MEDIASOUP_PORT: z.coerce.number().int().default(40000),
  MEDIASOUP_WORKERS: z.coerce.number().int().min(1).optional(),
  MEDIASOUP_LOG_LEVEL: z.enum(['debug', 'warn', 'error', 'none']).default('warn'),
  VOICE_MAX_INCOMING_BITRATE: z.coerce.number().int().default(12_000_000),
  VOICE_RECONNECT_GRACE_MS: z.coerce.number().int().default(20_000),

  STUN_URLS: list,
  TURN_URLS: list,
  TURN_SECRET: z.string().optional().default(''),
  TURN_TTL: z.coerce.number().int().default(86400),

  GIPHY_API_KEY: z.string().optional().default(''),
  METRICS_TOKEN: z.string().optional().default(''),
  /** chave do operador do servidor para ações administrativas (ex.: conceder selos). Vazio = desligado */
  ADMIN_TOKEN: z.string().optional().default(''),
  WORKER_ID: z.coerce.number().int().min(0).max(1023).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Configuração inválida:\n' + parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && (!env.SECRET_KEY || env.SECRET_KEY.length < 32)) {
  console.error('❌ SECRET_KEY é obrigatório em produção (mínimo 32 caracteres). Gere com: openssl rand -hex 32');
  process.exit(1);
}

const secretKey = env.SECRET_KEY && env.SECRET_KEY.length >= 32 ? env.SECRET_KEY : randomBytes(32).toString('hex');
if (!env.SECRET_KEY) {
  console.warn('⚠️  SECRET_KEY não definido — usando uma chave temporária (URLs assinadas expiram ao reiniciar).');
}

export const config = {
  ...env,
  SECRET_KEY: secretKey,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  WEB_URL: env.WEB_URL || env.PUBLIC_URL,
  MEDIASOUP_WORKERS: env.MEDIASOUP_WORKERS ?? Math.max(1, Math.min(cpus().length, 4)),
  corsOrigins: [
    'app://vinlancord',
    // app de celular (Capacitor): Android e iOS
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    env.PUBLIC_URL.replace(/\/$/, ''),
    ...env.CORS_ORIGINS,
  ],
};

export type Config = typeof config;
