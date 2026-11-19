/** Cliente REST do Vinlancord. */
import { desktop } from './desktop';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const SERVER_KEY = 'vl:server';
const TOKEN_KEY = 'vl:token';

function defaultServer() {
  const env = import.meta.env.VITE_DEFAULT_SERVER as string | undefined;
  if (env) return env;
  // app de celular: a interface vem de dentro do app (https://localhost); o servidor vem do convite
  if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return 'https://servidor-nao-configurado.invalid';
  if (location.protocol.startsWith('http') && location.port !== '5173') return location.origin;
  return 'http://localhost:8787';
}

export function normalizeServer(raw: string) {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = (/^(localhost|127\.|192\.168\.|10\.)/.test(s) ? 'http://' : 'https://') + s;
  return s.replace(/\/+$/, '');
}

let serverUrl = localStorage.getItem(SERVER_KEY) || defaultServer();
let token: string | null = null;
let onUnauthorized: () => void = () => {};

export const api = {
  get server() {
    return serverUrl;
  },
  setServer(url: string) {
    serverUrl = normalizeServer(url);
    localStorage.setItem(SERVER_KEY, serverUrl);
  },
  get token() {
    return token;
  },
  setToken(t: string | null) {
    token = t;
  },
  onUnauthorized(fn: () => void) {
    onUnauthorized = fn;
  },
  gatewayUrl() {
    return serverUrl.replace(/^http/, 'ws') + '/gateway';
  },

  async request<T = unknown>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(`${serverUrl}/api/v1${path}`, { method, headers, body: payload, signal: opts.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ApiError(0, 'NETWORK', 'Não foi possível conectar ao servidor. Verifique sua internet.');
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = (data as { error?: { code: string; message: string; fields?: Record<string, string> } })?.error;
      if (res.status === 401 && token) onUnauthorized();
      throw new ApiError(res.status, err?.code ?? 'HTTP_' + res.status, err?.message ?? 'Algo deu errado.', err?.fields);
    }
    return data as T;
  },
  get<T = unknown>(path: string, opts?: { signal?: AbortSignal }) {
    return this.request<T>('GET', path, undefined, opts);
  },
  post<T = unknown>(path: string, body: unknown = {}) {
    return this.request<T>('POST', path, body);
  },
  put<T = unknown>(path: string, body: unknown = {}) {
    return this.request<T>('PUT', path, body);
  },
  patch<T = unknown>(path: string, body: unknown = {}) {
    return this.request<T>('PATCH', path, body);
  },
  del<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('DELETE', path, body);
  },

  /** Upload com progresso (XHR). */
  upload<T = unknown>(path: string, file: Blob, filename: string, fields: Record<string, string> = {}, onProgress?: (p: number) => void, signal?: AbortSignal) {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${serverUrl}/api/v1${path}`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data: any = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* vazio */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
        else reject(new ApiError(xhr.status, data?.error?.code ?? 'UPLOAD_FAILED', data?.error?.message ?? 'Falha no envio do arquivo.'));
      };
      xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Falha de conexão durante o envio.'));
      xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Envio cancelado.'));
      signal?.addEventListener('abort', () => xhr.abort());
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append('file', file, filename);
      xhr.send(fd);
    });
  },
};

/** Token guardado com criptografia do sistema no desktop (DPAPI/Keychain) e no localStorage no navegador. */
export const tokenStore = {
  async load(): Promise<string | null> {
    if (desktop) return desktop.secure.get(TOKEN_KEY).catch(() => null);
    return localStorage.getItem(TOKEN_KEY);
  },
  async save(t: string) {
    if (desktop) await desktop.secure.set(TOKEN_KEY, t);
    else localStorage.setItem(TOKEN_KEY, t);
  },
  async clear() {
    if (desktop) await desktop.secure.delete(TOKEN_KEY).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
  },
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Algo deu errado.';
}
