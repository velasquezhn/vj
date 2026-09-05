const axios = require('axios');
const logger = require('../config/logger');

const DEFAULT_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const DEFAULT_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const DEFAULT_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
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
    this.fallbackHttp = options.fallbackHttp || axios.create({ timeout: this.timeoutMs });
    this.enableFallback = options.enableFallback ?? WeatherService.isFreeFallbackAllowed();
    this.geocodingUrl = options.geocodingUrl || process.env.OPEN_METEO_GEOCODING_URL || DEFAULT_GEOCODING_URL;
    this.forecastUrl = options.forecastUrl || process.env.OPEN_METEO_FORECAST_URL || DEFAULT_FORECAST_URL;
  }

  static isFreeFallbackAllowed() {
    const configured = String(process.env.ALLOW_FREE_WEATHER_FALLBACK || '').trim().toLowerCase();
    if (configured) return ['1', 'true', 'yes', 'si', 'sí'].includes(configured);
    const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
    const appEnv = String(process.env.APP_ENV || (nodeEnv === 'production' ? 'qa' : 'local')).toLowerCase();
    return appEnv !== 'production';
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

  openMeteoCondition(code) {
    const value = Number(code);
    if (value === 0) return { code: 'Clear', text: 'cielo despejado' };
    if ([1, 2].includes(value)) return { code: 'Clouds', text: 'parcialmente nublado' };
    if (value === 3) return { code: 'Clouds', text: 'nublado' };
    if ([45, 48].includes(value)) return { code: 'Fog', text: 'neblina' };
    if ([51, 53, 55, 56, 57].includes(value)) return { code: 'Drizzle', text: 'llovizna' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return { code: 'Rain', text: 'lluvia' };
    if ([71, 73, 75, 77, 85, 86].includes(value)) return { code: 'Snow', text: 'nieve' };
    if ([95, 96, 99].includes(value)) return { code: 'Thunderstorm', text: 'tormenta' };
    return { code: '', text: 'condiciones variables' };
  }

  formatResult({ cityName, currentTemp, currentMin, currentMax, currentCondition, tomorrow }) {
    const updated = new Date().toLocaleString('es-HN', {
      timeZone: 'America/Tegucigalpa', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return `🌦️ *Clima en ${cityName}*\n\n`
      + `*Ahora:* ${this.getWeatherEmoji(currentCondition.code, currentTemp)} ${currentTemp} °C · ${currentCondition.text}\n`
      + `Mín. ${currentMin} °C · Máx. ${currentMax} °C\n\n`
      + `*Mañana:* ${this.getWeatherEmoji(tomorrow.conditionCode, tomorrow.temp)} ${tomorrow.temp} °C · ${tomorrow.condition}\n`
      + `Mín. ${tomorrow.min} °C · Máx. ${tomorrow.max} °C · Lluvia ${tomorrow.rainProbability}%\n\n`
      + `📌 ${this.generateRecommendation(currentTemp, tomorrow.rainProbability)}\n\n`
      + `_Actualizado ${updated}_`;
  }

  async getOpenMeteoForecast(query) {
    const locationResponse = await this.fallbackHttp.get(this.geocodingUrl, {
      params: { name: query, count: 1, language: 'es', format: 'json' }
    });
    const location = locationResponse.data?.results?.[0];
    if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
      return weatherError('CITY_NOT_FOUND', `No encontramos *${query}*. Revisa el nombre e incluye el país, por ejemplo: *Tela, Honduras*.`);
    }
    const forecastResponse = await this.fallbackHttp.get(this.forecastUrl, {
      params: {
        latitude: location.latitude,
        longitude: location.longitude,
        current: 'temperature_2m,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'auto',
        forecast_days: 2
      }
    });
    const payload = forecastResponse.data;
    const daily = payload?.daily;
    const values = [payload?.current?.temperature_2m, daily?.temperature_2m_min?.[0], daily?.temperature_2m_max?.[0],
      daily?.temperature_2m_min?.[1], daily?.temperature_2m_max?.[1], daily?.precipitation_probability_max?.[1]];
    if (!values.every((value) => Number.isFinite(Number(value))) || daily?.weather_code?.[1] === undefined) {
      logger.warn('Proveedor de clima devolvió una respuesta incompleta', { provider: 'open-meteo' });
      return weatherError('INCOMPLETE_RESPONSE', 'El proveedor respondió sin todos los datos necesarios. Intenta nuevamente en unos minutos.');
    }
    const currentTemp = Math.round(Number(payload.current.temperature_2m));
    const currentCondition = this.openMeteoCondition(payload.current.weather_code);
    const tomorrowCondition = this.openMeteoCondition(daily.weather_code[1]);
    const tomorrow = {
      temp: Math.round((Number(daily.temperature_2m_min[1]) + Number(daily.temperature_2m_max[1])) / 2),
      min: Math.round(Number(daily.temperature_2m_min[1])),
      max: Math.round(Number(daily.temperature_2m_max[1])),
      condition: tomorrowCondition.text,
      conditionCode: tomorrowCondition.code,
      rainProbability: Math.round(Number(daily.precipitation_probability_max[1]))
    };
    const cityName = [location.name, location.admin1, location.country_code].filter(Boolean).join(', ');
    return {
      success: true,
      message: this.formatResult({
        cityName, currentTemp,
        currentMin: Math.round(Number(daily.temperature_2m_min[0])),
        currentMax: Math.round(Number(daily.temperature_2m_max[0])),
        currentCondition, tomorrow
      }),
      city: cityName,
      provider: 'open-meteo',
      data: { today: { temp: currentTemp, min: Math.round(Number(daily.temperature_2m_min[0])), max: Math.round(Number(daily.temperature_2m_max[0])) }, tomorrow }
    };
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
    if (query.length < 2 || query.length > 80 || !/^[\p{L}\s,.'-]+$/u.test(query)) {
      return weatherError('INVALID_CITY', 'No reconocí la ciudad. Escribe un nombre como *Tela, Honduras* o *San Pedro Sula, Honduras*.');
    }
    if (!this.apiKey && !this.enableFallback) {
      return weatherError('NOT_CONFIGURED', '🌦️ El pronóstico no está configurado en este momento. Puedes intentar otra operación o volver al menú principal.');
    }

    try {
      if (!this.apiKey) return await this.getOpenMeteoForecast(query);
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
      const message = this.formatResult({
        cityName: cityName || query, currentTemp: todayTemp, currentMin: todayMin, currentMax: todayMax,
        currentCondition: { code: current.weather[0].main, text: todayCondition }, tomorrow
      });
      return { success: true, message, city: cityName || query, provider: 'openweathermap', data: { today: { temp: todayTemp, min: todayMin, max: todayMax }, tomorrow } };
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
        message = 'La consulta del clima de Tela tardó demasiado. Puedes intentar actualizarla o volver al menú.';
      } else if (!error.response) {
        code = 'NETWORK_ERROR';
        message = 'No pudimos conectarnos con el servicio de clima. Intenta nuevamente en unos minutos.';
      }
      logger.warn('Fallo controlado del proveedor de clima', { provider: this.apiKey ? 'openweathermap' : 'open-meteo', status, code });
      return weatherError(code, `🌦️ ${message}`);
    }
  }
}

module.exports = WeatherService;
module.exports.localParts = localParts;
