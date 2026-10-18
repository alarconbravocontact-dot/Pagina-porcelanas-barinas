/** Construye un enlace wa.me con mensaje prellenado. Devuelve null si no hay número configurado. */
export function whatsappLink(number: string | null | undefined, message: string): string | null {
  if (!number || !/^\d{8,15}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
