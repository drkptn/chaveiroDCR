-- CreateEnum
CREATE TYPE "UserStatusPref" AS ENUM ('online', 'idle', 'dnd', 'invisible');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('FRIEND', 'INCOMING', 'OUTGOING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TEXT', 'VOICE', 'VIDEO', 'CATEGORY', 'DM', 'GROUP_DM');

-- CreateEnum
CREATE TYPE "OverwriteType" AS ENUM ('ROLE', 'MEMBER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('DEFAULT', 'REPLY', 'MEMBER_JOIN', 'CALL', 'PIN', 'GROUP_ADD', 'GROUP_REMOVE', 'GROUP_NAME', 'EVENT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" VARCHAR(20) NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(32) NOT NULL,
    "displayName" VARCHAR(32) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarKey" TEXT,
    "bannerKey" TEXT,
    "bannerColor" VARCHAR(7),
    "accentColor" VARCHAR(7),
    "bio" VARCHAR(300) NOT NULL DEFAULT '',
    "pronouns" VARCHAR(40) NOT NULL DEFAULT '',
    "links" JSONB NOT NULL DEFAULT '[]',
    "status" "UserStatusPref" NOT NULL DEFAULT 'online',
    "customStatus" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usernameChangedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" VARCHAR(100) NOT NULL DEFAULT 'Desconhecido',
    "platform" VARCHAR(40) NOT NULL DEFAULT 'web',
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "type" "TokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "userId" VARCHAR(20) NOT NULL,
    "targetId" VARCHAR(20) NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("userId","targetId")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "iconKey" TEXT,
    "bannerKey" TEXT,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "ownerId" VARCHAR(20) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "systemChannelId" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "guildId" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "nick" VARCHAR(32),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeoutUntil" TIMESTAMP(3),
    "mute" BOOLEAN NOT NULL DEFAULT false,
    "deaf" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" VARCHAR(20) NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7),
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRole" (
    "guildId" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "roleId" VARCHAR(20) NOT NULL,

    CONSTRAINT "MemberRole_pkey" PRIMARY KEY ("guildId","userId","roleId")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" VARCHAR(20) NOT NULL,
    "type" "ChannelType" NOT NULL,
    "guildId" VARCHAR(20),
    "name" VARCHAR(100) NOT NULL DEFAULT '',
    "topic" VARCHAR(1024) NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "parentId" VARCHAR(20),
    "slowmode" INTEGER NOT NULL DEFAULT 0,
    "userLimit" INTEGER NOT NULL DEFAULT 0,
    "bitrate" INTEGER NOT NULL DEFAULT 64000,
    "lastMessageId" VARCHAR(20),
    "ownerId" VARCHAR(20),
    "iconKey" TEXT,
    "dmKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRecipient" (
    "channelId" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelRecipient_pkey" PRIMARY KEY ("channelId","userId")
);

-- CreateTable
CREATE TABLE "PermissionOverwrite" (
    "channelId" VARCHAR(20) NOT NULL,
    "targetId" VARCHAR(20) NOT NULL,
    "type" "OverwriteType" NOT NULL,
    "allow" BIGINT NOT NULL DEFAULT 0,
    "deny" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "PermissionOverwrite_pkey" PRIMARY KEY ("channelId","targetId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" VARCHAR(20) NOT NULL,
    "channelId" VARCHAR(20) NOT NULL,
    "authorId" VARCHAR(20) NOT NULL,
    "content" VARCHAR(4000) NOT NULL DEFAULT '',
    "type" "MessageType" NOT NULL DEFAULT 'DEFAULT',
    "replyToId" VARCHAR(20),
    "editedAt" TIMESTAMP(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "mentionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mentionRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mentionEveryone" BOOLEAN NOT NULL DEFAULT false,
    "stickerId" VARCHAR(20),
    "callData" JSONB,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "hasLink" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" VARCHAR(20) NOT NULL,
    "messageId" VARCHAR(20),
    "uploaderId" VARCHAR(20) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(127) NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "spoiler" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "messageId" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "emojiKey" VARCHAR(64) NOT NULL,
    "emojiName" VARCHAR(64) NOT NULL,
    "emojiId" VARCHAR(20),
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("messageId","userId","emojiKey")
);

-- CreateTable
CREATE TABLE "ReadState" (
    "userId" VARCHAR(20) NOT NULL,
    "channelId" VARCHAR(20) NOT NULL,
    "lastReadId" VARCHAR(20),
    "mentions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReadState_pkey" PRIMARY KEY ("userId","channelId")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "userId" VARCHAR(20) NOT NULL,
    "scopeId" VARCHAR(20) NOT NULL,
    "level" VARCHAR(16),
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "suppressEveryone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("userId","scopeId")
);

-- CreateTable
CREATE TABLE "Invite" (
    "code" VARCHAR(16) NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "channelId" VARCHAR(20),
    "inviterId" VARCHAR(20),
    "maxUses" INTEGER NOT NULL DEFAULT 0,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Ban" (
    "guildId" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(512),
    "moderatorId" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ban_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "Emoji" (
    "id" VARCHAR(20) NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "imageKey" TEXT NOT NULL,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "creatorId" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Emoji_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" VARCHAR(20) NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "description" VARCHAR(100) NOT NULL DEFAULT '',
    "imageKey" TEXT NOT NULL,
    "format" VARCHAR(8) NOT NULL,
    "creatorId" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledEvent" (
    "id" VARCHAR(20) NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "channelId" VARCHAR(20),
    "creatorId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL DEFAULT '',
    "location" VARCHAR(100) NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "coverKey" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "eventId" VARCHAR(20) NOT NULL,
    "userId" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" VARCHAR(20) NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "actorId" VARCHAR(20),
    "action" VARCHAR(48) NOT NULL,
    "targetId" VARCHAR(20),
    "reason" VARCHAR(512),
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" VARCHAR(20) NOT NULL,
    "reporterId" VARCHAR(20) NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" VARCHAR(20) NOT NULL,
    "guildId" VARCHAR(20),
    "reason" VARCHAR(48) NOT NULL,
    "details" VARCHAR(1000) NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "userId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("userId","name")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_type_idx" ON "EmailToken"("userId", "type");

-- CreateIndex
CREATE INDEX "Relationship_targetId_idx" ON "Relationship"("targetId");

-- CreateIndex
CREATE INDEX "Guild_isPublic_idx" ON "Guild"("isPublic");

-- CreateIndex
CREATE INDEX "Member_userId_idx" ON "Member"("userId");

-- CreateIndex
CREATE INDEX "Role_guildId_idx" ON "Role"("guildId");

-- CreateIndex
CREATE INDEX "MemberRole_roleId_idx" ON "MemberRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_dmKey_key" ON "Channel"("dmKey");

-- CreateIndex
CREATE INDEX "Channel_guildId_idx" ON "Channel"("guildId");

-- CreateIndex
CREATE INDEX "ChannelRecipient_userId_idx" ON "ChannelRecipient"("userId");

-- CreateIndex
CREATE INDEX "Message_channelId_id_idx" ON "Message"("channelId", "id" DESC);

-- CreateIndex
CREATE INDEX "Message_authorId_idx" ON "Message"("authorId");

-- CreateIndex
CREATE INDEX "Message_channelId_pinned_idx" ON "Message"("channelId", "pinned");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Attachment_uploaderId_messageId_idx" ON "Attachment"("uploaderId", "messageId");

-- CreateIndex
CREATE INDEX "Reaction_messageId_idx" ON "Reaction"("messageId");

-- CreateIndex
CREATE INDEX "Invite_guildId_idx" ON "Invite"("guildId");

-- CreateIndex
CREATE INDEX "Emoji_guildId_idx" ON "Emoji"("guildId");

-- CreateIndex
CREATE INDEX "Sticker_guildId_idx" ON "Sticker"("guildId");

-- CreateIndex
CREATE INDEX "ScheduledEvent_guildId_startAt_idx" ON "ScheduledEvent"("guildId", "startAt");

-- CreateIndex
CREATE INDEX "ScheduledEvent_status_startAt_idx" ON "ScheduledEvent"("status", "startAt");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_id_idx" ON "AuditLog"("guildId", "id" DESC);

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_lastSeenAt_idx" ON "ActivityLog"("userId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_guildId_userId_fkey" FOREIGN KEY ("guildId", "userId") REFERENCES "Member"("guildId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRecipient" ADD CONSTRAINT "ChannelRecipient_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRecipient" ADD CONSTRAINT "ChannelRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionOverwrite" ADD CONSTRAINT "PermissionOverwrite_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ban" ADD CONSTRAINT "Ban_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emoji" ADD CONSTRAINT "Emoji_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEvent" ADD CONSTRAINT "ScheduledEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ScheduledEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
