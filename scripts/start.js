if (process.env.DEPLOY_IMPORT_MODE === 'true') require('./import-server');
else require('../src/server');
