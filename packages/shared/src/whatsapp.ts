/** Construye un enlace wa.me con mensaje prellenado. Devuelve null si no hay número válido. */
export function whatsappLink(number: string | null | undefined, message: string): string | null {
  if (!number || !/^\d{8,15}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Convierte un teléfono venezolano a formato internacional para WhatsApp:
 * "0412-555 2594" -> "584125552594"; "+58 412 5552594" -> "584125552594".
 */
export function toWhatsappNumber(phone: string, countryCode = '58'): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  let n = digits;
  if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = countryCode + n.slice(1);
  else if (!n.startsWith(countryCode) && n.length === 10) n = countryCode + n;
  return /^\d{10,15}$/.test(n) ? n : null;
}

/** Formato legible: 584125552594 -> "+58 412-5552594". */
export function formatInternationalPhone(whatsapp: string): string {
  const m = whatsapp.match(/^58(\d{3})(\d{7})$/);
  return m ? `+58 ${m[1]}-${m[2]}` : `+${whatsapp}`;
}
