/** Configurações de canal: visão geral e permissões (sobrescritas por cargo/membro). */
import { useEffect, useState } from 'react';
import { Check, Minus, X, Plus, Trash2 } from 'lucide-react';
import { CHANNEL_SCOPED_PERMISSIONS, LIMITS, P, PERMISSION_INFO, type PermissionOverwrite } from '@vinlancord/shared';
import { useStore, displayName, EMPTY_OBJ } from '../../store';
import { ui } from '../../store/ui';
import { api } from '../../lib/api';
import { Button, Field, Input, Select, Slider, Textarea, cx } from '../ui';
import { SettingsLayout, SectionTitle, Card } from './SettingsLayout';

export default function ChannelSettings({ onClose, channelId, initialTab }: { onClose: () => void; channelId: string; initialTab?: string }) {
  const channel = useStore((s) => s.channels[channelId]);
  const [tab, setTab] = useState(initialTab ?? 'overview');
  useEffect(() => {
    if (!channel) onClose();
  }, [channel, onClose]);
  if (!channel) return null;
  return (
    <SettingsLayout
      tabs={[
        { id: 'overview', label: 'Visão geral', section: channel.type === 'category' ? channel.name : `#${channel.name}` },
        { id: 'perms', label: 'Permissões' },
        {
          id: 'delete',
          label: channel.type === 'category' ? 'Excluir categoria' : 'Excluir canal',
          danger: true,
          onClick: () => ui.confirm({ title: `Excluir ${channel.name}?`, body: 'Não dá para desfazer.', danger: true, confirmLabel: 'Excluir', onConfirm: async () => { await api.del(`/channels/${channelId}`); onClose(); } }),
        },
      ]}
      active={tab}
      onTab={setTab}
      onClose={onClose}
    >
      {tab === 'overview' && <Overview channelId={channelId} />}
      {tab === 'perms' && <Perms channelId={channelId} />}
    </SettingsLayout>
  );
}

function Overview({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId])!;
  const [form, setForm] = useState({ name: c.name, topic: c.topic, slowmode: c.slowmode, userLimit: c.userLimit });
  const isVoice = c.type === 'voice' || c.type === 'video';
  return (
    <>
      <SectionTitle>Visão geral</SectionTitle>
      <div className="space-y-4">
        <Field label="Nome"><Input value={form.name} maxLength={LIMITS.CHANNEL_NAME_MAX} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        {c.type === 'text' && (
          <>
            <Field label="Tópico" hint="Aparece no topo do canal. Aceita Markdown.">
              <Textarea rows={3} maxLength={LIMITS.CHANNEL_TOPIC_MAX} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </Field>
            <Field label="Modo lento" hint="Tempo mínimo entre mensagens de cada membro.">
              <Select
                value={String(form.slowmode)}
                onChange={(v) => setForm({ ...form, slowmode: Number(v) })}
                options={[0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => ({ value: String(s), label: s === 0 ? 'Desligado' : s < 60 ? `${s} segundos` : `${s / 60} minuto${s > 60 ? 's' : ''}` }))}
              />
            </Field>
          </>
        )}
        {isVoice && (
          <Field label="Limite de pessoas">
            <Slider value={form.userLimit} min={0} max={LIMITS.VOICE_USER_LIMIT_MAX} onChange={(v) => setForm({ ...form, userLimit: v })} format={(v) => (v ? String(v) : '∞')} />
          </Field>
        )}
        <Button onClick={() => void api.patch(`/channels/${channelId}`, form).then(() => ui.success('Canal salvo!')).catch((e) => ui.error(e))}>Salvar alterações</Button>
      </div>
    </>
  );
}

type Tri = 'allow' | 'deny' | 'inherit';

