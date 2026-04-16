const bcrypt = require('bcryptjs');
const { pool } = require('../src/infrastructure/database/pool');

async function seed() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ?', ['owner@example.com']);

  if (existingUsers.length) {
    console.log('Demo data already exists.');
    await pool.end();
    return;
  }

  const [userResult] = await pool.execute(
    `
      INSERT INTO users (full_name, email, password_hash)
      VALUES (?, ?, ?)
    `,
    ['Demo Owner', 'owner@example.com', passwordHash],
  );

  const ownerId = userResult.insertId;

  const [eventResult] = await pool.execute(
    `
      INSERT INTO events (
        owner_id,
        name,
        description,
        start_date,
        end_date,
        location,
        status
      )
      VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY), ?, ?)
    `,
    [ownerId, 'Demo Festival', 'Sample seeded event for local development.', 'Riga Arena', 'active'],
  );

  await pool.execute(
    `
      INSERT INTO event_users (event_id, user_id, role)
      VALUES (?, ?, ?)
    `,
    [eventResult.insertId, ownerId, 'owner'],
  );

  console.log('Demo data created. Login: owner@example.com / Password123!');
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
