import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config';

const transport = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

export const mailConfigured = !!transport;

/** Último e-mail por destinatário — usado apenas pelos testes automatizados. */
export const testOutbox = new Map<string, { subject: string; text: string; link: string }>();

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string, cta: { label: string; url: string }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#02060f;font-family:Segoe UI,Arial,sans-serif;color:#e6e6ef">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#071226;border:1px solid #14305a;border-radius:16px;padding:32px">
<tr><td style="font-size:22px;font-weight:700;letter-spacing:-.02em;color:#fff">
<span style="display:inline-block;width:28px;height:28px;border-radius:9px;background:radial-gradient(circle at 50% 75%,#f4fbff 0,#4f9fe8 35%,#0a2148 75%);border:1px solid #2b5a9a;vertical-align:middle;margin-right:10px"></span>Além-Mar</td></tr>
<tr><td style="padding-top:24px;font-size:18px;font-weight:600;color:#fff">${escape(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#b4b4c6">${body}</td></tr>
<tr><td style="padding-top:24px"><a href="${escape(cta.url)}" style="display:inline-block;background:#2f7fd6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${escape(cta.label)}</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#6b6b80">Se o botão não funcionar, copie este link:<br>${escape(cta.url)}</td></tr>
</table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, text: string, html: string, link: string) {
  if (config.isTest) {
    testOutbox.set(to, { subject, text, link });
    return;
  }
  if (transport) {
    await transport.sendMail({ from: config.MAIL_FROM, to, subject, text, html });
    return;
  }
  // Sem SMTP configurado: grava o e-mail em disco e mostra o link no log.
  await mkdir(config.MAIL_OUTBOX_DIR, { recursive: true });
  const file = join(config.MAIL_OUTBOX_DIR, `${Date.now()}-${to.replace(/[^a-z0-9@._-]/gi, '_')}.html`);
  await writeFile(file, html);
  console.info(`✉️  [mail-outbox] Para: ${to} | ${subject}\n    Link: ${link}\n    Arquivo: ${file}`);
}

export function sendVerificationEmail(to: string, name: string, token: string) {
  const link = `${config.WEB_URL.replace(/\/$/, '')}/#/verify?token=${encodeURIComponent(token)}`;
  return send(
    to,
    'Confirme seu e-mail no Além-Mar',
    `Olá, ${name}! Confirme seu e-mail acessando: ${link}`,
    layout('Confirme seu e-mail', `Olá, <b>${escape(name)}</b>! Falta pouco: confirme seu e-mail para proteger sua conta.`, {
      label: 'Confirmar e-mail',
      url: link,
    }),
    link,
  );
}

export function sendPasswordResetEmail(to: string, name: string, token: string) {
  const link = `${config.WEB_URL.replace(/\/$/, '')}/#/reset?token=${encodeURIComponent(token)}`;
  return send(
    to,
    'Redefinição de senha do Além-Mar',
    `Olá, ${name}! Para redefinir sua senha acesse: ${link} (válido por 1 hora). Se não foi você, ignore este e-mail.`,
    layout(
      'Redefinir senha',
      `Olá, <b>${escape(name)}</b>! Recebemos um pedido para redefinir sua senha. O link vale por 1 hora. Se não foi você, pode ignorar este e-mail com segurança.`,
      { label: 'Redefinir senha', url: link },
    ),
    link,
  );
}
