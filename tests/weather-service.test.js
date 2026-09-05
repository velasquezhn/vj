const WeatherService = require('../services/weatherService');

function unix(year, month, day, hour) {
  return Math.floor(Date.UTC(year, month - 1, day, hour) / 1000);
}

function successfulHttp() {
  const current = {
    name: 'Tela', sys: { country: 'HN' },
    main: { temp: 29.4, temp_min: 25.2, temp_max: 31.8 },
    weather: [{ main: 'Clouds', description: 'nubes dispersas' }]
  };
  const forecast = {
    city: { timezone: -21600 },
    list: [
      { dt: unix(2027, 1, 1, 12), main: { temp: 26, temp_min: 25, temp_max: 27 }, weather: [{ main: 'Rain', description: 'lluvia ligera' }], pop: 0.4 },
      { dt: unix(2027, 1, 1, 18), main: { temp: 30, temp_min: 29, temp_max: 31 }, weather: [{ main: 'Rain', description: 'lluvia ligera' }], pop: 0.8 }
    ]
  };
  return { get: jest.fn().mockResolvedValueOnce({ data: current }).mockResolvedValueOnce({ data: forecast }) };
}

describe('servicio de clima', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 11, 31, 18)));
  afterEach(() => jest.restoreAllMocks());

  test('consulta ciudad y pronóstico, incluso al cambiar de año', async () => {
    const http = successfulHttp();
    const result = await new WeatherService('test-key', { http }).getWeatherForecast('Tela, Honduras');
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Clima en Tela, HN/);
    expect(result.message).toMatch(/Mañana:/);
    expect(result.data.tomorrow.rainProbability).toBe(80);
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls[0][1].params.q).toBe('Tela, Honduras');
  });

  test.each([
    ['', 'NOT_CONFIGURED'],
    ['x', 'INVALID_CITY'],
    ['Tela123', 'INVALID_CITY']
  ])('rechaza configuración o ciudad inválida sin llamar al proveedor', async (city, code) => {
    const http = { get: jest.fn() };
    const key = code === 'NOT_CONFIGURED' ? '' : 'test-key';
    const result = await new WeatherService(key, { http }).getWeatherForecast(city);
    expect(result).toMatchObject({ success: false, code });
    expect(http.get).not.toHaveBeenCalled();
  });

  test.each([
    [{ response: { status: 404 } }, 'CITY_NOT_FOUND'],
    [{ response: { status: 401 } }, 'AUTH_ERROR'],
    [{ response: { status: 429 } }, 'RATE_LIMITED'],
    [{ code: 'ECONNABORTED' }, 'TIMEOUT'],
    [{ code: 'ENETUNREACH' }, 'NETWORK_ERROR'],
    [{ response: { status: 500 } }, 'PROVIDER_ERROR']
  ])('convierte fallos del proveedor en una respuesta recuperable', async (failure, code) => {
    const http = { get: jest.fn().mockRejectedValue(failure) };
    const result = await new WeatherService('test-key', { http }).getWeatherForecast('Tela, Honduras');
    expect(result).toMatchObject({ success: false, code });
    expect(result.message).toMatch(/intenta|revisa|servicio|conectarnos/i);
  });

  test('rechaza respuestas incompletas del proveedor', async () => {
    const http = { get: jest.fn().mockResolvedValue({ data: {} }) };
    const result = await new WeatherService('test-key', { http }).getWeatherForecast('Tela, Honduras');
    expect(result).toMatchObject({ success: false, code: 'INCOMPLETE_RESPONSE' });
  });
});