function Perms({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId])!;
  const guildId = c.guildId!;
  const roles = useStore((s) => s.roles[guildId] ?? EMPTY_OBJ);
  const members = useStore((s) => s.members[guildId] ?? EMPTY_OBJ);
  const [sel, setSel] = useState<string>(guildId);
  const [adding, setAdding] = useState('');
  const ow = c.overwrites.find((o) => o.id === sel);
  const [draft, setDraft] = useState<{ allow: bigint; deny: bigint }>({ allow: 0n, deny: 0n });
  useEffect(() => setDraft({ allow: BigInt(ow?.allow ?? '0'), deny: BigInt(ow?.deny ?? '0') }), [ow, sel]);
  const targets: { id: string; type: 'role' | 'member'; label: string; color?: string | null }[] = [
    { id: guildId, type: 'role', label: '@everyone' },
    ...c.overwrites.filter((o) => o.id !== guildId).map((o: PermissionOverwrite) => ({ id: o.id, type: o.type, label: o.type === 'role' ? roles[o.id]?.name ?? 'cargo' : displayName(o.id, guildId), color: o.type === 'role' ? roles[o.id]?.color : null })),
  ];
  const selType = targets.find((t) => t.id === sel)?.type ?? (roles[sel] ? 'role' : 'member');
  const state = (flag: bigint): Tri => (draft.allow & flag ? 'allow' : draft.deny & flag ? 'deny' : 'inherit');
  const setState = (flag: bigint, t: Tri) =>
    setDraft({ allow: t === 'allow' ? draft.allow | flag : draft.allow & ~flag, deny: t === 'deny' ? draft.deny | flag : draft.deny & ~flag });
  const relevant = PERMISSION_INFO.filter((p) => p.channel && (CHANNEL_SCOPED_PERMISSIONS & P[p.key]) !== 0n);
  return (
    <>
      <SectionTitle sub="Sobrescreva permissões dos cargos e membros apenas neste canal. Use ✕ em “Ver canais” no @everyone para torná-lo privado.">Permissões do canal</SectionTitle>
      <div className="flex gap-6">
        <div className="w-52 shrink-0">
          {targets.map((t) => (
            <button key={t.id} onClick={() => setSel(t.id)} className={cx('mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm', sel === t.id ? 'bg-bg-4 text-fg' : 'text-fg-1 hover:bg-bg-3')}>
              {t.type === 'role' && <span className="size-2.5 rounded-full" style={{ background: t.color ?? 'var(--vl-text-2)' }} />}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
          <div className="mt-3 flex gap-1">
            <Select
              value={adding}
              onChange={setAdding}
              className="h-8 text-xs"
              options={[
                { value: '', label: 'Adicionar…' },
                ...Object.values(roles).filter((r) => r.id !== guildId && !c.overwrites.some((o) => o.id === r.id)).map((r) => ({ value: r.id, label: `Cargo: ${r.name}` })),
                ...Object.keys(members).filter((id) => !c.overwrites.some((o) => o.id === id)).slice(0, 100).map((id) => ({ value: id, label: `Membro: ${displayName(id, guildId)}` })),
              ]}
            />
            <Button size="sm" disabled={!adding} onClick={() => (setSel(adding), setAdding(''))}><Plus size={14} /></Button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <Card>
            {relevant.map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
                <div>
                  <div className="text-sm font-medium text-fg">{p.label}</div>
                  <div className="text-xs text-fg-2">{p.description}</div>
                </div>
                <div className="flex overflow-hidden rounded-lg border border-line">
                  {(['deny', 'inherit', 'allow'] as Tri[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setState(P[p.key], t)}
                      className={cx(
                        'grid size-8 place-items-center transition',
                        state(P[p.key]) === t ? (t === 'allow' ? 'bg-success text-white' : t === 'deny' ? 'bg-danger text-white' : 'bg-bg-5 text-fg') : 'text-fg-2 hover:bg-bg-4',
                      )}
                      aria-label={{ allow: 'Permitir', deny: 'Negar', inherit: 'Herdar' }[t]}
                    >
                      {t === 'allow' ? <Check size={15} /> : t === 'deny' ? <X size={15} /> : <Minus size={15} />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
          <div className="flex gap-2">
            <Button onClick={() => void api.put(`/channels/${channelId}/permissions/${sel}`, { type: selType, allow: draft.allow.toString(), deny: draft.deny.toString() }).then(() => ui.success('Permissões salvas!')).catch((e) => ui.error(e))}>Salvar</Button>
            {ow && sel !== guildId && (
              <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void api.del(`/channels/${channelId}/permissions/${sel}`).then(() => setSel(guildId)).catch((e) => ui.error(e))}>Remover sobrescrita</Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
