const { body } = require('express-validator');

function preserveEmailLocalPart(value) {
  return String(value || '').trim().toLowerCase();
}

const registerValidator = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage((value, { req }) => req.t('validation.auth.fullNameLength', { min: 2, max: 120 })),
  body('email')
    .trim()
    .isEmail()
    .withMessage((value, { req }) => req.t('validation.auth.email'))
    .customSanitizer(preserveEmailLocalPart),
  body('password')
    .isLength({ min: 8 })
    .withMessage((value, { req }) => req.t('validation.auth.passwordLength', { min: 8 })),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage((value, { req }) => req.t('validation.auth.confirmPassword')),
];

const loginValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage((value, { req }) => req.t('validation.auth.email'))
    .customSanitizer(preserveEmailLocalPart),
  body('password')
    .notEmpty()
    .withMessage((value, { req }) => req.t('validation.auth.passwordRequired')),
];

const forgotPasswordValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage((value, { req }) => req.t('validation.auth.email'))
    .customSanitizer(preserveEmailLocalPart),
];

const resetPasswordValidator = [
  body('password')
    .isLength({ min: 8 })
    .withMessage((value, { req }) => req.t('validation.auth.passwordLength', { min: 8 })),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage((value, { req }) => req.t('validation.auth.confirmPassword')),
];

module.exports = {
  forgotPasswordValidator,
  loginValidator,
  registerValidator,
  resetPasswordValidator,
};
