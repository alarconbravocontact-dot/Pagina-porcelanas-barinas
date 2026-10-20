/**
 * Recorridos guiados por ventana. Cada paso señala una zona de la pantalla:
 * - `target`: selectores CSS probados en orden (dentro del contenido principal);
 *   el prefijo `h:` busca un título (h1/h2/legend) con ese texto y resalta su tarjeta.
 * - Sin `target`, el paso se muestra centrado (introducción o cierre).
 * Los pasos cuyo destino no está visible (sin datos, vista móvil) se omiten.
 */
export interface TourStep {
  target?: string[];
  title: string;
  body: string;
}

export interface Tour {
  id: string;
  /** Nombre de la ventana, visible en la tarjeta. */
  window: string;
  match: RegExp;
  /** Solo para clientes con sesión (`customer`) o para el resto de visitantes (`guest`). */
  audience?: 'customer' | 'guest';
  steps: TourStep[];
  /** Mensaje cuando ningún paso tiene contenido visible (por ejemplo, sin datos aún). */
  empty?: string;
}

const STAFF_NAV = ['nav[aria-label="Vendedor"]', 'nav[aria-label="Administración"]'];

export const TOURS: Tour[] = [
  {
    id: 'portal',
    window: 'Mi portal',
    match: /^\/$/,
    audience: 'customer',
    steps: [
      { title: 'Bienvenido a tu portal', body: 'Este es tu espacio personal de compra. Te muestro en pocos pasos dónde está cada cosa; sal cuando quieras con Esc.' },
      { target: ['[data-tour="portal-tiles"]'], title: 'Accesos rápidos', body: 'Catálogo, tu carrito, tus compras y los mensajes con tu vendedor, siempre a un toque.' },
      { target: ['[data-tour="portal-orders"]'], title: 'Órdenes en curso', body: 'Cada orden muestra su estado de pago y de entrega y en qué paso va. Toca una para adjuntar tu comprobante o ver el detalle.' },
      { target: ['[data-tour="portal-seller"]'], title: 'Tu vendedor', body: 'Quien te atiende en la sede de Barinas. Escríbele por WhatsApp para coordinar tu visita.' },
      { target: ['[data-tour="portal-reorder"]'], title: 'Volver a comprar', body: 'Las piezas que ya compraste, con el precio y la disponibilidad de hoy.' },
      { target: ['[data-tour="assistant"]'], title: 'Asistente virtual', body: 'Pregúntale por piezas, cuántas cajas necesitas, el horario, los pagos o el estado de tu orden.' },
    ],
  },
  {
    id: 'inicio',
    window: 'Inicio',
    match: /^\/$/,
    audience: 'guest',
    steps: [
      { title: 'Bienvenido a la galería', body: 'Este recorrido te muestra en pocos pasos cómo está organizada la página de inicio. Puedes salir cuando quieras con Esc.' },
      { target: ['[data-tour="home-hero"]'], title: 'Portada', body: 'Desde aquí puedes buscar un porcelanato por nombre o SKU, o ir directo al catálogo.' },
      { target: ['nav[aria-label="Principal"]', 'button[aria-label="Menú"]'], title: 'Menú principal', body: 'Catálogo, Cómo comprar, Contacto y Políticas están siempre disponibles en la parte superior.' },
      { target: ['section[aria-labelledby="ambientes"]'], title: 'Ambientes', body: 'Explora las piezas según el espacio donde las vas a instalar, por ejemplo baño, cocina o sala.' },
      { target: ['section[aria-labelledby="calculadora"]'], title: 'Calculadora de cajas', body: 'Indica los m² de tu espacio y te decimos cuántas cajas necesitas, con el precio en dólares y en bolívares a la tasa BCV.' },
      { target: ['section[aria-labelledby="proceso"]'], title: 'Cómo funciona', body: 'Eliges, registras tu orden, pagas con el método que prefieras y retiras en la sede de Barinas.' },
      { target: ['section[aria-labelledby="vendedor"]'], title: 'Tu vendedor', body: 'Cada compra la atiende un vendedor. Aquí ves sus datos y puedes escribirle por WhatsApp.' },
      { target: ['header a[href="/carrito"]'], title: 'Carrito', body: 'Los productos que agregues quedan guardados aquí aunque cierres la página.' },
      { target: ['[data-tour="assistant"]'], title: 'Asistente virtual', body: 'Pregúntale por piezas, cuántas cajas necesitas, el horario, los pagos o el estado de tu orden. Responde con los datos de la tienda.' },
      { target: ['[data-tour="whatsapp-floating"]'], title: 'WhatsApp siempre a mano', body: 'Este botón abre una conversación con el número comercial desde cualquier ventana.' },
    ],
  },
  {
    id: 'catalogo',
    window: 'Catálogo',
    match: /^\/catalogo$/,
    steps: [
      { target: ['aside[aria-label="Filtros"]', '[data-tour="catalog-filters-toggle"]'], title: 'Filtros', body: 'Filtra por ambiente, color, tamaño, acabado, uso recomendado, agarre y rango de precio. Puedes combinar varios.' },
      { target: ['#sort'], title: 'Ordenar', body: 'Ordena por novedad, precio o nombre.' },
      { target: ['[data-tour="catalog-grid"]'], title: 'Piezas', body: 'Cada tarjeta muestra precio por m² y por caja y la disponibilidad. Toca una para ver su ficha completa.' },
      { target: ['main [data-testid="whatsapp-link"]'], title: 'Asesoría', body: '¿Dudas sobre qué pieza elegir? Escríbenos por WhatsApp desde aquí.' },
    ],
  },
  {
    id: 'producto',
    window: 'Ficha del producto',
    match: /^\/producto\/[^/]+$/,
    steps: [
      { target: ['[data-tour="product-image"]'], title: 'Fotografías', body: 'Mira la pieza en detalle; si hay varias fotos, cámbialas con las miniaturas.' },
      { target: ['[data-tour="product-price"]'], title: 'Precio', body: 'Precio en divisas por m² y por caja. Si pagas en bolívares se aplica el precio BCV indicado debajo.' },
      { target: ['[data-tour="product-calculator"]'], title: 'Calcula y agrega', body: 'Escribe los m² o las cajas que necesitas. La calculadora redondea a cajas completas y luego lo agregas al carrito.' },
      { target: ['[data-tour="product-usage"]'], title: 'Guía de uso', body: 'Te indica en qué ambientes es recomendable la pieza y su clasificación antideslizante.' },
    ],
  },
  {
    id: 'carrito',
    window: 'Carrito',
    match: /^\/carrito$/,
    steps: [
      { target: ['[data-tour="cart-items"]'], title: 'Tus productos', body: 'Ajusta las cajas o los m² de cada producto, o elimínalo. Los importes se recalculan con los precios vigentes.' },
      { target: ['[data-tour="cart-summary"]'], title: 'Resumen', body: 'Total en dólares y su equivalente en bolívares con la tasa BCV registrada. Cuando esté listo, continúa con la compra.' },
    ],
    empty: 'Tu carrito está vacío. Ve al catálogo y usa la calculadora de cada ficha para agregar productos; cuando vuelvas, el recorrido te mostrará el resumen.',
  },
  {
    id: 'checkout',
    window: 'Orden de compra',
    match: /^\/checkout$/,
    steps: [
      { title: 'Registra tu orden en 5 pasos', body: 'Solo pedimos lo necesario. El servidor vuelve a verificar inventario, precios, tasa y fecha antes de registrar la orden.' },
      { target: ['section[aria-labelledby="step-1"]'], title: '1 · Tus datos', body: 'Nombre completo, ciudad y zona, teléfono y cédula. No necesitas correo ni contraseña.' },
      { target: ['section[aria-labelledby="step-2"]'], title: '2 · Vendedor', body: 'Elige al vendedor que te atenderá en la sede. Es obligatorio para confirmar la orden.' },
      { target: ['section[aria-labelledby="step-3"]'], title: '3 · Modalidad y fecha', body: 'Retiro programado o prepago. Las fechas disponibles son de lunes a viernes, de 8:00 a. m. a 5:00 p. m.' },
      { target: ['section[aria-labelledby="step-4"]'], title: '4 · Método de pago', body: 'Elige cómo vas a pagar. Verás los datos para hacer el pago y, después, podrás adjuntar el comprobante.' },
      { target: ['[data-tour="checkout-review"]'], title: 'Revisión', body: 'Revisa totales y confirma. Recibirás tu número de orden para coordinar con tu vendedor.' },
    ],
  },
  {
    id: 'como-comprar',
    window: 'Cómo comprar',
    match: /^\/como-comprar$/,
    steps: [
      { target: ['[data-tour="howto-modes"]'], title: 'Dos modalidades', body: 'Pagas el total con retiro programado, o abonas un porcentaje y reservas una fecha posterior.' },
      { target: ['[data-tour="howto-hours"]'], title: 'Días y horarios', body: 'La sede atiende retiros de lunes a viernes, de 8:00 a. m. a 5:00 p. m.' },
      { target: ['[data-tour="howto-rate"]'], title: 'Precios y tasa', body: 'Los precios están en dólares; el monto en bolívares usa la tasa BCV y queda guardado en tu orden.' },
    ],
  },
  {
    id: 'contacto',
    window: 'Contacto',
    match: /^\/contacto$/,
    steps: [
      { target: ['[data-tour="contact-sellers"]'], title: 'Vendedores y sede', body: 'Datos del vendedor, ubicación y horario de atención de la sede.' },
      { target: ['[data-tour="contact-channels"]'], title: 'Canales', body: 'Escribe por WhatsApp o usa el chat interno de la plataforma para dar seguimiento a tus operaciones.' },
    ],
  },
  {
    id: 'politicas',
    window: 'Políticas',
    match: /^\/politicas$/,
    steps: [{ target: ['main h1'], title: 'Políticas comerciales', body: 'Condiciones, cancelaciones, cambios de fecha y privacidad. Se generan a partir de la configuración vigente de la tienda.' }],
  },
  {
    id: 'ingresar',
    window: 'Ingresar',
    match: /^\/ingresar$/,
    steps: [
      { target: ['main form'], title: 'Ingresar', body: 'Para el personal y para clientes que agregaron correo y contraseña. Para comprar no necesitas cuenta: basta con tus datos en la orden.' },
    ],
  },
  {
    id: 'cuenta',
    window: 'Mi cuenta',
    match: /^\/cuenta$/,
    steps: [
      { target: ['nav[aria-label="Mi cuenta"]'], title: 'Secciones', body: 'Resumen, compras y reservas, mensajes con tu vendedor y tu perfil.' },
      { target: ['[data-tour="account-active"]'], title: 'Operaciones activas', body: 'Tus órdenes en curso con su estado de pago y de entrega. Toca una para ver el detalle.' },
      { target: ['[data-tour="account-seller"]'], title: 'Tu vendedor', body: 'El vendedor asignado y su WhatsApp para coordinar tu visita.' },
    ],
  },
  {
    id: 'cuenta-operaciones',
    window: 'Compras y reservas',
    match: /^\/cuenta\/operaciones$/,
    steps: [{ target: ['main h1'], title: 'Historial', body: 'Todas tus órdenes, incluidas las entregadas y canceladas. Entra a cualquiera para ver productos, pagos e historial.' }],
  },
  {
    id: 'cuenta-orden',
    window: 'Detalle de la orden',
    match: /^\/cuenta\/operaciones\/[^/]+$/,
    steps: [
      { target: ['ol[aria-label="Progreso de la orden"]'], title: 'Progreso', body: 'Orden registrada, pago, preparación, listo para retirar y entregado. El paso actual queda marcado.' },
      { target: ['[data-tour="order-items"]'], title: 'Productos', body: 'Lo que compraste: cajas, m² y precio unitario guardados al registrar la orden.' },
      { target: ['#pagar'], title: 'Adjunta tu comprobante', body: 'Indica el método, el monto y la referencia, y sube la imagen o PDF del pago. Tu vendedor lo revisará.' },
      { target: ['[data-tour="order-aside"]'], title: 'Coordina tu visita', body: 'Fecha de retiro, importes y tu vendedor responsable. Escríbele por WhatsApp con tu número de orden antes de ir a la sede.' },
    ],
  },
  {
    id: 'cuenta-chat',
    window: 'Mensajes',
    match: /^\/cuenta\/chat(\/[^/]+)?$/,
    steps: [{ target: ['[data-tour="chat-list"]'], title: 'Mensajes', body: 'Inicia una conversación con un vendedor o continúa una existente. Los mensajes llegan en tiempo real.' }],
  },
  {
    id: 'cuenta-perfil',
    window: 'Perfil',
    match: /^\/cuenta\/perfil$/,
    steps: [
      { target: ['h:Tus datos'], title: 'Tus datos', body: 'Corrige tu nombre, ubicación o teléfono. La cédula se muestra enmascarada.' },
      { target: ['h:Acceso desde otros dispositivos', 'h:Cambiar contraseña'], title: 'Acceso', body: 'Si quieres entrar desde otro dispositivo, puedes agregar correo y contraseña, o pedir a tu vendedor un enlace de acceso.' },
    ],
  },
  {
    id: 'staff-operaciones',
    window: 'Operaciones',
    match: /^\/(vendedor|admin\/operaciones)$/,
    steps: [
      { target: STAFF_NAV, title: 'Menú del panel', body: 'Desde aquí pasas a operaciones, comprobantes, retiros y chat.' },
      { target: ['[data-tour="staff-filters"]'], title: 'Filtros', body: 'Filtra por estado y modalidad, o busca por número de orden, cliente o teléfono.' },
      { target: ['main table'], title: 'Órdenes', body: 'Cada fila muestra cliente, productos, método y estado del comprobante. Ábrela para gestionarla.' },
    ],
  },
  {
    id: 'staff-orden',
    window: 'Detalle de operación',
    match: /^\/(vendedor|admin)\/operaciones\/[^/]+$/,
    steps: [
      { target: ['[data-tour="staff-order-head"]'], title: 'Acciones', body: 'Número de orden, estados y los botones para avanzar: iniciar revisión, marcar lista para retiro o registrar la entrega.' },
      { target: ['ol[aria-label="Progreso de la orden"]'], title: 'Progreso', body: 'La misma barra que ve el cliente.' },
      { target: ['h:Pagos y comprobantes'], title: 'Pagos', body: 'Comprobantes adjuntos para aprobar o rechazar tras verificarlos contra el banco o la plataforma.' },
      { target: ['h:Cliente'], title: 'Cliente', body: 'Datos de contacto, cédula enmascarada, WhatsApp y enlace de acceso para el cliente.' },
    ],
  },
  {
    id: 'staff-pagos',
    window: 'Comprobantes',
    match: /^\/(vendedor|admin)\/pagos$/,
    steps: [
      { target: ['[data-tour="payments-tabs"]'], title: 'Estados', body: 'Pendientes, aprobados y rechazados.' },
      { target: ['[data-tour="payments-list"] > *:first-child'], title: 'Revisión', body: 'Abre el comprobante, verifica el pago y apruébalo o recházalo indicando el motivo. La decisión queda registrada con tu nombre.' },
    ],
  },
  {
    id: 'staff-invitaciones',
    window: 'Invitaciones al portal',
    match: /^\/(vendedor|admin)\/invitaciones$/,
    steps: [
      { target: ['[data-tour="invite-form"]'], title: 'Nuevo enlace', body: 'Escribe el nombre y el teléfono del cliente y genera su enlace personal. Es de un solo uso y vence a los días configurados.' },
      { target: ['[data-tour="invite-created"]', '[data-tour="invite-form"]'], title: 'Envíalo por WhatsApp', body: 'El botón abre WhatsApp con el mensaje listo. Al abrirlo, el cliente registra sus datos una sola vez y entra a su portal.' },
      { target: ['[data-tour="invite-list"]'], title: 'Seguimiento', body: 'Ve qué enlaces están pendientes, usados, vencidos o anulados. Puedes anular uno pendiente si lo enviaste por error.' },
    ],
  },
  {
    id: 'staff-retiros',
    window: 'Calendario de retiros',
    match: /^\/(vendedor|admin)\/retiros$/,
    steps: [{ target: ['[data-tour="pickups-days"]'], title: 'Próximos 14 días', body: 'Retiros programados por día con cajas y saldo pendiente. Usa Anterior, Hoy y Siguiente para moverte.' }],
  },
  {
    id: 'staff-chat',
    window: 'Atención al cliente',
    match: /^\/(vendedor|admin)\/chat(\/[^/]+)?$/,
    steps: [
      { target: ['[data-tour="chat-list"]'], title: 'Conversaciones', body: 'Filtra por abiertas, en espera o cerradas.' },
      { target: ['[data-tour="chat-thread"]'], title: 'Conversación', body: 'Responde en tiempo real y cambia el estado de la conversación cuando quede resuelta.' },
    ],
  },
  {
    id: 'admin',
    window: 'Indicadores',
    match: /^\/admin$/,
    steps: [
      { target: STAFF_NAV, title: 'Administración', body: 'Todas las secciones: operaciones, productos, vendedores, usuarios, tasa, métodos de pago, configuración y auditoría.' },
      { target: ['[data-tour="admin-stats"]'], title: 'Indicadores', body: 'Ventas confirmadas, m² vendidos, pagos por verificar y pedidos pendientes de entrega.' },
      { target: ['input[aria-label="Desde"]'], title: 'Período', body: 'Cambia las fechas para ver otro período.' },
      { target: ['h:Stock bajo o agotado'], title: 'Inventario', body: 'Productos con pocas cajas o agotados.' },
    ],
  },
  {
    id: 'admin-productos',
    window: 'Productos e inventario',
    match: /^\/admin\/productos$/,
    steps: [{ target: ['main table'], title: 'Productos', body: 'Lista de productos con precio, existencias y estado. Abre uno para editarlo o crea uno nuevo.' }],
  },
  {
    id: 'admin-producto',
    window: 'Editar producto',
    match: /^\/admin\/productos\/[^/]+$/,
    steps: [
      { target: ['main form'], title: 'Datos', body: 'Nombre, SKU, formato, caja, precios en divisas y BCV, ambientes y guía de uso.' },
      { target: ['h:Inventario'], title: 'Inventario', body: 'Ajustes de existencias con motivo. Cada cambio queda auditado.' },
    ],
  },
  {
    id: 'admin-vendedores',
    window: 'Vendedores',
    match: /^\/admin\/vendedores$/,
    steps: [{ target: ['main h1'], title: 'Vendedores', body: 'Solo los vendedores activos aparecen en el checkout. Genera aquí el enlace de activación para que cada uno elija su contraseña.' }],
  },
  {
    id: 'admin-usuarios',
    window: 'Usuarios y roles',
    match: /^\/admin\/usuarios$/,
    steps: [{ target: ['main table', 'main h1'], title: 'Usuarios', body: 'Roles y permisos de cada cuenta. Puedes desactivar el acceso cuando sea necesario.' }],
  },
  {
    id: 'admin-tasa',
    window: 'Tasa BCV',
    match: /^\/admin\/tasa$/,
    steps: [
      { target: ['h:Tasa vigente'], title: 'Tasa vigente', body: 'La tasa con la que se calculan hoy los montos en bolívares.' },
      { target: ['h:Registrar tasa manual'], title: 'Registrar la tasa del día', body: 'Escribe la tasa oficial. Las órdenes ya registradas conservan la tasa con la que se crearon.' },
    ],
  },
  {
    id: 'admin-metodos',
    window: 'Métodos de pago',
    match: /^\/admin\/metodos-pago$/,
    steps: [{ target: ['main h1'], title: 'Métodos de pago', body: 'Activa o desactiva cada método y escribe los datos de recepción que verá el cliente al pagar.' }],
  },
  {
    id: 'admin-configuracion',
    window: 'Configuración',
    match: /^\/admin\/configuracion$/,
    steps: [{ target: ['[data-tour="settings-sections"]'], title: 'Secciones', body: 'Sede, WhatsApp, días y horarios de retiro, días bloqueados, reservas, cancelaciones, tasa, textos legales y más. Los cambios quedan auditados.' }],
  },
  {
    id: 'admin-auditoria',
    window: 'Auditoría',
    match: /^\/admin\/auditoria$/,
    steps: [{ target: ['main table', 'main h1'], title: 'Auditoría', body: 'Registro de cambios sensibles: precios, inventario, tasas, pagos, configuración y permisos.' }],
  },
];

export function tourFor(pathname: string, isCustomer = false): Tour | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return TOURS.find((t) => t.match.test(path) && (!t.audience || t.audience === (isCustomer ? 'customer' : 'guest')));
}
