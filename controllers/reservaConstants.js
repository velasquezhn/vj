/**
 * Constantes para los estados del flujo de reserva.
 */
const ESTADOS_RESERVA = {
  FECHAS: 'reservar_fechas',
  CONFIRMAR_FECHAS: 'reservar_confirmar_fechas',
  NOMBRE: 'reservar_nombre',
  PERSONAS: 'reservar_personas',
  CONDICIONES: 'reservar_condiciones',
  ESPERANDO_AUTORIZACION: 'esperando_autorizacion',
  ESPERANDO_PAGO: 'esperando_pago',
  ESPERANDO_CONFIRMACION: 'esperando_confirmacion'
};

module.exports = {
  ESTADOS_RESERVA
};
