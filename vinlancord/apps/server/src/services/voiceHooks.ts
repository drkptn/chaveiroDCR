/** Ganchos para o serviço de voz reagir a mudanças feitas via REST (evita dependências circulares). */
export const voiceHooks = {
  onMemberRemoved: async (_guildId: string, _userId: string): Promise<void> => {},
  onServerVoiceState: async (_guildId: string, _userId: string, _mute: boolean, _deaf: boolean): Promise<void> => {},
  onChannelDeleted: async (_channelId: string): Promise<void> => {},
  onPermissionsChanged: async (_guildId: string): Promise<void> => {},
  onTimeout: async (_guildId: string, _userId: string): Promise<void> => {},
};
