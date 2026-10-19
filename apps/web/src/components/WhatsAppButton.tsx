import { MessageCircle } from 'lucide-react';
import { whatsappLink } from '@porcelanas/shared';
import { useSettings } from '../hooks/data';

/**
 * Acceso directo a WhatsApp con mensaje prellenado. Usa el número del vendedor si se indica;
 * si no, el número comercial configurado. No se muestra si no hay número.
 */
export function WhatsAppButton({
  message,
  number,
  variant = 'inline',
  label = 'Consultar por WhatsApp',
}: {
  message?: string;
  number?: string | null;
  variant?: 'inline' | 'floating' | 'link';
  label?: string;
}) {
  const { data } = useSettings();
  const link = whatsappLink(number || data?.whatsapp.number, message ?? data?.whatsapp.greeting ?? '');
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
  if (variant === 'link') {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-ink-soft">
        <MessageCircle className="h-3.5 w-3.5" aria-hidden /> {label}
      </a>
    );
  }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="btn-outline" data-testid="whatsapp-link">
      <MessageCircle className="h-4 w-4" aria-hidden /> {label}
    </a>
  );
}
