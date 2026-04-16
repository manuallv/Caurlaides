const fs = require('fs');
const path = require('path');

const compiledCssPath = path.resolve(__dirname, '../public/css/app.css');

if (!fs.existsSync(compiledCssPath)) {
  console.error('Missing precompiled CSS file at public/css/app.css');
  console.error('Run `npm run build:css` locally before deploying.');
  process.exit(1);
}

console.log('Using committed production assets. No Tailwind build step is required on the server.');
