import { MessageCircle } from 'lucide-react';
import { whatsappLink } from '@porcelanas/shared';
import { useSettings } from '../hooks/data';

/** Botón comercial de WhatsApp. No se muestra si el número no está configurado. */
export function WhatsAppButton({ message, variant = 'inline', label = 'Consultar por WhatsApp' }: { message?: string; variant?: 'inline' | 'floating'; label?: string }) {
  const { data } = useSettings();
  const link = whatsappLink(data?.whatsapp.number, message ?? data?.whatsapp.greeting ?? '');
  if (!link) return null;
  if (variant === 'floating') {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-stone-300 bg-white text-ink shadow-gallery transition hover:border-ink"
        aria-label={label}
      >
        <MessageCircle className="h-5 w-5" aria-hidden />
      </a>
    );
  }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="btn-outline">
      <MessageCircle className="h-4 w-4" aria-hidden /> {label}
    </a>
  );
}
