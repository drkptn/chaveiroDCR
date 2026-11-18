/** Mensagens recém-chegadas ao vivo (ganham animação de entrada uma única vez). */
const fresh = new Set<string>();

export function markFresh(id: string) {
  fresh.add(id);
  setTimeout(() => fresh.delete(id), 4000);
}

export function isFresh(id: string) {
  return fresh.has(id);
}
