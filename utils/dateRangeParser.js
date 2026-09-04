const chrono = require('chrono-node');
const dayjs = require('dayjs');
require('dayjs/locale/es');

const DEFAULT_TIME_ZONE = 'America/Tegucigalpa';
const MONTHS = Object.freeze({
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12
});

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function zonedToday(referenceDate = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(referenceDate);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

function compareDates(left, right) {
  return Date.UTC(left.year, left.month - 1, left.day) - Date.UTC(right.year, right.month - 1, right.day);
}

function isValidDateParts(parts) {
  if (!parts || parts.year < 1900 || parts.month < 1 || parts.month > 12 || parts.day < 1) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day;
}

function addDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function resolveMissingYears(rawDates, today) {
  let previous = null;
  return rawDates.map((raw, index) => {
    let year = raw.year;
    if (!year) {
      year = index === 0 ? today.year : previous.year;
      const candidate = { ...raw, year };
      if (index === 0 && compareDates(candidate, today) < 0) year += 1;
      else if (index > 0 && compareDates(candidate, previous) <= 0) year += 1;
    }
    const resolved = { day: raw.day, month: raw.month, year };
    previous = resolved;
    return resolved;
  });
}

function extractExplicitDates(text) {
  const matches = [];
  const occupied = [];
  const add = (match, value) => {
    const start = match.index;
    const end = start + match[0].length;
    if (occupied.some((range) => start < range.end && end > range.start)) return;
    occupied.push({ start, end });
    matches.push({ index: start, ...value });
  };

  for (const match of text.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    add(match, { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
  }
  for (const match of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?\b/g)) {
    let year = match[3] ? Number(match[3]) : null;
    if (year && year < 100) year += 2000;
    add(match, { year, month: Number(match[2]), day: Number(match[1]) });
  }

  const monthNames = Object.keys(MONTHS).join('|');
  const writtenPattern = new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+(${monthNames})(?:(?:\\s+de|\\s+del)?\\s+(\\d{4}))?\\b`, 'g');
  for (const match of text.matchAll(writtenPattern)) {
    add(match, { year: match[3] ? Number(match[3]) : null, month: MONTHS[match[2]], day: Number(match[1]) });
  }
  return matches.sort((a, b) => a.index - b.index).map(({ index, ...date }) => date);
}

function extractSameMonthRange(text) {
  const numericMatch = text.match(/(?<![\d./-])(\d{1,2})\s*(?:al|a|hasta|-)\s*(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?\b/i);
  if (numericMatch) {
    let year = numericMatch[4] ? Number(numericMatch[4]) : null;
    if (year && year < 100) year += 2000;
    return [
      { day: Number(numericMatch[1]), month: Number(numericMatch[3]), year },
      { day: Number(numericMatch[2]), month: Number(numericMatch[3]), year }
    ];
  }
  const monthNames = Object.keys(MONTHS).join('|');
  const pattern = new RegExp(`(?:del?\\s+)?(\\d{1,2})\\s*(?:al|a|hasta|-)\\s*(\\d{1,2})\\s*(?:de\\s+)?(${monthNames})(?:(?:\\s+de|\\s+del)?\\s+(\\d{4}))?`, 'i');
  const match = text.match(pattern);
  if (!match) return [];
  const year = match[4] ? Number(match[4]) : null;
  return [
    { day: Number(match[1]), month: MONTHS[match[3]], year },
    { day: Number(match[2]), month: MONTHS[match[3]], year }
  ];
}

function extractWithChrono(text, today) {
  // Chrono usa la zona horaria del proceso. Le damos el calendario de Honduras
  // al mediodía y leemos sus componentes, sin reconvertir el instante a otra zona.
  const chronoReference = new Date(today.year, today.month - 1, today.day, 12);
  const results = chrono.es.parse(text, chronoReference, { forwardDate: true });
  const dates = [];
  for (const result of results) {
    if (result.start) {
      dates.push({
        year: result.start.get('year'),
        month: result.start.get('month'),
        day: result.start.get('day')
      });
    }
    if (result.end) {
      dates.push({
        year: result.end.get('year'),
        month: result.end.get('month'),
        day: result.end.get('day')
      });
    }
    if (dates.length >= 2) break;
  }
  return dates.slice(0, 2);
}

function formatFecha(parts) {
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function asUtcDate(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

function formatFechaCompleta(parts) {
  return dayjs(asUtcDate(parts)).locale('es').format('DD [de] MMMM [de] YYYY');
}

function nombreDia(parts) {
  return dayjs(asUtcDate(parts)).locale('es').format('dddd');
}

function parseDateRange(texto, options = {}) {
  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return { error: 'Escribe la fecha de entrada y la fecha de salida.' };
  }

  const referenceDate = options.referenceDate || new Date();
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const today = zonedToday(referenceDate, timeZone);
  const text = normalizeText(texto);

  let rawDates = extractSameMonthRange(text);
  if (rawDates.length < 2) rawDates = extractExplicitDates(text);
  if (rawDates.length < 1) rawDates = extractWithChrono(String(texto).trim().toLowerCase(), today);

  const durationMatch = text.match(/\bpor\s+(\d{1,3})\s+noches?\b/);
  const dates = resolveMissingYears(rawDates.slice(0, 2), today);
  if (dates.length === 1 && durationMatch) {
    const nights = Number(durationMatch[1]);
    if (nights < 1) return { error: 'La cantidad de noches debe ser mayor que cero.' };
    dates.push(addDays(dates[0], nights));
  }
  if (dates.length < 2) {
    return { error: 'Necesito dos fechas: entrada y salida. También puedes indicar una fecha y “por 2 noches”.' };
  }

  const [entrada, salida] = dates;
  if (!isValidDateParts(entrada) || !isValidDateParts(salida)) {
    return { error: 'Una de las fechas no existe. Revisa el día, mes y año.' };
  }
  if (compareDates(entrada, today) < 0) {
    return { error: 'La fecha de entrada ya pasó. Escribe una fecha de hoy en adelante.' };
  }
  if (compareDates(salida, entrada) <= 0) {
    return { error: 'La salida debe ser después de la entrada y debe incluir al menos una noche.' };
  }

  const entradaStr = formatFecha(entrada);
  const salidaStr = formatFecha(salida);
  const diaEntrada = nombreDia(entrada);
  const diaSalida = nombreDia(salida);
  const noches = Math.round(compareDates(salida, entrada) / 86400000);
  return {
    entrada: entradaStr,
    salida: salidaStr,
    diaEntrada,
    diaSalida,
    noches,
    mensaje: `¿Confirmas entrada el ${diaEntrada} ${formatFechaCompleta(entrada)} a las 2:00 p. m. y salida el ${diaSalida} ${formatFechaCompleta(salida)} a las 11:00 a. m.?`,
    error: null
  };
}

function parseMessage(message, options) {
  try {
    const result = parseDateRange(message, options);
    if (result.error) return { isValid: false, error: result.error, message };
    return {
      isValid: true,
      start_date: result.entrada,
      end_date: result.salida,
      start_day: result.diaEntrada,
      end_day: result.diaSalida,
      nights: result.noches,
      original_message: message,
      parsed_message: result.mensaje
    };
  } catch {
    return { isValid: false, error: 'Error al procesar el mensaje de fechas', message };
  }
}

module.exports = { parseDateRange, parseMessage };
