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
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1f8f4e] text-white shadow-lg transition hover:scale-105"
        aria-label={label}
      >
        <MessageCircle className="h-7 w-7" aria-hidden />
      </a>
    );
  }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="btn border border-[#1f8f4e] bg-white text-[#1f8f4e] hover:bg-[#eef8f1]">
      <MessageCircle className="h-4 w-4" aria-hidden /> {label}
    </a>
  );
}
