#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';

async function updatePackageJson() {
  try {
    const packagePath = path.resolve(process.cwd(), 'dist/package.json');

    // Read the existing package.json
    const data = await fs.readFile(packagePath, 'utf-8');
    const packageJson = JSON.parse(data);

    // Modify the "name" field
    packageJson.name = "@notemine/core";

    // Add the "exports" field
    packageJson.exports = {
      ".": {
        "types": "./notemine.d.ts",
        "import": "./notemine.js",
        "require": "./notemine.js"
      },
      "./wasm": {
        "import": "./notemine_bg.wasm",
        "require": "./notemine_bg.wasm" 
      }
    };

    // Remove the "main" and "types" fields as they are now covered by "exports"
    delete packageJson.main;
    delete packageJson.types;

    // Write the updated package.json back to the file with 2-space indentation
    const updatedData = JSON.stringify(packageJson, null, 2) + '\n';
    await fs.writeFile(packagePath, updatedData, 'utf-8');

    console.log('package.json has been successfully updated.');
  } catch (error) {
    console.error('Error updating package.json:', error);
    process.exit(1);
  }
}

updatePackageJson();
