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
  const packageDir = path.join(packagesDir, pkg);
  const tsconfigPath = path.join(packageDir, 'tsconfig.json');
  const srcDir = path.join(packageDir, 'src');

  // Check if tsconfig.json exists and src directory exists
  if (fs.existsSync(tsconfigPath) && fs.existsSync(srcDir)) {
    console.log(`Generating Typedoc for ${pkg}`);
    const outputDir = path.join(docsDir, pkg);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    try {
      execSync(
        `typedoc`,
        { stdio: 'inherit', cwd: packageDir }
      );

      // Rename index.md to ${pkg}.md
      const indexPath = path.join(outputDir, 'index.md');
      const newIndexPath = path.join(outputDir, `${pkg}.md`);
      if (fs.existsSync(indexPath)) {
        fs.renameSync(indexPath, newIndexPath);
      }

      // Add front matter to the main markdown file
      const mainMdPath = newIndexPath;
      if (fs.existsSync(mainMdPath)) {
        let content = fs.readFileSync(mainMdPath, 'utf8');
        const frontMatter = `---
title: "${pkg} API"
sidebar_label: "${pkg}"
---

`;
        content = frontMatter + content;
        fs.writeFileSync(mainMdPath, content, 'utf8');
      }

    } catch (error) {
      console.error(`Failed to generate Typedoc for ${pkg}`);
    }
  } else {
    console.log(`Skipping Typedoc generation for ${pkg} (not a TypeScript package or missing src directory)`);
  }
});
