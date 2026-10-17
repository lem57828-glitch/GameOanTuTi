const path = require('node:path');
const config = require('../src/config');
const { exportData } = require('./data-transfer');

try {
  const source = path.resolve(process.argv[2] || config.DB_FILE);
  const output = path.resolve(process.argv[3] || `deploy-snapshot/arena-${Date.now()}.json`);
  console.log(JSON.stringify({ output, ...exportData(source, output) }, null, 2));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
