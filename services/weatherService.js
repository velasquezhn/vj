const axios = require('axios');
const logger = require('../config/logger');

const DEFAULT_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const DEFAULT_TIMEOUT_MS = 8000;

function weatherError(code, message) {
  return { success: false, code, message };
}

function localParts(unixSeconds, offsetSeconds) {
  const date = new Date((unixSeconds + offsetSeconds) * 1000);
  return {
    key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
    hour: date.getUTCHours()
  };
}

class WeatherService {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || process.env.OPENWEATHER_BASE_URL || DEFAULT_BASE_URL;
    const requestedTimeout = Number(options.timeoutMs || process.env.WEATHER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    this.timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(Math.max(requestedTimeout, 1000), 20000) : DEFAULT_TIMEOUT_MS;
    this.http = options.http || axios.create({ baseURL: this.baseUrl, timeout: this.timeoutMs });
  }

  getWeatherEmoji(condition, temp) {
    const value = String(condition || '').toLowerCase();
    if (value.includes('thunderstorm')) return '⛈️';
    if (value.includes('rain') || value.includes('drizzle')) return '🌧️';
    if (value.includes('snow')) return '❄️';
    if (value.includes('mist') || value.includes('fog')) return '🌫️';
    if (value.includes('cloud')) return temp > 25 ? '⛅' : '☁️';
    if (value.includes('clear')) return temp > 25 ? '☀️' : '🌤️';
    return '🌤️';
  }

  generateRecommendation(currentTemp, rainProbability) {
    if (rainProbability >= 70) return 'Lleva paraguas y confirma las actividades al aire libre.';
    if (rainProbability >= 50) return 'Hay posibilidad de lluvia; lleva protección impermeable.';
    if (currentTemp >= 30) return 'Será un día caluroso; usa protector solar y mantente hidratado.';
    if (currentTemp < 20) return 'El ambiente estará fresco; lleva una chaqueta ligera.';
    return 'Condiciones agradables para disfrutar la zona.';
  }

  validatePayload(current, forecast) {
    return current?.main && Array.isArray(current.weather) && current.weather[0]
      && Array.isArray(forecast?.list) && forecast.list.length > 0
      && Number.isFinite(Number(forecast?.city?.timezone));
  }

  tomorrowSummary(forecast) {
    const offset = Number(forecast.city.timezone || 0);
    const nowUnix = Math.floor(Date.now() / 1000);
    const todayLocal = new Date((nowUnix + offset) * 1000);
    const tomorrowLocal = new Date(Date.UTC(
      todayLocal.getUTCFullYear(), todayLocal.getUTCMonth(), todayLocal.getUTCDate() + 1
    ));
    const tomorrowKey = `${tomorrowLocal.getUTCFullYear()}-${String(tomorrowLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrowLocal.getUTCDate()).padStart(2, '0')}`;
    const entries = forecast.list.filter((item) => localParts(item.dt, offset).key === tomorrowKey);
    if (!entries.length) return null;
    const representative = entries.reduce((best, item) => {
      return Math.abs(localParts(item.dt, offset).hour - 12) < Math.abs(localParts(best.dt, offset).hour - 12) ? item : best;
    }, entries[0]);
    return {
      temp: Math.round(Number(representative.main.temp)),
      min: Math.round(Math.min(...entries.map((item) => Number(item.main.temp_min)))),
      max: Math.round(Math.max(...entries.map((item) => Number(item.main.temp_max)))),
      condition: String(representative.weather?.[0]?.description || 'sin descripción'),
      conditionCode: String(representative.weather?.[0]?.main || ''),
      rainProbability: Math.round(Math.max(...entries.map((item) => Number(item.pop || 0))) * 100)
    };
  }

