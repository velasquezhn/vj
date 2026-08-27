const { runQuery, runExecute } = require('../db');

const KEYS = {
  percentage: 'payment_deposit_percentage',
  accounts: 'payment_bank_accounts',
  notes: 'payment_notes'
};

function normalizeAccounts(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))].slice(0, 10);
}

async function getPaymentSettings() {
  const rows = await runQuery(
    `SELECT setting_key, setting_value FROM AppSettings WHERE setting_key IN (?, ?, ?)`,
    [KEYS.percentage, KEYS.accounts, KEYS.notes]
  );
  const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  let accounts = [];
  try { accounts = normalizeAccounts(JSON.parse(values[KEYS.accounts] || '[]')); } catch { accounts = []; }
  const parsedPercentage = Number(values[KEYS.percentage] || 50);
  return {
    deposit_percentage: Number.isFinite(parsedPercentage) ? parsedPercentage : 50,
    bank_accounts: accounts,
    notes: String(values[KEYS.notes] || '').trim()
  };
}

async function setValue(key, value, adminId) {
  await runExecute(`INSERT INTO AppSettings(setting_key, setting_value, updated_at, updated_by)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value,
      updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by`, [key, value, adminId]);
}

async function updatePaymentSettings(input, adminId) {
  const percentage = Number(input.deposit_percentage);
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) {
    const error = new Error('El porcentaje debe ser un entero entre 1 y 100');
    error.code = 'INVALID_PAYMENT_PERCENTAGE';
    throw error;
  }
  const accounts = normalizeAccounts(input.bank_accounts);
  if (accounts.some((item) => item.length > 200)) {
    const error = new Error('Cada cuenta debe tener un máximo de 200 caracteres');
    error.code = 'INVALID_BANK_ACCOUNT';
    throw error;
  }
  const notes = String(input.notes || '').trim();
  if (notes.length > 500) {
    const error = new Error('Las instrucciones adicionales deben tener un máximo de 500 caracteres');
    error.code = 'INVALID_PAYMENT_NOTES';
    throw error;
  }
  await setValue(KEYS.percentage, String(percentage), adminId);
  await setValue(KEYS.accounts, JSON.stringify(accounts), adminId);
  await setValue(KEYS.notes, notes, adminId);
  return getPaymentSettings();
}

function paymentAmounts(total, percentage) {
  const normalizedTotal = Math.max(Number(total) || 0, 0);
  const deposit = Math.round(normalizedTotal * Number(percentage)) / 100;
  return { total: normalizedTotal, deposit, balance: Math.max(normalizedTotal - deposit, 0) };
}

module.exports = { getPaymentSettings, updatePaymentSettings, paymentAmounts, normalizeAccounts };
