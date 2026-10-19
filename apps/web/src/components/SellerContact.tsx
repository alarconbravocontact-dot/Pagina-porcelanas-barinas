import { Mail, MapPin, Phone } from 'lucide-react';
import { formatInternationalPhone } from '@porcelanas/shared';
import type { SellerContact } from '../lib/types';
import { WhatsAppButton } from './WhatsAppButton';

/** Ficha de contacto comercial de un vendedor (solo datos que el vendedor publica). */
export function SellerContactCard({
  seller,
  message,
  title = 'Tu vendedor',
  compact = false,
}: {
  seller: { displayName: string } & SellerContact;
  message?: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'border border-stone-200 bg-white p-6'}>
      {!compact && <p className="eyebrow">{title}</p>}
      <p className={`font-display font-light ${compact ? 'text-xl' : 'mt-2 text-2xl'}`}>{seller.displayName}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
        {(seller.branch || seller.city) && (
          <li className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            {seller.branch || seller.city}
          </li>
        )}
        {seller.whatsapp && (
          <li className="flex gap-2">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <a href={`tel:+${seller.whatsapp}`} className="hover:underline">
              {formatInternationalPhone(seller.whatsapp)}
            </a>
          </li>
        )}
        {seller.publicEmail && (
          <li className="flex gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <a href={`mailto:${seller.publicEmail}`} className="break-all hover:underline">
              {seller.publicEmail}
            </a>
          </li>
        )}
      </ul>
      {seller.whatsapp && (
        <div className="mt-4">
          <WhatsAppButton number={seller.whatsapp} message={message} label={`WhatsApp de ${seller.displayName.split(' ')[0]}`} />
        </div>
      )}
    </div>
  );
}
