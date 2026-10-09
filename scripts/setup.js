// `npm run setup`: install both apps and build the web app.
//
// This is a script rather than a chain of npm commands because npm hands its settings
// to the commands it runs. If someone has an `allow-scripts` setting in their own npm
// config, it would be passed to the nested `npm install` and clash with this project's
// `allowScripts` list ("--allow-scripts is not allowed in project-scoped installs").
// Running each step with that setting removed avoids it. Plain `npm install` from a
// terminal is unaffected.

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

// A copy of the environment without any `allow-scripts` setting
function cleanEnv(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^npm_config_allow[-_]scripts/i.test(key)) delete env[key];
  }
  return env;
}

const steps = [
  ['Installing the server', ['install']],
  ['Installing the web app', ['install', '--prefix', 'client']],
  ['Building the web app', ['run', 'build', '--prefix', 'client']]
];

function main() {
  const env = cleanEnv();

  for (const [label, args] of steps) {
    console.log(`\n> ${label} (npm ${args.join(' ')})`);
    // Windows needs a shell to run npm (it is npm.cmd there); the arguments are fixed, not user input
    const result = spawnSync('npm', args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });

    if (result.error || result.status !== 0) {
      console.error(`\nSetup stopped: "${label}" failed${result.error ? ` (${result.error.message})` : ''}.`);
      console.error('Check that Node.js is version 20.17 or newer (run: node -v), then try again.');
      process.exit(result.status || 1);
    }
  }

  console.log('\nAll set. Start the app with "npm start", or try the sample data with "npm run demo".');
}

if (require.main === module) main();

module.exports = { cleanEnv, steps };
