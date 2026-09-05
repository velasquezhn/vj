const CONVERSATION_STATES = Object.freeze({
  MENU: 'MENU_PRINCIPAL',
  CABIN_LIST: 'LISTA_CABAÑAS',
  CABIN_DETAIL: 'DETALLE_CABAÑA',
  ACTIVITIES: 'actividades',
  POST_ACTIVITY: 'post_actividad',
  CONTACT_MESSAGE: 'contact_message',
  WEATHER_CITY: 'weather_city',
  WEATHER_RESULT: 'weather_result',
  POST_RESERVATION_MENU: 'post_reserva_menu',
  POST_RESERVATION_EMPTY: 'post_reserva_no_reserva',
  POST_RESERVATION_RECEIPT: 'post_reserva_esperando_comprobante',
  POST_RESERVATION_CANCEL: 'post_reserva_confirmar_cancelacion',
  WAITING_AGENT: 'esperando_agente'
});

const BUTTON_IDS = Object.freeze({
  MAIN_MENU: 'main_menu',
  RESERVATION_START: 'reservation_start',
  DETAIL_BACK: 'detail_back',
  DETAIL_RESERVE: 'detail_reserve',
  DETAIL_MENU: 'detail_menu',
  DATES_YES: 'dates_yes',
  DATES_NO: 'dates_no',
  TERMS_ACCEPT: 'terms_accept',
  TERMS_DECLINE: 'terms_decline',
  ACTIVITIES_MORE: 'activities_more',
  WEATHER_RETRY: 'weather_retry',
  POST_CANCEL_YES: 'post_cancel_yes',
  POST_CANCEL_NO: 'post_cancel_no',
  HELP_REQUEST: 'help_request'
});

const MAIN_MENU_OPTIONS = Object.freeze({
  LODGING: '1',
  RESERVE: '2',
  ACTIVITIES: '3',
  CONTACT: '4',
  WEATHER: '5',
  FAQ: '6',
  MY_RESERVATION: '7'
});

module.exports = { CONVERSATION_STATES, BUTTON_IDS, MAIN_MENU_OPTIONS };
