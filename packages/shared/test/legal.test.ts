import { describe, expect, it } from 'vitest';
import { legalDocuments } from '../src';

const base = { storeName: 'Porcelanatos Barinas', city: 'Barinas', hoursText: 'Lunes a viernes, de 8:00 a. m. a 5:00 p. m.', contact: 'ventas@example.com', customerSessionDays: 180, staffSessionHours: 168 };
const text = (docs: ReturnType<typeof legalDocuments>, id: string) => JSON.stringify(docs.find((d) => d.id === id));

describe('textos legales predeterminados', () => {
  it('incluye términos, privacidad, cookies y uso de IA con los datos de la tienda', () => {
    const docs = legalDocuments({ ...base, assistantProvider: 'local' });
    expect(docs.map((d) => d.id)).toEqual(['terminos', 'privacidad', 'cookies', 'asistente']);
    expect(text(docs, 'terminos')).toContain('Porcelanatos Barinas, con sede en Barinas');
    expect(text(docs, 'terminos')).toContain('Lunes a viernes, de 8:00 a. m. a 5:00 p. m');
    expect(text(docs, 'privacidad')).toContain('ventas@example.com');
  });

  it('enumera las cookies reales del portal y sus duraciones', () => {
    const cookies = text(legalDocuments({ ...base, assistantProvider: 'local' }), 'cookies');
    for (const name of ['sid', 'csrf_token', 'cart_token', 'porcelanas.tour', 'porcelanas.assistant']) expect(cookies).toContain(name);
    expect(cookies).toContain('hasta 180 días para clientes y 7 días para el personal');
    expect(cookies).toContain('No usamos cookies de analítica, publicidad ni rastreo de terceros');
  });

  it('el texto del asistente cambia según se use Claude o el motor integrado', () => {
    const local = legalDocuments({ ...base, assistantProvider: 'local' });
    const claude = legalDocuments({ ...base, assistantProvider: 'claude' });
    expect(text(local, 'asistente')).toContain('ni se envían a terceros');
    expect(text(local, 'asistente')).not.toContain('Anthropic');
    expect(text(claude, 'asistente')).toContain('Claude, de Anthropic');
    expect(text(claude, 'privacidad')).toContain('Anthropic');
  });
});
