#!/usr/bin/env node
import meow from "meow";

import detectPreferredPM from "preferred-pm";
import { packageDirectorySync } from "pkg-dir";
import debug from "../lib/state/debug.js";
import updateAll from "../lib/out/update-all.js";
import interactiveUpdate from "../lib/out/interactive-update.js";
import staticOutput from "../lib/out/static-output.js";
import npmCheck from "../lib/index.js";
import createCallsiteRecord from "callsite-record";
import isCI from "is-ci";
import updateNotifier from "update-notifier";
import {readFileSync} from "fs";

const pkg = JSON.parse(readFileSync(
    new URL('../package.json', import.meta.url),
    { encoding: 'utf8' },
));

updateNotifier({pkg}).notify();

/* eslint-disable indent */
const cli = meow(`
        Usage
          $ npm-check-updated <path> <options>

        Path
          Where to check. Defaults to current directory. Use -g for checking global modules.

        Options
          -u, --update              Interactive update.
          -y, --update-all          Uninteractive update. Apply all updates without prompting.
          -g, --global              Look at global modules.
          -s, --skip-unused         Skip check for unused packages.
          -p, --production          Skip devDependencies.
          -d, --dev-only            Look at devDependencies only (skip dependencies).
          -i, --ignore              Ignore dependencies based on succeeding glob.
          -E, --save-exact          Save exact version (x.y.z) instead of caret (^x.y.z) in package.json.
          -l, --legacy-peer-deps    Disable automatic installation of peer dependencies.
          --specials                List of depcheck specials to include in check for unused dependencies.
          --no-color                Force or disable color output.
          --no-emoji                Remove emoji support. No emoji in default in CI environments.
          --debug                   Show debug output. Throw in a gist when creating issues on github.

        Examples
          $ npm-check-updated           # See what can be updated, what isn't being used.
          $ npm-check-updated ../foo    # Check another path.
          $ npm-check-updated -gu       # Update globally installed modules by picking which ones to upgrade.
    `,
    {
    	importMeta: import.meta,
        flags: {
            update: {
                type: 'boolean',
                alias: 'u'
            },
            updateAll: {
                type: 'boolean',
                alias: 'y'
            },
            global: {
                type: 'boolean',
                alias: 'g'
            },
            skipUnused: {
                type: 'boolean',
                alias: 's'
            },
            production: {
                type: 'boolean',
                alias: 'p'
            },
            devOnly: {
                type: 'boolean',
                alias: 'd'
            },
            saveExact: {
                type: 'boolean',
                alias: 'E'
            },
            ignore: {
                type: 'string',
                alias: 'i'
            },
            legacyPeerDeps: {
                type: 'boolean',
                alias: 'l'
            },
            specials: {
                type: 'string'
            },
            color: {
                type: 'boolean'
            },
            emoji: {
                type: 'boolean',
                default: !isCI
            },
            debug: {
                type: 'boolean'
            },
            spinner: {
                type: 'boolean',
                default: !isCI
            }
        }
    });

/* eslint-enable indent */

const options = {
    cwd: cli.input[0] || packageDirectorySync() || process.cwd(),
    update: cli.flags.update,
    updateAll: cli.flags.updateAll,
    global: cli.flags.global,
    skipUnused: cli.flags.skipUnused,
    ignoreDev: cli.flags.production,
    devOnly: cli.flags.devOnly,
    saveExact: cli.flags.saveExact,
    specials: cli.flags.specials,
    emoji: cli.flags.emoji,
    installer: process.env.NPM_CHECK_INSTALLER || 'auto',
    debug: cli.flags.debug,
    spinner: cli.flags.spinner,
    ignore: cli.flags.ignore,
    legacyPeerDeps: cli.flags.legacyPeerDeps,
};

if (options.debug) {
    debug('cli.flags', cli.flags);
    debug('cli.input', cli.input);
}

Promise.resolve()
    .then(() => {
        return options.installer === 'auto' ?
            detectPreferredInstaller(options.cwd) :
            options.installer;
    })
    .then(installer => {
        options.installer = installer;
        return npmCheck(options);
    })
    .then(currentState => {
        currentState.inspectIfDebugMode();

        if (options.updateAll) {
            return updateAll(currentState);
        }

        if (options.update) {
            return interactiveUpdate(currentState);
        }

        return staticOutput(currentState);
    })
    .catch(error => {
        console.error(error.message);

        if (options.debug) {
            console.log(createCallsiteRecord(error).renderSync());
        } else {
            console.log('For more detail, add `--debug` to the command');
        }

        process.exit(1);
    });

const SUPPORTED_INSTALLERS = new Set(['npm', 'pnpm', 'ied', 'yarn']);

async function detectPreferredInstaller(cwd) {
    const preferredPM = await detectPreferredPM(cwd);
    return preferredPM && SUPPORTED_INSTALLERS.has(preferredPM.name) ? preferredPM.name : 'npm';
}
