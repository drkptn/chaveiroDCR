-- Suspensão de contas pelo criador do servidor
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
