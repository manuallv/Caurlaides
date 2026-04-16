const fs = require('fs');
const path = require('path');
const { env } = require('../src/config/env');

const sourcePath = env.designAssetsSource;
const targetPath = path.resolve(__dirname, '../public/design-assets');

if (!sourcePath) {
  console.error('Set DESIGN_ASSETS_SOURCE in .env before running this script.');
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Design asset source not found: ${sourcePath}`);
  process.exit(1);
}

fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
console.log(`Design assets copied to ${targetPath}`);
