const { AppError } = require('../../shared/errors/AppError');
const { comparePassword, hashPassword } = require('../../infrastructure/security/password');

class AuthService {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async register({ fullName, email, password }) {
    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new AppError('A user with that email already exists.', 409);
    }

    const passwordHash = await hashPassword(password);

    return this.userRepository.create({
      fullName,
      email,
      passwordHash,
    });
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new AppError('Invalid email or password.', 401);
    }

    const passwordMatches = await comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      throw new AppError('Invalid email or password.', 401);
    }

    await this.userRepository.touchLastLogin(user.id);

    return this.userRepository.findById(user.id);
  }
}

module.exports = { AuthService };
