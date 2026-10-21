/**
 * Textos legales predeterminados (borradores) del portal. Describen lo que la plataforma hace
 * realmente: cookies que instala, datos que pide, quién los ve y cómo funciona el asistente.
 * No sustituyen la revisión de un abogado: la administración puede reemplazar cada documento
 * desde Configuración → Textos legales.
 */

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  id: 'terminos' | 'privacidad' | 'cookies' | 'asistente';
  title: string;
  summary: string;
  sections: LegalSection[];
}

export interface LegalContext {
  storeName: string;
  city: string;
  hoursText: string;
  contact: string;
  /** Motor del asistente: con Claude los mensajes se envían a Anthropic para responder. */
  assistantProvider: 'claude' | 'local';
  customerSessionDays: number;
  staffSessionHours: number;
}

export function legalDocuments(ctx: LegalContext): LegalDocument[] {
  const store = ctx.storeName || 'la tienda';
  const city = ctx.city || 'Barinas';
  const contact = ctx.contact || 'su vendedor asignado';
  const usesClaude = ctx.assistantProvider === 'claude';

  return [
    {
      id: 'terminos',
      title: 'Términos y condiciones de uso',
      summary: 'Reglas para usar el portal de compra, registrar órdenes y pagar.',
      sections: [
        {
          heading: '1. Quiénes somos',
          paragraphs: [
            `Este portal pertenece a ${store}, con sede en ${city}, Venezuela. Es un portal de compra privado: permite consultar el catálogo de porcelanatos, registrar órdenes de compra, informar pagos y coordinar el retiro en la sede. Al usarlo, usted acepta estos términos.`,
          ],
        },
        {
          heading: '2. Acceso al portal',
          bullets: [
            'Se entra con un enlace personal de un solo uso que envía su vendedor. El enlace es intransferible: no lo comparta.',
            'Al abrirlo registra su nombre completo, ciudad y zona, teléfono y cédula. Debe ser información verdadera y propia; cada cédula corresponde a un único perfil.',
            `Su sesión queda abierta en el dispositivo hasta ${ctx.customerSessionDays} días. Usted es responsable del uso que se haga desde ese dispositivo; en equipos compartidos, cierre la sesión.`,
            'Para entrar desde otro dispositivo, pida a su vendedor un enlace de acceso o agregue correo y contraseña en su perfil.',
          ],
        },
        {
          heading: '3. Precios, tasa y disponibilidad',
          bullets: [
            'Los precios se expresan en dólares (USD). Si paga en bolívares se aplica el precio BCV indicado en cada producto, convertido con la tasa BCV registrada; la tasa aplicada queda fijada en su orden.',
            'Se venden cajas completas: la cantidad en m² se redondea a la caja superior.',
            'Las existencias pueden cambiar hasta que la orden se registra; el sistema verifica precio, inventario, tasa y fecha al confirmar.',
            'Las fotografías son referenciales: el tono y las vetas del porcelanato pueden variar entre lotes de fabricación.',
            'La guía de uso por ambiente y la clasificación antideslizante son orientativas; consulte con su instalador para su caso.',
          ],
        },
        {
          heading: '4. Órdenes y pagos',
          bullets: [
            'Registrar una orden de compra no significa que el pago esté aprobado ni que el pedido esté listo.',
            'Los pagos (Pago Móvil, Zelle, Binance, transferencia o efectivo, según estén activos) se verifican manualmente. El comprobante que usted adjunta es revisado por el personal autorizado, que puede aprobarlo o rechazarlo indicando el motivo.',
            'Adjuntar un comprobante falso o alterado es motivo de cancelación de la orden y del acceso al portal, sin perjuicio de las acciones legales que correspondan.',
            'Las condiciones comerciales (apartado de mercancía, prepago, cancelaciones, cambios de fecha y devoluciones) se detallan en la sección «Condiciones comerciales» y quedan guardadas en cada orden al confirmarla.',
          ],
        },
        {
          heading: '5. Retiro en sede',
          paragraphs: [
            `Las compras se retiran en la sede de ${city}${ctx.hoursText ? `, en el horario de atención: ${ctx.hoursText.replace(/\.\s*$/, '')}` : ''}. Antes de acudir, contacte a su vendedor asignado para coordinar su visita.`,
          ],
        },
        {
          heading: '6. Uso aceptable',
          bullets: [
            'No intente acceder a cuentas, órdenes o comprobantes de otras personas.',
            'No suba archivos que no sean comprobantes de pago propios, ni contenido malicioso.',
            'No use programas automáticos para consultar o registrar información en el portal.',
          ],
        },
        {
          heading: '7. Asistente virtual',
          paragraphs: ['El asistente automático del portal se rige por la sección «Uso del asistente de IA».'],
        },
        {
          heading: '8. Cambios y legislación aplicable',
          paragraphs: [
            'Podemos actualizar estos términos; la versión vigente se publica en esta página. Las órdenes ya registradas conservan las condiciones que se aceptaron al confirmarlas. Estos términos se rigen por las leyes de la República Bolivariana de Venezuela.',
          ],
        },
        { heading: '9. Contacto', paragraphs: [`Para cualquier consulta sobre estos términos, escriba a ${contact}.`] },
      ],
    },
    {
      id: 'privacidad',
      title: 'Política de privacidad',
      summary: 'Qué datos pedimos, para qué, quién los ve y cuáles son sus derechos.',
      sections: [
        { heading: 'Responsable', paragraphs: [`${store}, con sede en ${city}, Venezuela, es responsable de los datos que usted registra en este portal.`] },
        {
          heading: 'Datos que tratamos',
          bullets: [
            'Los que usted registra: nombre completo, ciudad y zona o dirección de referencia, teléfono y cédula de identidad. Si lo decide, correo y contraseña (la contraseña se guarda de forma irreversible; nadie puede leerla).',
            'Los de sus compras: órdenes, productos, importes, método de pago elegido, pagos informados, referencias y comprobantes (imágenes JPG, PNG o WebP).',
            'Los mensajes que intercambia con su vendedor por el chat interno.',
            'Datos técnicos de seguridad: dirección IP y navegador al iniciar sesión, y un registro de las acciones sensibles (por ejemplo, revisiones de pagos o consultas de la cédula completa por parte del personal).',
          ],
        },
        {
          heading: 'Para qué los usamos',
          bullets: [
            'Gestionar sus órdenes, verificar sus pagos y coordinar el retiro.',
            'Que su vendedor le atienda y pueda contactarle.',
            'Proteger su cuenta y prevenir fraudes.',
            'Cumplir obligaciones legales y contables.',
          ],
          paragraphs: ['No vendemos sus datos ni los usamos para publicidad.'],
        },
        {
          heading: 'Quién puede verlos',
          bullets: [
            'Usted, desde su portal.',
            'Su vendedor asignado y la administración de la tienda, solo para atender sus órdenes.',
            'La cédula se muestra enmascarada (V-****1234); la consulta completa queda limitada al personal autorizado y registrada.',
            'Los comprobantes de pago se guardan en un almacenamiento privado: nunca son públicos.',
          ],
        },
        {
          heading: 'Servicios de terceros',
          bullets: [
            'El proveedor de alojamiento y de base de datos donde funciona el portal, que guarda la información por cuenta de la tienda.',
            'WhatsApp (Meta), solo cuando usted pulsa un botón para escribir a su vendedor; esa conversación se rige por las condiciones de WhatsApp.',
            'Google Fonts: las tipografías del portal se descargan de servidores de Google, que reciben su dirección IP. No instala cookies.',
            'Google Maps, solo si usted pulsa «Ver mapa» o «Cómo llegar»: Google recibe su dirección IP y puede usar sus propias cookies, según su política de privacidad.',
            usesClaude
              ? 'Anthropic, cuando usa el asistente virtual: sus mensajes se envían a su servicio de inteligencia artificial para generar la respuesta (vea «Uso del asistente de IA»).'
              : 'El asistente virtual funciona dentro del portal; sus mensajes no se envían a terceros.',
          ],
        },
        {
          heading: 'Conservación',
          paragraphs: [
            'Conservamos sus datos mientras mantenga su perfil y, después, durante el tiempo que exijan las obligaciones legales y contables aplicables a las ventas realizadas.',
          ],
        },
        {
          heading: 'Sus derechos',
          paragraphs: [
            `Puede consultar y corregir sus datos en su portal (Mi cuenta → Perfil). Para solicitar una copia, la actualización o la eliminación de sus datos, escriba a ${contact}. Algunos registros de órdenes y pagos deben conservarse por obligación legal. Estos derechos se ejercen conforme al artículo 28 de la Constitución de la República Bolivariana de Venezuela (habeas data).`,
          ],
        },
        {
          heading: 'Seguridad',
          paragraphs: [
            'Usamos sesiones con cookies protegidas, contraseñas almacenadas de forma irreversible, conexiones cifradas (HTTPS), comprobantes privados y un registro de auditoría. Ningún sistema es infalible: si sospecha de un acceso indebido, avise a su vendedor.',
          ],
        },
        { heading: 'Menores de edad', paragraphs: ['El portal está dirigido a personas mayores de 18 años.'] },
      ],
    },
    {
      id: 'cookies',
      title: 'Política de cookies',
      summary: 'Solo usamos cookies necesarias para la sesión, la seguridad y el carrito.',
      sections: [
        {
          heading: 'Qué son',
          paragraphs: ['Las cookies son pequeños archivos que el portal guarda en su navegador. También usamos el almacenamiento local del navegador para recordar algunas preferencias.'],
        },
        {
          heading: 'Cookies que usamos',
          bullets: [
            `sid — Sesión. Le mantiene dentro del portal. Esencial. Dura hasta ${ctx.customerSessionDays} días para clientes y ${ctx.staffSessionHours / 24} días para el personal. No es accesible para programas de la página.`,
            'csrf_token — Seguridad. Impide que otros sitios envíen formularios en su nombre. Esencial. Dura mientras el navegador esté abierto.',
            'cart_token — Carrito de un visitante antes de entrar. Esencial. Dura 30 días.',
          ],
        },
        {
          heading: 'Almacenamiento local',
          bullets: [
            'porcelanas.tour.* — Recuerda qué recorridos guiados ya vio y si desactivó su inicio automático.',
            'porcelanas.assistant — Historial del asistente virtual en esa pestaña; se borra al cerrarla.',
            'porcelanas.cookies — Recuerda que ya vio el aviso de cookies.',
          ],
        },
        {
          heading: 'Lo que no usamos',
          paragraphs: [
            'No usamos cookies de analítica, publicidad ni rastreo de terceros. Como todas las cookies del portal son estrictamente necesarias para que funcione, no requieren su consentimiento; le informamos de ellas por transparencia.',
            'El mapa de la sede (Google Maps) no se carga hasta que usted pulsa «Ver mapa». A partir de ese momento Google puede instalar sus propias cookies, que se rigen por la política de privacidad de Google.',
          ],
        },
        {
          heading: 'Cómo eliminarlas',
          paragraphs: [
            'Puede borrarlas desde la configuración de su navegador. Si borra la cookie de sesión y su perfil no tiene correo y contraseña, necesitará un enlace de acceso de su vendedor para volver a entrar.',
          ],
        },
      ],
    },
    {
      id: 'asistente',
      title: 'Uso del asistente de IA',
      summary: 'Cómo funciona el asistente virtual, qué puede y qué no puede hacer.',
      sections: [
        {
          heading: 'Qué es',
          paragraphs: [
            usesClaude
              ? 'El asistente virtual es un programa automático, no una persona. Utiliza un modelo de inteligencia artificial (Claude, de Anthropic) que consulta en modo de solo lectura los datos de la tienda: catálogo, precios, existencias, horario, métodos de pago, tasa BCV y, si tiene la sesión abierta, sus propias órdenes.'
              : 'El asistente virtual es un programa automático de respuestas, no una persona. Consulta en modo de solo lectura los datos de la tienda: catálogo, precios, existencias, horario, métodos de pago, tasa BCV y, si tiene la sesión abierta, sus propias órdenes.',
          ],
        },
        {
          heading: 'Sus respuestas son orientativas',
          bullets: [
            'Puede equivocarse o malinterpretar una pregunta.',
            'Lo que vale es lo que muestra su orden de compra al confirmarla (productos, cantidades, precio y tasa) y lo que confirme su vendedor.',
            'Las recomendaciones de uso por ambiente son orientativas; para decisiones técnicas consulte a su instalador.',
          ],
        },
        {
          heading: 'Lo que no hace',
          bullets: [
            'No registra órdenes, no aprueba pagos ni modifica sus datos.',
            'No da los datos para pagar: aparecen dentro de su orden de compra.',
            'No le pedirá su cédula, contraseñas ni claves bancarias. No las escriba en el chat.',
          ],
        },
        {
          heading: 'Sus conversaciones',
          paragraphs: [
            usesClaude
              ? 'Las conversaciones no se guardan en los servidores de la tienda; el historial queda en su navegador hasta que cierra la pestaña. Para responder, sus mensajes y la información de la tienda necesaria se envían a Anthropic, que los procesa conforme a sus condiciones comerciales y su política de privacidad (anthropic.com/legal).'
              : 'Las conversaciones no se guardan en los servidores de la tienda ni se envían a terceros; el historial queda en su navegador hasta que cierra la pestaña.',
          ],
        },
        {
          heading: 'Uso aceptable',
          paragraphs: ['Use el asistente para consultas sobre la tienda y sus productos. No intente obtener información de otros clientes ni hacer que actúe fuera de ese propósito.'],
        },
        {
          heading: 'Atención humana',
          paragraphs: ['Si la respuesta no le sirve, escriba a su vendedor por WhatsApp o por el chat interno: siempre puede hablar con una persona.'],
        },
      ],
    },
  ];
}
