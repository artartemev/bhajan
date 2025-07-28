// File: lib/prisma.ts

import { PrismaClient } from '@prisma/client';

// Это трюк, чтобы предотвратить создание множества экземпляров PrismaClient в режиме разработки
declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
