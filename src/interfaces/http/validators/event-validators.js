const { body } = require('express-validator');
const { EVENT_ROLE_OPTIONS } = require('../../../shared/constants/event-roles');

const EVENT_STATUSES = ['draft', 'active', 'completed', 'archived'];

const eventValidator = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 160 })
    .withMessage((value, { req }) => req.t('validation.event.nameLength', { min: 2, max: 160 })),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 3000 })
    .withMessage((value, { req }) => req.t('validation.event.descriptionLength', { max: 3000 })),
  body('location')
    .trim()
    .isLength({ min: 2, max: 190 })
    .withMessage((value, { req }) => req.t('validation.event.locationLength', { min: 2, max: 190 })),
  body('status')
    .isIn(EVENT_STATUSES)
    .withMessage((value, { req }) => req.t('validation.event.status')),
  body('startDate')
    .notEmpty()
    .withMessage((value, { req }) => req.t('validation.event.startDateRequired'))
    .isISO8601()
    .withMessage((value, { req }) => req.t('validation.event.startDateInvalid')),
  body('endDate')
    .notEmpty()
    .withMessage((value, { req }) => req.t('validation.event.endDateRequired'))
    .isISO8601()
    .withMessage((value, { req }) => req.t('validation.event.endDateInvalid'))
    .custom((value, { req }) => new Date(value) >= new Date(req.body.startDate))
    .withMessage((value, { req }) => req.t('validation.event.endDateAfterStart')),
  body('passRequestDeadline')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage((value, { req }) => req.t('validation.event.passDeadlineInvalid')),
  body('wristbandRequestDeadline')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage((value, { req }) => req.t('validation.event.wristbandDeadlineInvalid')),
];

const memberValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage((value, { req }) => req.t('validation.member.email'))
    .normalizeEmail(),
  body('role')
    .isIn(EVENT_ROLE_OPTIONS.filter((role) => role !== 'owner'))
    .withMessage((value, { req }) => req.t('validation.member.role')),
];

const memberRoleValidator = [
  body('role')
    .isIn(EVENT_ROLE_OPTIONS.filter((role) => role !== 'owner'))
    .withMessage((value, { req }) => req.t('validation.member.role')),
];

const categoryValidator = [
  body('type')
    .isIn(['pass', 'wristband'])
    .withMessage((value, { req }) => req.t('validation.category.type')),
  body('name')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage((value, { req }) => req.t('validation.category.nameLength', { min: 2, max: 120 })),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 3000 })
    .withMessage((value, { req }) => req.t('validation.category.descriptionLength', { max: 3000 })),
  body('quota')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage((value, { req }) => req.t('validation.category.quota')),
  body('sortOrder')
    .optional({ values: 'falsy' })
    .isInt({ min: 0, max: 9999 })
    .withMessage((value, { req }) => req.t('validation.category.sortOrder', { min: 0, max: 9999 })),
];

const categoryUpdateValidator = categoryValidator.filter(
  (validator) => !validator.builder.fields.includes('type'),
);

module.exports = {
  categoryValidator,
  categoryUpdateValidator,
  eventValidator,
  memberRoleValidator,
  memberValidator,
};
