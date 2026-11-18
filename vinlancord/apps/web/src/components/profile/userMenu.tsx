/** Menu de contexto de usuário: perfil, mensagem, chamada, amizade, volume e moderação. */
import { User, MessageSquare, Phone, UserPlus, UserMinus, Ban, Copy, Flag, Volume2, VolumeX, MicOff, HeadphoneOff, PhoneOff, Clock, Shield, LogOut, Gavel, ArrowRightLeft } from 'lucide-react';
import { P, has, computeBasePermissions, highestRolePosition, type Role } from '@vinlancord/shared';
import { S, displayName } from '../../store';
import { ui, type MenuItem } from '../../store/ui';
import { addFriend, openDM, startCall } from '../../store/actions';
import { api } from '../../lib/api';
import { gateway } from '../../lib/gateway';
import { voice, useVoice } from '../../lib/voice/engine';
import { local } from '../../store/local';
import { Slider } from '../ui';

function VolumeControl({ userId }: { userId: string }) {
  const v = local().userVolumes[userId] ?? 1;
  return (
    <div className="w-56">
      <div className="mb-1 text-xs font-semibold text-fg-1">Volume do usuário</div>
      <Slider value={Math.round(v * 100)} min={0} max={200} step={5} onChange={(x) => voice.setUserVolume(userId, x / 100)} format={(x) => `${x}%`} />
    </div>
  );
}

