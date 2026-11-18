/**
 * Fixação de certificado (pinning) para servidores que usam só IP com certificado
 * próprio: o app aceita apenas o certificado cuja impressão SHA-256 veio embutida
 * no build. Qualquer outro certificado inválido continua sendo recusado.
 */
import { X509Certificate } from 'node:crypto';

export function certSha256(pem: string) {
  return new X509Certificate(pem).fingerprint256.replace(/:/g, '').toLowerCase();
}

export function isPinned(hostname: string, pem: string, pins: Record<string, string>, now = new Date()) {
  const pin = pins[hostname.toLowerCase()];
  if (!pin) return false;
  try {
    const cert = new X509Certificate(pem);
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) return false;
    return cert.fingerprint256.replace(/:/g, '').toLowerCase() === pin;
  } catch {
    return false;
  }
}
