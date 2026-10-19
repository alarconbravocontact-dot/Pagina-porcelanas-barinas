/** Genera un enlace de activación de un solo uso para un usuario: npm run user:activation-link -- correo@dominio */
import { PrismaClient } from '@prisma/client';
import { createActivationToken } from '../src/services/tokens';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Uso: npm run user:activation-link -- correo@dominio');
  process.exit(1);
}
const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No existe un usuario con el correo ${email}`);
  process.exit(1);
}
const r = await createActivationToken(user.id, null);
const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173';
console.log(`Enlace de activación para ${r.email} (válido ${r.expiresInHours} h, un solo uso):\n${origin}${r.path}`);
await prisma.$disconnect();
