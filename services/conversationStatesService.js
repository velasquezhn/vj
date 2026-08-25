const db = require('../db');

const getAllStates = async () => {
  try {
    const states = await db.runQuery('SELECT state_id AS id, user_number, state, data, created_at, updated_at FROM ConversationStates');
    return states;
  } catch (e) {
    console.error('Error loading conversation states:', e);
    return [];
  }
};

const getStateById = async (id) => {
  try {
    const states = await db.runQuery('SELECT state_id AS id, user_number, state, data, created_at, updated_at FROM ConversationStates WHERE state_id = ?', [id]);
    return states.length > 0 ? states[0] : null;
  } catch (e) {
    console.error('Error loading conversation state:', e);
    return null;
  }
};

const createState = async (stateData) => {
  try {
    const sql = `
      INSERT INTO ConversationStates (user_number, state, data, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `;
    const params = [
      stateData.user_number,
      stateData.state,
      JSON.stringify(stateData.data || {})
    ];
    const result = await db.runExecute(sql, params);
    return result.lastID ? true : false;
  } catch (e) {
    console.error('Error creating conversation state:', e);
    return false;
  }
};

const updateState = async (id, stateData) => {
  try {
    const sql = `
      UPDATE ConversationStates SET user_number = ?, state = ?, data = ?, updated_at = datetime('now')
      WHERE state_id = ?
    `;
    const params = [
      stateData.user_number,
      stateData.state,
      JSON.stringify(stateData.data || {}),
      id
    ];
    const result = await db.runExecute(sql, params);
    return result.changes > 0;
  } catch (e) {
    console.error('Error updating conversation state:', e);
    return false;
  }
};

const deleteState = async (id) => {
  try {
    const sql = `DELETE FROM ConversationStates WHERE state_id = ?`;
    const result = await db.runExecute(sql, [id]);
    return result.changes > 0;
  } catch (e) {
    console.error('Error deleting conversation state:', e);
    return false;
  }
};

module.exports = {
  getAllStates,
  getStateById,
  createState,
  updateState,
  deleteState
};