  async getWeatherForecast(city = 'Tela, HN') {
    const query = String(city || '').trim();
    if (!this.apiKey) {
      return weatherError('NOT_CONFIGURED', '🌦️ El pronóstico no está configurado en este momento. Puedes intentar otra operación o volver al menú principal.');
    }
    if (query.length < 2 || query.length > 80 || !/^[\p{L}\s,.'-]+$/u.test(query)) {
      return weatherError('INVALID_CITY', 'No reconocí la ciudad. Escribe un nombre como *Tela, Honduras* o *San Pedro Sula, Honduras*.');
    }

    try {
      const params = { q: query, appid: this.apiKey, units: 'metric', lang: 'es' };
      const [currentResponse, forecastResponse] = await Promise.all([
        this.http.get('/weather', { params }),
        this.http.get('/forecast', { params })
      ]);
      const current = currentResponse.data;
      const forecast = forecastResponse.data;
      if (!this.validatePayload(current, forecast)) {
        logger.warn('Proveedor de clima devolvió una respuesta incompleta', { provider: 'openweathermap' });
        return weatherError('INCOMPLETE_RESPONSE', 'El proveedor respondió sin todos los datos necesarios. Intenta nuevamente en unos minutos.');
      }

      const tomorrow = this.tomorrowSummary(forecast);
      if (!tomorrow) return weatherError('INCOMPLETE_RESPONSE', 'No encontramos un pronóstico completo para mañana. Intenta nuevamente en unos minutos.');
      const todayTemp = Math.round(Number(current.main.temp));
      const todayMax = Math.round(Number(current.main.temp_max));
      const todayMin = Math.round(Number(current.main.temp_min));
      const todayCondition = String(current.weather[0].description || 'sin descripción');
      const cityName = [current.name, current.sys?.country].filter(Boolean).join(', ');
      const updated = new Date().toLocaleString('es-HN', {
        timeZone: 'America/Tegucigalpa', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const message = `🌦️ *Clima en ${cityName || query}*\n\n`
        + `*Ahora:* ${this.getWeatherEmoji(current.weather[0].main, todayTemp)} ${todayTemp} °C · ${todayCondition}\n`
        + `Mín. ${todayMin} °C · Máx. ${todayMax} °C\n\n`
        + `*Mañana:* ${this.getWeatherEmoji(tomorrow.conditionCode, tomorrow.temp)} ${tomorrow.temp} °C · ${tomorrow.condition}\n`
        + `Mín. ${tomorrow.min} °C · Máx. ${tomorrow.max} °C · Lluvia ${tomorrow.rainProbability}%\n\n`
        + `📌 ${this.generateRecommendation(todayTemp, tomorrow.rainProbability)}\n\n`
        + `_Actualizado ${updated}_`;
      return { success: true, message, city: cityName || query, data: { today: { temp: todayTemp, min: todayMin, max: todayMax }, tomorrow } };
    } catch (error) {
      const status = error.response?.status;
      let code = 'PROVIDER_ERROR';
      let message = 'No pudimos consultar el clima en este momento. Intenta nuevamente.';
      if (status === 404) {
        code = 'CITY_NOT_FOUND';
        message = `No encontramos *${query}*. Revisa el nombre e incluye el país, por ejemplo: *Tela, Honduras*.`;
      } else if (status === 401 || status === 403) {
        code = 'AUTH_ERROR';
        message = 'El servicio de clima necesita revisión de configuración. Puedes volver al menú mientras lo solucionamos.';
      } else if (status === 429) {
        code = 'RATE_LIMITED';
        message = 'El servicio de clima alcanzó temporalmente su límite. Intenta nuevamente en unos minutos.';
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        code = 'TIMEOUT';
        message = 'La consulta del clima tardó demasiado. Puedes intentarlo nuevamente o consultar otra ciudad.';
      } else if (!error.response) {
        code = 'NETWORK_ERROR';
        message = 'No pudimos conectarnos con el servicio de clima. Intenta nuevamente en unos minutos.';
      }
      logger.warn('Fallo controlado del proveedor de clima', { provider: 'openweathermap', status, code });
      return weatherError(code, `🌦️ ${message}`);
    }
  }
}

module.exports = WeatherService;
module.exports.localParts = localParts;
