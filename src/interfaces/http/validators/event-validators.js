const { body } = require('express-validator');
const { EVENT_ROLE_OPTIONS } = require('../../../shared/constants/event-roles');

const EVENT_STATUSES = ['draft', 'active', 'completed', 'archived'];

const eventValidator = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 160 })
    .withMessage('Event name must be between 2 and 160 characters.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 3000 })
    .withMessage('Description must be shorter than 3000 characters.'),
  body('location')
    .trim()
    .isLength({ min: 2, max: 190 })
    .withMessage('Location must be between 2 and 190 characters.'),
  body('status')
    .isIn(EVENT_STATUSES)
    .withMessage('Invalid event status.'),
  body('startDate')
    .notEmpty()
    .withMessage('Start date is required.')
    .isISO8601()
    .withMessage('Start date is invalid.'),
  body('endDate')
    .notEmpty()
    .withMessage('End date is required.')
    .isISO8601()
    .withMessage('End date is invalid.')
    .custom((value, { req }) => new Date(value) >= new Date(req.body.startDate))
    .withMessage('End date must be after the start date.'),
  body('passRequestDeadline')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Pass request deadline is invalid.'),
  body('wristbandRequestDeadline')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Wristband request deadline is invalid.'),
];

const memberValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid user email.')
    .normalizeEmail(),
  body('role')
    .isIn(EVENT_ROLE_OPTIONS.filter((role) => role !== 'owner'))
    .withMessage('Invalid collaborator role.'),
];

const memberRoleValidator = [
  body('role')
    .isIn(EVENT_ROLE_OPTIONS.filter((role) => role !== 'owner'))
    .withMessage('Invalid collaborator role.'),
];

const categoryValidator = [
  body('type')
    .isIn(['pass', 'wristband'])
    .withMessage('Invalid category type.'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Category name must be between 2 and 120 characters.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 3000 })
    .withMessage('Description must be shorter than 3000 characters.'),
  body('quota')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Quota must be a positive whole number.'),
  body('sortOrder')
    .optional({ values: 'falsy' })
    .isInt({ min: 0, max: 9999 })
    .withMessage('Sort order must be between 0 and 9999.'),
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
