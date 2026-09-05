const WeatherService = require('../../services/weatherService');
const { sendReplyButtons } = require('../../services/whatsappInteractiveService');
const { enviarMenuPrincipal } = require('../../services/messagingService');
const { CONVERSATION_STATES, BUTTON_IDS } = require('../../services/whatsappConversation');

const TELA_QUERY = 'Tela, Honduras';
const weatherService = new WeatherService(process.env.OPENWEATHER_API_KEY);

async function sendTelaWeather(bot, recipient, setState, service = weatherService) {
  const result = await service.getWeatherForecast(TELA_QUERY);
  await setState(recipient, CONVERSATION_STATES.WEATHER_RESULT, { weatherQuery: TELA_QUERY });
  const provider = result.provider === 'open-meteo' ? 'Open-Meteo' : 'OpenWeather';
  return sendReplyButtons(bot, recipient, {
    header: result.success ? 'Clima de Tela' : 'Clima temporalmente no disponible',
    body: result.message,
    footer: result.success ? `Fuente: ${provider}` : 'Puedes actualizar o volver al menú',
    buttons: [
      { id: BUTTON_IDS.WEATHER_RETRY, title: 'Actualizar' },
      { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
    ],
    fallbackText: `${result.message}\n\n1. Actualizar clima de Tela\n0. Menú principal`
  });
}

async function handleWeatherState(bot, recipient, input, _state, _data, setState, service = weatherService) {
  const normalized = String(input || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized === '0' || normalized === 'menu' || normalized === 'menu principal') {
    return enviarMenuPrincipal(bot, recipient);
  }
  // También recupera sesiones antiguas que habían quedado esperando una ciudad.
  return sendTelaWeather(bot, recipient, setState, service);
}

module.exports = { TELA_QUERY, sendTelaWeather, handleWeatherState };
