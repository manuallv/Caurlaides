const { body } = require('express-validator');

const registerValidator = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Full name must be between 2 and 120 characters.'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long.'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Password confirmation does not match.'),
];

const loginValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
];

module.exports = {
  loginValidator,
  registerValidator,
};
