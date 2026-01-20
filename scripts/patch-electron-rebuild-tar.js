const fs = require('fs');
const path = require('path');

const target = path.join(
  process.cwd(),
  'node_modules',
  '@electron',
  'rebuild',
  'lib',
  'clang-fetcher.js'
);

try {
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes("import * as tar from 'tar';")) {
    process.stdout.write('[patch-electron-rebuild-tar] already patched\n');
    process.exit(0);
  }

  const updated = source.replace(
    "import tar from 'tar';",
    "import * as tar from 'tar';"
  );

  if (updated === source) {
    process.stdout.write('[patch-electron-rebuild-tar] no change needed\n');
    process.exit(0);
  }

  fs.writeFileSync(target, updated, 'utf8');
  process.stdout.write('[patch-electron-rebuild-tar] applied\n');
} catch (error) {
  process.stdout.write('[patch-electron-rebuild-tar] skipped: missing file\n');
}
