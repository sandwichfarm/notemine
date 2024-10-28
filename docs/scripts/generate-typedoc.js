const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packagesDir = path.resolve(__dirname, '../../packages');
const docsDir = path.resolve(__dirname, '../docs/api');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const packages = fs.readdirSync(packagesDir);

packages.forEach(pkg => {
  const srcDir = path.join(packagesDir, pkg, 'src');
  if (fs.existsSync(srcDir)) {
    console.log(`Generating Typedoc for ${pkg}`);
    const outputDir = path.join(docsDir, pkg);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    try {
      execSync(
        `typedoc --plugin typedoc-plugin-markdown --out ${outputDir} ${srcDir}`,
        { stdio: 'inherit' }
      );
    } catch (error) {
      console.error(`Failed to generate Typedoc for ${pkg}`);
    }
  }
});
