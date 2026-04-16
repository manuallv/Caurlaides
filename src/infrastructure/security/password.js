const bcrypt = require('bcryptjs');

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
}

async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = {
  comparePassword,
  hashPassword,
};
