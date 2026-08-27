const { runQuery } = require('../db');

const DEFAULTS = Object.freeze({
  check_in_time: '14:00',
  check_out_time: '11:00',
  office_hours: '08:00-16:00',
  support_availability: '24/7',
  refund_policy: 'no_refunds',
  data_retention_days: '730',
  review_enabled: 'true'
});

async function getBusinessSettings() {
  const keys = Object.keys(DEFAULTS);
  try {
    const rows = await runQuery(`SELECT setting_key, setting_value FROM AppSettings
      WHERE setting_key IN (${keys.map(() => '?').join(',')})`, keys);
    const stored = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
    return { ...DEFAULTS, ...stored };
  } catch (error) {
    if (error.code === 'SQLITE_ERROR' && /no such table/i.test(error.message)) return { ...DEFAULTS };
    throw error;
  }
}

function reservationTerms(settings = DEFAULTS) {
  return [
    '• Se requiere un anticipo del 50% después de la autorización administrativa.',
    '• Tendrás 24 horas desde la autorización para realizar el pago y enviar el comprobante.',
    '• Los pagos y anticipos no son reembolsables.',
    '• Entrada: 2:00 p. m. · Salida: 11:00 a. m.',
    '• Los cambios de fecha o alojamiento deben solicitarse a un administrador y dependen de disponibilidad.',
    '• La solicitud solo queda confirmada después de que un administrador valide el comprobante.',
    '• Al continuar autorizas el uso de tus datos para gestionar la reserva y conservar su historial hasta por 2 años.'
  ].join('\n');
}

module.exports = { DEFAULTS, getBusinessSettings, reservationTerms };
