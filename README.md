# Caurlaides

Professional, mobile-friendly event pass and wristband management system built with Node.js, Express, MySQL, EJS, Tailwind CSS, and Socket.IO.

## Current delivery status

This repository now includes the Phase 1 foundation requested in the brief:

- User registration and login
- Secure session-based authentication
- Event creation, editing, and deletion
- Per-event collaboration with `owner`, `admin`, and `staff` roles
- Event dashboards with overview cards and recent activity
- Pass category management
- Wristband category management
- Event-level audit log
- Socket.IO room setup and lightweight dashboard refresh hooks
- Tailwind-based responsive admin UI adapted toward the provided WorldNIC design direction
- Database schema for current and future phases

Future database tables for pass requests, wristband requests, request profiles, and quotas are already included in the schema so later phases can build on the same foundation cleanly.

## Tech stack

- Node.js 20+
- Express
- EJS
- MySQL
- Tailwind CSS
- Socket.IO

## Project structure

```text
.
├── db/
│   └── schema.sql
├── public/
│   ├── css/
│   ├── design-assets/
│   └── js/
├── scripts/
│   ├── seed-demo.js
│   └── sync-design-assets.js
├── src/
│   ├── application/
│   ├── config/
│   ├── domain/
│   ├── infrastructure/
│   ├── interfaces/
│   ├── shared/
│   ├── styles/
│   └── views/
├── .env.example
├── package.json
└── README.md
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

3. Create the MySQL database and import the schema:

```bash
mysql -u root -p < db/schema.sql
```

4. Update `.env` with your local MySQL credentials and a strong `SESSION_SECRET`.

The app now auto-runs SQL files from `db/migrations/` on startup, so small schema upgrades are applied automatically during deploys.

5. Build Tailwind CSS locally:

```bash
npm run build:css
```

6. Start the development environment:

```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000)

## Optional demo seed

After importing the schema and configuring `.env`, you can create demo data:

```bash
npm run db:seed
```

Demo login:

- Email: `owner@example.com`
- Password: `Password123!`

## Design asset workflow

The provided design pack was found in this project under:

```text
dizains/React-WorldNIC-v1.0-29_May_2025/
```

I already extracted a small starter subset of the provided assets into:

```text
public/design-assets/
```

That subset is used for the current shell styling reference and iconography.

If you want to import more of the supplied template files into the app, this project also includes a reusable sync workflow:

You can sync the provided design/template assets into the app like this:

1. Put the absolute source path into `.env`:

```env
DESIGN_ASSETS_SOURCE=/absolute/path/to/your/design/folder
```

2. Run:

```bash
npm run design:sync
```

3. Imported assets will be available under:

```text
public/design-assets/
```

The current UI intentionally follows the supplied template direction at the shell level while staying simple enough to keep extending feature pages quickly.

## Important routes

- `/login`
- `/register`
- `/dashboard`
- `/events/new`
- `/events/:eventId`
- `/events/:eventId/edit`
- `/events/:eventId/categories`
- `/events/:eventId/members`
- `/events/:eventId/activity`

## Security and production notes

- Passwords are hashed with bcrypt
- Sessions are stored in MySQL
- CSRF protection is enabled for form posts
- Event access is checked per user and per event
- Role-based authorization is enforced for event management actions
- Audit logging records important actions
- HTTP security headers are enabled with Helmet
- Compression is enabled for production-friendly delivery

## Hostinger notes

This repository is prepared so Hostinger can recognize it more reliably as an Express application:

- `package.json` is in the repository root
- `server.js` is in the repository root as the runtime entry point
- `start` script runs the server from the root entry point
- `.nvmrc` and `package.json` both target Node.js `20.x`
- compiled Tailwind CSS is included in `public/css/app.css`
- production `build` script does not require Tailwind on the server

If Hostinger still shows an unsupported structure warning, refresh the repository list after the first real push to `main`, because the remote repository was empty before publishing.

## Next recommended build phases

### Phase 2

- Pass management table
- Wristband management table
- Detailed per-record history
- Search, filter, sort, and status workflows

### Phase 3

- Public request portal with code login
- Request profiles with quotas and allowed category scopes
- Full live synchronization for tables and dashboard counters

### Phase 4

- Final UI polish against the provided design assets
- Mobile workflow optimization for staff usage
- Deployment hardening and QA

## Verification completed

- `npm install`
- `npm run build:css`
- `npm run build`
- App bootstrap smoke test with `node -e "const createApp = require('./src/app'); createApp(); console.log('app bootstrap ok');"`

## Notes

- Full MySQL-backed runtime startup was not executed because local `.env` database credentials were not provided in this workspace.
- The current collaboration flow adds existing registered users by email. If you want email invitation links in the next pass, that can be added cleanly on top of the existing event role model.
