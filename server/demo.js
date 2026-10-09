// Entry point for `npm run demo`. Setting the variable here (rather than in the npm
// script) keeps it working on Windows as well as macOS and Linux.
process.env.DEMO_MODE = '1';
require('./server').start();
