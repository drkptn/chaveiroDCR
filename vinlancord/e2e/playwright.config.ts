import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8790);
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://vinlancord:vinlancord_dev@localhost:5432/vinlancord_e2e';
/** Testa um servidor já em execução (ex.: a instalação Docker de produção) em vez de subir um. */
const EXTERNAL = process.env.E2E_BASE_URL;

/**
 * Testes ponta a ponta com DOIS usuários independentes (contextos de navegador
 * separados), usando mídia falsa do Chromium para microfone, câmera e tela.
 * O servidor real (API + gateway + SFU mediasoup) é iniciado automaticamente.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: EXTERNAL ?? `http://127.0.0.1:${PORT}`,
    ignoreHTTPSErrors: !!EXTERNAL,
    viewport: { width: 1400, height: 860 },
    trace: 'off',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: EXTERNAL
    ? undefined
    : {
        command: 'npx prisma migrate reset --force --skip-seed >/dev/null 2>&1 || npx prisma migrate deploy; npx tsx src/index.ts',
        cwd: '../apps/server',
        url: `http://127.0.0.1:${PORT}/api/v1/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          VINLANCORD_SKIP_DOTENV: '1',
          NODE_ENV: 'development',
          PORT: String(PORT),
          HOST: '127.0.0.1',
          PUBLIC_URL: `http://127.0.0.1:${PORT}`,
          DATABASE_URL: DB,
          REDIS_URL: process.env.E2E_REDIS_URL ?? '',
          SECRET_KEY: 'e2e-secret-key-e2e-secret-key-e2e-secret-key',
          STORAGE_LOCAL_DIR: './data/e2e-uploads',
          MAIL_OUTBOX_DIR: './data/e2e-mail',
          MEDIASOUP_WORKERS: '1',
          MEDIASOUP_PORT: '42000',
          MEDIASOUP_LISTEN_IP: '127.0.0.1',
          MEDIASOUP_ANNOUNCED_IP: '127.0.0.1',
          LOG_LEVEL: 'warn',
          SERVE_WEB: '../web/dist',
        },
      },
});
