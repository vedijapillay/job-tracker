// `npm run setup` is the first command in the README, so its logic is tested.
// Background: npm passes its settings to the commands it runs. A user-level
// `allow-scripts` setting would reach the nested `npm install` and clash with this
// project's own `allowScripts` list, so the setup script removes it.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cleanEnv, steps } = require('../scripts/setup');

describe('npm run setup', () => {
  it('removes the allow-scripts setting that npm hands down', () => {
    const env = cleanEnv({ npm_config_allow_scripts: '@some/tool', 'npm_config_allow-scripts': 'x', NPM_CONFIG_ALLOW_SCRIPTS: 'y', PATH: '/usr/bin' });
    assert.deepEqual(Object.keys(env), ['PATH']);
  });

  it('keeps every other setting, including other npm_config ones', () => {
    const source = { PATH: '/usr/bin', HOME: '/home/me', npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'false' };
    assert.deepEqual(cleanEnv(source), source);
  });

  it('does not change the environment it was given', () => {
    const source = { npm_config_allow_scripts: 'x' };
    cleanEnv(source);
    assert.deepEqual(source, { npm_config_allow_scripts: 'x' });
  });

  it('installs the server, installs the web app, then builds it', () => {
    assert.deepEqual(steps.map(([, args]) => args.join(' ')), ['install', 'install --prefix client', 'run build --prefix client']);
  });

  it('is what the package script runs', () => {
    assert.equal(require('../package.json').scripts.setup, 'node scripts/setup.js');
  });
});
