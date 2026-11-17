import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { config } from '../config';

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL, max: 20 });
export const prisma = new PrismaClient({ adapter });
export type DB = typeof prisma;
export { Prisma } from '../generated/prisma/client';