export function userMenu(e: React.MouseEvent | { clientX: number; clientY: number; preventDefault?: () => void }, userId: string, guildId: string | null) {
  const s = S();
  const me = s.me!;
  const self = userId === me.id;
  const rel = s.relationships[userId]?.type;
  const inMyCall = useVoice.getState().channelId && s.voiceStates[userId]?.channelId === useVoice.getState().channelId && !self;
  const items: MenuItem[] = [
    { label: 'Perfil', icon: <User size={15} />, onClick: () => ui.open({ type: 'profile', userId, guildId }) },
  ];
  if (!self) {
    items.push(
      { label: 'Enviar mensagem', icon: <MessageSquare size={15} />, onClick: () => void openDM(userId).catch((er) => ui.error(er)) },
      { label: 'Ligar', icon: <Phone size={15} />, onClick: () => void startCall(userId).catch((er) => ui.error(er)) },
    );
  }
  if (inMyCall) {
    const lm = !!local().localMutes[userId];
    items.push(
      { separator: true },
      { render: <VolumeControl userId={userId} /> },
      { label: lm ? 'Reativar áudio dessa pessoa' : 'Silenciar para mim', icon: lm ? <Volume2 size={15} /> : <VolumeX size={15} />, onClick: () => voice.setLocalMute(userId, !lm) },
    );
  }

  // moderação no servidor
  if (guildId && !self) {
    const g = s.guilds[guildId];
    const myMember = s.myMembers[guildId];
    const target = s.members[guildId]?.[userId];
    if (g && myMember && target) {
      const roles = Object.values(s.roles[guildId] ?? {}) as Role[];
      const perms = computeBasePermissions({ guildId, ownerId: g.ownerId, userId: me.id, roles, memberRoleIds: myMember.roles });
      const above =
        g.ownerId === me.id ||
        (userId !== g.ownerId &&
          highestRolePosition({ roles, memberRoleIds: myMember.roles, ownerId: g.ownerId, userId: me.id }) >
            highestRolePosition({ roles, memberRoleIds: target.roles, ownerId: g.ownerId, userId }));
      const name = displayName(userId, guildId);
      const mod: MenuItem[] = [];
      const vs = s.voiceStates[userId];
      if (vs && vs.guildId === guildId && above) {
        if (has(perms, P.MUTE_MEMBERS))
          mod.push({ label: target.mute ? 'Remover silêncio do servidor' : 'Silenciar no servidor', icon: <MicOff size={15} />, onClick: () => void api.patch(`/guilds/${guildId}/members/${userId}`, { mute: !target.mute }).catch((er) => ui.error(er)) });
        if (has(perms, P.DEAFEN_MEMBERS))
          mod.push({ label: target.deaf ? 'Remover ensurdecimento' : 'Ensurdecer no servidor', icon: <HeadphoneOff size={15} />, onClick: () => void api.patch(`/guilds/${guildId}/members/${userId}`, { deaf: !target.deaf }).catch((er) => ui.error(er)) });
        if (has(perms, P.MOVE_MEMBERS)) {
          mod.push({ label: 'Desconectar da voz', icon: <PhoneOff size={15} />, onClick: () => void gateway.rpc('voice.moderate', { userId, disconnect: true }).catch((er) => ui.error(er)) });
          const voiceChannels = Object.values(s.channels).filter((c) => c.guildId === guildId && (c.type === 'voice' || c.type === 'video') && c.id !== vs.channelId);
          if (voiceChannels.length)
            mod.push({
              label: 'Mover para',
              icon: <ArrowRightLeft size={15} />,
              submenu: voiceChannels.map((c) => ({ label: c.name, onClick: () => void gateway.rpc('voice.moderate', { userId, moveTo: c.id }).catch((er) => ui.error(er)) })),
            });
        }
      }
      if (has(perms, P.MANAGE_ROLES) && above) {
        const myTop = highestRolePosition({ roles, memberRoleIds: myMember.roles, ownerId: g.ownerId, userId: me.id });
        const assignable = roles.filter((r) => r.id !== guildId && r.position < myTop).sort((a, b) => b.position - a.position);
        if (assignable.length)
          mod.push({
            label: 'Cargos',
            icon: <Shield size={15} />,
            submenu: assignable.map((r) => ({
              label: r.name,
              checked: target.roles.includes(r.id),
              onClick: () => {
                const next = target.roles.includes(r.id) ? target.roles.filter((x) => x !== r.id) : [...target.roles, r.id];
                void api.patch(`/guilds/${guildId}/members/${userId}`, { roles: next }).catch((er) => ui.error(er));
              },
            })),
          });
      }
      if (has(perms, P.MODERATE_MEMBERS) && above) {
        const timedOut = !!target.timeoutUntil && new Date(target.timeoutUntil).getTime() > Date.now();
        mod.push(
          timedOut
            ? { label: 'Remover castigo', icon: <Clock size={15} />, onClick: () => void api.patch(`/guilds/${guildId}/members/${userId}`, { timeoutUntil: null }).catch((er) => ui.error(er)) }
            : {
                label: `Castigar ${name}`,
                icon: <Clock size={15} />,
                danger: true,
                submenu: [
                  ['60 segundos', 60],
                  ['5 minutos', 300],
                  ['10 minutos', 600],
                  ['1 hora', 3600],
                  ['1 dia', 86400],
                  ['1 semana', 604800],
                ].map(([label, secs]) => ({
                  label: label as string,
                  onClick: () =>
                    void api
                      .patch(`/guilds/${guildId}/members/${userId}`, { timeoutUntil: new Date(Date.now() + (secs as number) * 1000).toISOString() })
                      .then(() => ui.success(`${name} está de castigo por ${label}.`))
                      .catch((er) => ui.error(er)),
                })),
              },
        );
      }
      if (has(perms, P.KICK_MEMBERS) && above)
        mod.push({
          label: `Expulsar ${name}`,
          icon: <LogOut size={15} />,
          danger: true,
          onClick: () =>
            ui.confirm({
              title: `Expulsar ${name}?`,
              body: 'A pessoa poderá voltar com um novo convite.',
              confirmLabel: 'Expulsar',
              danger: true,
              onConfirm: async () => void (await api.del(`/guilds/${guildId}/members/${userId}`)),
            }),
        });
      if (has(perms, P.BAN_MEMBERS) && above)
        mod.push({
          label: `Banir ${name}`,
          icon: <Gavel size={15} />,
          danger: true,
          onClick: () =>
            ui.confirm({
              title: `Banir ${name}?`,
              body: 'A pessoa será removida e não poderá voltar. As mensagens das últimas 24 horas também serão apagadas.',
              confirmLabel: 'Banir',
              danger: true,
              onConfirm: async () => void (await api.put(`/guilds/${guildId}/bans/${userId}`, { deleteMessageHours: 24 })),
            }),
        });
      if (mod.length) items.push({ separator: true }, ...mod);
    }
  }

  if (!self) {
    items.push({ separator: true });
    if (rel === 'friend')
      items.push({
        label: 'Desfazer amizade',
        icon: <UserMinus size={15} />,
        danger: true,
        onClick: () => ui.confirm({ title: 'Desfazer amizade?', body: `Você e ${displayName(userId, null)} deixarão de ser amigos.`, confirmLabel: 'Desfazer', danger: true, onConfirm: async () => void (await api.del(`/relationships/${userId}`)) }),
      });
    else if (rel === 'incoming') items.push({ label: 'Aceitar pedido de amizade', icon: <UserPlus size={15} />, onClick: () => void api.put(`/relationships/${userId}`).catch((er) => ui.error(er)) });
    else if (rel !== 'outgoing' && rel !== 'blocked')
      items.push({ label: 'Adicionar amigo', icon: <UserPlus size={15} />, onClick: () => void addFriend(userId).then(() => ui.success('Pedido enviado!')).catch((er) => ui.error(er)) });
    items.push(
      rel === 'blocked'
        ? { label: 'Desbloquear', icon: <Ban size={15} />, onClick: () => void api.del(`/relationships/${userId}`) }
        : {
            label: 'Bloquear',
            icon: <Ban size={15} />,
            danger: true,
            onClick: () =>
              ui.confirm({
                title: `Bloquear ${displayName(userId, null)}?`,
                body: 'Vocês não poderão trocar mensagens diretas nem se ligar, e a amizade será desfeita.',
                confirmLabel: 'Bloquear',
                danger: true,
                onConfirm: async () => void (await api.put(`/relationships/${userId}/block`)),
              }),
          },
      { label: 'Denunciar', icon: <Flag size={15} />, danger: true, onClick: () => ui.open({ type: 'report', targetType: 'user', targetId: userId, label: displayName(userId, null) }) },
    );
  }
  items.push({ separator: true }, { label: 'Copiar ID de usuário', icon: <Copy size={15} />, onClick: () => void navigator.clipboard.writeText(userId) });
  ui.menu(e, items);
}

// clique direito em quem está na voz (barra lateral)
if (typeof window !== 'undefined') {
  window.addEventListener('vl:voice-user-menu', (ev) => {
    const { e, userId } = (ev as CustomEvent).detail as { e: React.MouseEvent; userId: string };
    const vs = S().voiceStates[userId];
    userMenu(e, userId, vs?.guildId ?? null);
  });
}
