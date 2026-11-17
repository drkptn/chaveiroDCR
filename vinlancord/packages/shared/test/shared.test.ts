import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  P,
  SnowflakeGenerator,
  compareSnowflakes,
  computeBasePermissions,
  computeChannelPermissions,
  extractUserMentions,
  has,
  hasEveryoneMention,
  highestRolePosition,
  normalizeTextChannelName,
  snowflakeTimestamp,
} from '../src';

const G = '1000000000000000001';
const roles = [
  { id: G, permissions: DEFAULT_EVERYONE_PERMISSIONS, position: 0 },
  { id: '1000000000000000002', permissions: P.MANAGE_MESSAGES, position: 1 },
  { id: '1000000000000000003', permissions: P.ADMINISTRATOR, position: 2 },
];
const ctx = (memberRoleIds: string[], userId = 'u1', ownerId = 'owner') => ({ guildId: G, ownerId, userId, roles, memberRoleIds });

describe('permissões', () => {
  it('dono e administrador têm tudo', () => {
    expect(computeBasePermissions(ctx([], 'owner'))).toBe(ALL_PERMISSIONS);
    expect(computeBasePermissions(ctx(['1000000000000000003']))).toBe(ALL_PERMISSIONS);
  });
  it('soma cargos', () => {
    const p = computeBasePermissions(ctx(['1000000000000000002']));
    expect(has(p, P.MANAGE_MESSAGES)).toBe(true);
    expect(has(p, P.SEND_MESSAGES)).toBe(true);
    expect(has(p, P.BAN_MEMBERS)).toBe(false);
  });
  it('aplica sobrescritas na ordem: @everyone, cargos, membro', () => {
    const ow = [
      { id: G, type: 'role' as const, allow: 0n, deny: P.SEND_MESSAGES },
      { id: '1000000000000000002', type: 'role' as const, allow: P.SEND_MESSAGES, deny: 0n },
      { id: 'u1', type: 'member' as const, allow: 0n, deny: P.ADD_REACTIONS },
    ];
    expect(has(computeChannelPermissions(ctx([]), ow), P.SEND_MESSAGES)).toBe(false);
    const mod = computeChannelPermissions(ctx(['1000000000000000002']), ow);
    expect(has(mod, P.SEND_MESSAGES)).toBe(true);
    expect(has(mod, P.ADD_REACTIONS)).toBe(false);
  });
  it('sem VIEW_CHANNEL não tem nada; sem SEND perde anexos', () => {
    const hidden = computeChannelPermissions(ctx([]), [{ id: G, type: 'role', allow: 0n, deny: P.VIEW_CHANNEL }]);
    expect(hidden).toBe(0n);
    const ro = computeChannelPermissions(ctx([]), [{ id: G, type: 'role', allow: 0n, deny: P.SEND_MESSAGES }]);
    expect(has(ro, P.ATTACH_FILES)).toBe(false);
  });
  it('castigo deixa só leitura; sem CONNECT perde voz', () => {
    const t = computeChannelPermissions({ ...ctx([]), timeoutUntil: new Date(Date.now() + 60_000) }, []);
    expect(has(t, P.VIEW_CHANNEL)).toBe(true);
    expect(has(t, P.SEND_MESSAGES)).toBe(false);
    const v = computeChannelPermissions(ctx([]), [{ id: G, type: 'role', allow: 0n, deny: P.CONNECT }], { voice: true });
    expect(has(v, P.SPEAK)).toBe(false);
  });
  it('hierarquia', () => {
    expect(highestRolePosition(ctx(['1000000000000000002']))).toBe(1);
    expect(highestRolePosition(ctx([], 'owner'))).toBe(Infinity);
  });
});

describe('snowflake', () => {
  it('é crescente, com 19 dígitos e decodifica o tempo', () => {
    const g = new SnowflakeGenerator(3);
    const ids = Array.from({ length: 5000 }, () => g.next());
    expect(new Set(ids).size).toBe(5000);
    expect(ids.every((id) => id.length === 19)).toBe(true);
    for (let i = 1; i < ids.length; i++) expect(compareSnowflakes(ids[i - 1]!, ids[i]!)).toBeLessThan(0);
    expect(Math.abs(snowflakeTimestamp(ids[0]!) - Date.now())).toBeLessThan(2000);
  });
});

describe('texto', () => {
  it('menções e @everyone fora de código', () => {
    expect(extractUserMentions('oi <@1175218050102722560> e <@1175218050102722560>')).toEqual(['1175218050102722560']);
    expect(hasEveryoneMention('bora @everyone!')).toBe(true);
    expect(hasEveryoneMention('`@everyone`')).toBe(false);
    expect(hasEveryoneMention('email@everyone.com')).toBe(false);
  });
  it('normaliza nomes de canal', () => {
    expect(normalizeTextChannelName('  Bate Papo  Geral!! ')).toBe('bate-papo-geral');
    expect(normalizeTextChannelName('Dúvidas')).toBe('dúvidas');
  });
});
