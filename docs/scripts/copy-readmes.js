const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const packagesDir = path.resolve(__dirname, '../../packages');
const docsDir = path.resolve(__dirname, '../docs/packages');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const monoReadmeSrc = path.join(rootDir, 'README.md');
const monoReadmeDest = path.join(docsDir, `_index.md`);
fs.copyFileSync(monoReadmeSrc, monoReadmeDest);
console.log(`Copied monorepo README`);

const packages = fs.readdirSync(packagesDir);

packages.forEach(pkg => {
  const readmeSrc = path.join(packagesDir, pkg, 'README.md');
  const readmeDest = path.join(docsDir, `${pkg}.md`);

  if (fs.existsSync(readmeSrc)) {
    fs.copyFileSync(readmeSrc, readmeDest);
    console.log(`Copied README for ${pkg}`);
  }
});