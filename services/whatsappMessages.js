const MAIN_MENU_ROWS = Object.freeze([
  { id: 'main_1', title: '🏡 Alojamientos', description: 'Tipos, capacidad, precios y fotografías' },
  { id: 'main_2', title: '📅 Reservar ahora', description: 'Consulta fechas y solicita una reserva' },
  { id: 'main_3', title: '🌴 Experiencias', description: 'Actividades disponibles en la zona' },
  { id: 'main_4', title: '📲 Contacto', description: 'Habla con nuestro equipo' },
  { id: 'main_5', title: '🌦️ Clima', description: 'Pronóstico para tu visita' },
  { id: 'main_6', title: '❓ Preguntas frecuentes', description: 'Horarios, servicios y pagos' },
  { id: 'main_7', title: '📸 Compartir experiencia', description: 'Envíanos una publicación de tu visita' },
  { id: 'main_8', title: '🛎️ Mi reserva', description: 'Estado, pagos, cambios y asistencia' },
  { id: 'main_9', title: '💎 Beneficios', description: 'Consulta promociones disponibles' }
]);

const NAVIGATION_FOOTER = 'Escribe “menú” para volver al inicio';

function mainMenuFallback() {
  return `🏡 *Villas Julie*

${MAIN_MENU_ROWS.map((row, index) => `${index + 1}. ${row.title}`).join('\n')}

Responde con el número de una opción.`;
}

function reservationStart() {
  const year = new Date().getFullYear();
  return `📅 *Nueva solicitud de reserva*

Escribe la *fecha de entrada y la fecha de salida* en un solo mensaje.

Formato recomendado: *día/mes/año al día/mes/año*.

Ejemplos:
• 15/09/${year} al 18/09/${year}
• del 15 al 18 de septiembre
• 15 de septiembre por 3 noches

Si omites el año, usaré la próxima fecha disponible. En fechas numéricas interpretamos primero el *día* y después el *mes*.

Antes de continuar te mostraré exactamente las fechas entendidas para que las confirmes.

Escribe *cancelar* para salir o *menú* para volver al inicio.`;
}

function contactMessage() {
  const numbers = String(process.env.PUBLIC_CONTACT_NUMBERS || '')
    .split(',')
    .map((number) => number.replace(/\D/g, ''))
    .filter(Boolean);
  const channels = numbers.length
    ? numbers.map((number) => `• WhatsApp: https://wa.me/${number}`).join('\n')
    : 'Puedes escribirnos en este mismo chat y un integrante del equipo te atenderá.';
  return `📲 *Contacto Villas Julie*

${channels}

Indícanos brevemente en qué podemos ayudarte.`;
}

function faqMessage(depositPercentage = 50) {
  return `❓ *Preguntas frecuentes*

*¿Dónde estamos?*
En Tela, Atlántida, frente al mar.

*¿Cuáles son los horarios?*
Entrada: 2:00 p. m. · Salida: 11:00 a. m.

*¿Qué incluyen los alojamientos?*
Cocina equipada, aire acondicionado, Wi-Fi, estacionamiento y acceso a la playa.

*¿Se permiten niños o mascotas?*
Los niños son bienvenidos. Consulta con el equipo las condiciones para mascotas.

*¿Cómo se confirma una reserva?*
Primero envías la solicitud. Un administrador autoriza el pago y te comparte las cuentas. Después debes enviar el comprobante; la confirmación final llega por este chat.

*¿Cuánto se paga para reservar?*
El anticipo configurado actualmente es del ${depositPercentage}%. No realices pagos antes de recibir la autorización.`;
}

function invalidOption(validOptions) {
  return `No reconocí esa opción. ${validOptions}\n\n${NAVIGATION_FOOTER}.`;
}

function normalizeConversationInput(value) {
  const original = String(value || '').trim();
  const input = original.toLowerCase();
  const normalized = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const aliases = {
    inicio: 'menu',
    menu: 'menu',
    'menu principal': 'menu',
    principal: 'menu',
    salir: 'cancelar',
    cancelar: 'cancelar',
    atras: 'volver',
    regresar: 'volver',
    volver: 'volver'
  };
  return aliases[normalized] || original;
}

module.exports = {
  MAIN_MENU_ROWS,
  NAVIGATION_FOOTER,
  mainMenuFallback,
  reservationStart,
  contactMessage,
  faqMessage,
  invalidOption,
  normalizeConversationInput
};
