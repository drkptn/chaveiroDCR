-- Busca textual eficiente em mensagens e usuários (substring, qualquer idioma)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Message_content_trgm_idx" ON "Message" USING GIN ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_username_trgm_idx" ON "User" USING GIN ("username" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_displayName_trgm_idx" ON "User" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Guild_name_trgm_idx" ON "Guild" USING GIN ("name" gin_trgm_ops);
