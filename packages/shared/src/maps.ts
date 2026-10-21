/**
 * Enlaces de Google Maps para la sede, sin clave de API. Si la administración pega un enlace de
 * Google Maps con coordenadas (…/@8.62,-70.21,17z o ?q=8.62,-70.21), se usan para ubicar el pin;
 * si no, se busca por la dirección escrita.
 */
export function storeMapLinks(store: { address?: string; city?: string; mapUrl?: string }) {
  const coords = store.mapUrl?.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) ?? store.mapUrl?.match(/[?&]q=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  const text = [store.address, store.city, store.address || store.city ? 'Venezuela' : ''].filter(Boolean).join(', ');
  const query = coords ? `${coords[1]},${coords[2]}` : text;
  if (!query) return null;
  const q = encodeURIComponent(query);
  return {
    query,
    /** Mapa para incrustar (se carga solo cuando el visitante lo pide). */
    embedUrl: `https://www.google.com/maps?q=${q}&output=embed`,
    /** Abre Google Maps (o la app) con la ruta hasta la sede. */
    directionsUrl: store.mapUrl && !coords ? store.mapUrl : `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}
