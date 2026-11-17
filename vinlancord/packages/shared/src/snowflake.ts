/**
 * IDs no estilo snowflake (64 bits): 42 bits de tempo | 10 bits de worker | 12 bits de sequência.
 * Época em 2018-01-01: todos os IDs gerados entre 2026 e ~2087 têm exatamente 19 dígitos,
 * então a ordenação como texto coincide com a ordenação cronológica.
 */
export const VINLANCORD_EPOCH = 1514764800000n;

export class SnowflakeGenerator {
  private seq = 0n;
  private last = -1n;
  private readonly worker: bigint;

  constructor(workerId = 0) {
    this.worker = BigInt(workerId & 0x3ff);
  }

  next(): string {
    let now = BigInt(Date.now()) - VINLANCORD_EPOCH;
    if (now === this.last) {
      this.seq = (this.seq + 1n) & 0xfffn;
      if (this.seq === 0n) {
        while (now <= this.last) now = BigInt(Date.now()) - VINLANCORD_EPOCH;
      }
    } else {
      this.seq = 0n;
    }
    if (now < this.last) now = this.last; // relógio voltou: mantém monotônico
    this.last = now;
    return ((now << 22n) | (this.worker << 12n) | this.seq).toString();
  }
}

export function snowflakeTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + VINLANCORD_EPOCH);
}

/** Snowflake "fantasma" para um instante (útil para filtros de data na busca). */
export function snowflakeFromTime(ms: number): string {
  return ((BigInt(ms) - VINLANCORD_EPOCH) << 22n).toString();
}

export function isSnowflake(v: unknown): v is string {
  return typeof v === 'string' && /^\d{15,20}$/.test(v);
}

/** Compara dois snowflakes numericamente. */
export function compareSnowflakes(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}
