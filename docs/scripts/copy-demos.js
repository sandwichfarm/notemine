const fs = require('fs-extra');
const path = require('path');

const demosSrc = path.resolve(__dirname, '../../demos');
const demosDest = path.resolve(__dirname, '../docs/demos');

fs.copySync(demosSrc, demosDest);
console.log('Copied demos');