const logger = require('../config/logger');

async function enviarReservaAlGrupo(_bot, reserva) {
  logger.info('Nueva reserva disponible para revisión en la API administrativa', {
    reservationId: reserva?.reservation_id
  });
  return { deliveredToGroup: false, channel: 'admin-api' };
}

module.exports = { enviarReservaAlGrupo };
