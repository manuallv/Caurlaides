const mysql = require('mysql2/promise');
const dbConfig = require('../../config/database');

const pool = mysql.createPool(dbConfig);

module.exports = { pool };
