/** Métodos RPC disponíveis pelo WebSocket (cliente → servidor). */
import { z, type ZodType } from 'zod';
import { P, type RpcMethod } from '@vinlancord/shared';
import { prisma, Prisma } from '../lib/db';
import { ApiError } from '../lib/errors';
import { startTyping } from '../services/typing';
import { parse, zId } from '../lib/validate';
import { requireChannelPerm } from '../services/perms';
import { refreshUserPresence, updateConnPresence } from '../services/presence';
import * as voice from '../voice/service';

export interface RpcContext {
  userId: string;
  sessionId: string;
  connId: string;
}

type Handler = (ctx: RpcContext, data: unknown) => Promise<unknown>;

const zActivity = z.object({
  type: z.enum(['playing', 'listening', 'watching', 'streaming', 'competing']),
  name: z.string().trim().min(1).max(128),
  details: z.string().max(128).nullable().optional(),
  state: z.string().max(128).nullable().optional(),
  startedAt: z.number().int().positive().nullable().optional(),
});
const zSource = z.enum(['mic', 'camera', 'screen', 'screen-audio']);
const zMsId = z.string().uuid();

function h<T>(schema: ZodType<T>, fn: (ctx: RpcContext, data: T) => Promise<unknown>): Handler {
  return (ctx, data) => fn(ctx, parse(schema, data));
}

export const rpcHandlers: Record<RpcMethod, Handler> = {
  'presence.update': h(
    z.object({
      status: z.enum(['online', 'idle', 'dnd', 'invisible']).optional(),
      activities: z.array(zActivity).max(5).optional(),
      afk: z.boolean().optional(),
      customStatus: z
        .object({ text: z.string().max(128).nullable(), emoji: z.string().max(64).nullable(), expiresAt: z.string().datetime().nullable() })
        .nullable()
        .optional(),
    }),
    async (ctx, d) => {
      if (d.status || d.customStatus !== undefined) {
        await prisma.user.update({
          where: { id: ctx.userId },
          data: {
            ...(d.status ? { status: d.status } : {}),
            ...(d.customStatus !== undefined ? { customStatus: d.customStatus === null ? Prisma.DbNull : d.customStatus } : {}),
          },
        });
        await refreshUserPresence(ctx.userId);
      }
      if (d.afk !== undefined || d.activities) await updateConnPresence(ctx.userId, ctx.connId, { afk: d.afk, activities: d.activities });
      return { ok: true };
    },
  ),

  'typing.start': h(z.object({ channelId: zId }), async (ctx, d) => {
    await requireChannelPerm(d.channelId, ctx.userId, P.SEND_MESSAGES);
    await startTyping(d.channelId, ctx.userId);
    return { ok: true };
  }),

  'voice.join': h(z.object({ channelId: zId, selfMute: z.boolean(), selfDeaf: z.boolean(), voiceSessionId: zMsId }), (ctx, d) =>
    voice.join(ctx.userId, ctx.connId, d),
  ),
  'voice.leave': h(z.object({}).passthrough(), async (ctx) => {
    await voice.leave(ctx.userId);
    return { ok: true };
  }),
  'voice.resume': h(z.object({ voiceSessionId: zMsId }), async (ctx, d) => voice.resume(ctx.userId, ctx.connId, d.voiceSessionId)),
  'voice.createTransport': h(z.object({ direction: z.enum(['send', 'recv']) }), (ctx, d) => voice.createTransport(ctx.userId, d.direction)),
  'voice.connectTransport': h(z.object({ transportId: z.string().uuid(), dtlsParameters: z.record(z.string(), z.unknown()) }), (ctx, d) =>
    voice.connectTransport(ctx.userId, d.transportId, d.dtlsParameters),
  ),
  'voice.restartIce': h(z.object({ transportId: z.string().uuid() }), (ctx, d) => voice.restartIce(ctx.userId, d.transportId)),
  'voice.produce': h(
    z.object({
      transportId: z.string().uuid(),
      kind: z.enum(['audio', 'video']),
      rtpParameters: z.record(z.string(), z.unknown()),
      source: zSource,
      paused: z.boolean().optional(),
    }),
    (ctx, d) => voice.produce(ctx.userId, d),
  ),
  'voice.closeProducer': h(z.object({ producerId: z.string().uuid() }), (ctx, d) => voice.closeProducer(ctx.userId, d.producerId)),
  'voice.setProducerPaused': h(z.object({ producerId: z.string().uuid(), paused: z.boolean() }), (ctx, d) =>
    voice.setProducerPaused(ctx.userId, d.producerId, d.paused),
  ),
  'voice.consume': h(z.object({ producerId: z.string().uuid(), rtpCapabilities: z.record(z.string(), z.unknown()) }), (ctx, d) =>
    voice.consume(ctx.userId, d.producerId, d.rtpCapabilities),
  ),
  'voice.resumeConsumer': h(z.object({ consumerId: z.string().uuid() }), (ctx, d) => voice.resumeConsumer(ctx.userId, d.consumerId)),
  'voice.pauseConsumer': h(z.object({ consumerId: z.string().uuid() }), (ctx, d) => voice.pauseConsumer(ctx.userId, d.consumerId)),
  'voice.closeConsumer': h(z.object({ consumerId: z.string().uuid() }), (ctx, d) => voice.closeConsumer(ctx.userId, d.consumerId)),
  'voice.setConsumerLayers': h(
    z.object({ consumerId: z.string().uuid(), spatialLayer: z.number().int().min(0).max(3), temporalLayer: z.number().int().min(0).max(3).optional() }),
    (ctx, d) => voice.setConsumerLayers(ctx.userId, d.consumerId, d.spatialLayer, d.temporalLayer),
  ),
  'voice.updateState': h(
    z.object({ selfMute: z.boolean().optional(), selfDeaf: z.boolean().optional(), selfVideo: z.boolean().optional(), selfStream: z.boolean().optional() }),
    (ctx, d) => voice.updateState(ctx.userId, d),
  ),
  'voice.stats': h(z.object({ rtt: z.number().min(0).max(100000), loss: z.number().min(0).max(100) }), async (ctx, d) =>
    voice.reportStats(ctx.userId, d.rtt, d.loss),
  ),
  'voice.moderate': h(
    z.object({ userId: zId, mute: z.boolean().optional(), deaf: z.boolean().optional(), disconnect: z.boolean().optional(), moveTo: zId.optional() }),
    (ctx, d) => voice.moderate(ctx.userId, d),
  ),
  'call.ring': h(z.object({ channelId: zId, userIds: z.array(zId).max(10).optional() }), (ctx, d) => voice.ring(ctx.userId, d.channelId, d.userIds)),
  'call.decline': h(z.object({ channelId: zId }), (ctx, d) => voice.decline(ctx.userId, d.channelId)),
};

export async function runRpc(ctx: RpcContext, method: string, data: unknown) {
  const fn = rpcHandlers[method as RpcMethod];
  if (!fn) throw new ApiError(400, 'UNKNOWN_METHOD', 'Método desconhecido.');
  return fn(ctx, data);
}
