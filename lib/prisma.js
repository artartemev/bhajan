// File: lib/prisma.ts
import { PrismaClient } from '@prisma/client'; // ✅ ВОЗВРАЩАЕМ СТАНДАРТНЫЙ ИМПОРТ
var prisma = global.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
export default prisma;
