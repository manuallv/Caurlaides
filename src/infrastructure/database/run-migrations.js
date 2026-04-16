const fs = require('fs');
const path = require('path');

const migrationsDirectory = path.resolve(__dirname, '../../../db/migrations');

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getExecutedMigrations(connection) {
  const [rows] = await connection.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function runMigrations(pool) {
  if (!fs.existsSync(migrationsDirectory)) {
    return [];
  }

  const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (!migrationFiles.length) {
    return [];
  }

  const connection = await pool.getConnection();

  try {
    await ensureMigrationsTable(connection);
    const executedMigrations = await getExecutedMigrations(connection);
    const appliedMigrations = [];

    for (const file of migrationFiles) {
      if (executedMigrations.has(file)) {
        continue;
      }

      const filePath = path.join(migrationsDirectory, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const statements = splitSqlStatements(sql);

      for (const statement of statements) {
        await connection.query(statement);
      }

      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      appliedMigrations.push(file);
    }

    return appliedMigrations;
  } finally {
    connection.release();
  }
}

module.exports = { runMigrations };
