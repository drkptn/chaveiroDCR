-- Selos especiais de usuário (ex.: criador do app), concedidos pelo operador do servidor
ALTER TABLE "User" ADD COLUMN "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
