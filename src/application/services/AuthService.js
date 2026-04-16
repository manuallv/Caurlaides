const { AppError } = require('../../shared/errors/AppError');
const { comparePassword, hashPassword } = require('../../infrastructure/security/password');
const { DEFAULT_LOCALE, translate } = require('../../shared/i18n');

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
}

class AuthService {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async register({ fullName, email, password }, t) {
    const tx = resolveTranslate(t);
    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new AppError(tx('service.auth.userExists'), 409);
    }

    const passwordHash = await hashPassword(password);

    return this.userRepository.create({
      fullName,
      email,
      passwordHash,
    });
  }

  async login({ email, password }, t) {
    const tx = resolveTranslate(t);
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new AppError(tx('service.auth.invalidCredentials'), 401);
    }

    if (!user.is_active || user.deleted_at) {
      throw new AppError(tx('service.auth.invalidCredentials'), 401);
    }

    const passwordMatches = await comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      throw new AppError(tx('service.auth.invalidCredentials'), 401);
    }

    await this.userRepository.touchLastLogin(user.id);

    return this.userRepository.findById(user.id);
  }
}

module.exports = { AuthService };
