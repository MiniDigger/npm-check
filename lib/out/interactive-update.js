import _ from 'lodash';
import inquirer from 'inquirer';
import chalk from 'chalk';
import table from 'text-table';
import installPackages from './install-packages.js';
import emoji from './emoji.js';
import stripAnsi from 'strip-ansi';

const UI_GROUPS = [
    {
        title: chalk.bold.underline.green('Update package.json to match version installed.'),
        filter: {mismatch: true, bump: null}
    },
    {
        title: `${chalk.bold.underline.green('Missing.')} ${chalk.green('You probably want these.')}`,
        filter: {notInstalled: true, bump: null}
    },
    {
        title: `${chalk.bold.underline.green('Patch Update')} ${chalk.green('Backwards-compatible bug fixes.')}`,
        filter: {bump: 'patch'}
    },
    {
        title: `${chalk.yellow.underline.bold('Minor Update')} ${chalk.yellow('New backwards-compatible features.')}`,
        bgColor: 'yellow',
        filter: {bump: 'minor'}
    },
    {
        title: `${chalk.red.underline.bold('Major Update')} ${chalk.red('Potentially breaking API changes. Use caution.')}`,
        filter: {bump: 'major'}
    },
    {
        title: `${chalk.magenta.underline.bold('Non-Semver')} ${chalk.magenta('Versions less than 1.0.0, caution.')}`,
        filter: {bump: 'nonSemver'}
    },
    {
        title: `${chalk.magenta.underline.bold('Prerelease')} ${chalk.magenta('Unstable version, caution.')}`,
        filter: {bump: 'prerelease'}
    }
];

function label(pkg) {
    const bumpInstalled = pkg.bump ? pkg.installed : '';
    const installed = pkg.mismatch ? pkg.packageJson : bumpInstalled;
    const name = chalk.yellow(pkg.moduleName);
    const type = pkg.devDependency ? chalk.green(' devDep') : '';
    const missing = pkg.notInstalled ? chalk.red(' missing') : '';
    const homepage = pkg.homepage ? chalk.blue.underline(pkg.homepage) : '';
    return [
        name + type + missing,
        installed,
        installed && '❯',
        chalk.bold(pkg.latest || ''),
        pkg.latest ? homepage : pkg.regError || pkg.pkgError
    ];
}

function short(pkg) {
    return `${pkg.moduleName}@${pkg.latest}`;
}

function choice(pkg) {
    if (!pkg.mismatch && !pkg.bump && !pkg.notInstalled) {
        return false;
    }

    return {
        value: pkg,
        name: label(pkg),
        short: short(pkg)
    };
}

function unselectable(options) {
    return new inquirer.Separator(chalk.reset(options ? options.title : ' '));
}

function createChoices(packages, options) {
    const filteredChoices = _.filter(packages, options.filter);

    const choices = filteredChoices.map(choice)
        .filter(Boolean);

    const choicesAsATable = table(_.map(choices, 'name'), {
        align: ['l', 'l', 'l'],
        stringLength(string) {
            return stripAnsi(string).length;
        }
    }).split('\n');

    const choicesWithTableFormating = _.map(choices, (choice, i) => {
        choice.name = choicesAsATable[i];
        return choice;
    });

    if (choicesWithTableFormating.length > 0) {
        choices.unshift(unselectable(options));
        choices.unshift(unselectable());
        return choices;
    }
}

function buildPackageToUpdate(moduleName, version, isYarn, saveExact) {
    // Handle adding ^ for yarn, npm seems to handle this if not exact
    return (isYarn && !saveExact) ? moduleName + '@^' + version : moduleName + '@' + version;
}

function interactive(currentState) {
    const packages = currentState.get('packages');

    if (currentState.get('debug')) {
        console.log('packages', packages);
    }

    packages.forEach(info => {
        if (info.regError) {
            console.log(`${emoji(':x:')}  ${chalk.red(`Error(${info.moduleName}): ${info.regError}`)}`);
        }

        if (info.pkgError) {
            console.log(`${emoji(':x:')}  ${chalk.red(`Error(${info.moduleName}): ${info.pkgError}`)}`);
        }
    });

    const choicesGrouped = UI_GROUPS.map(group => createChoices(packages, group))
        .filter(Boolean);

    const choices = _.flatten(choicesGrouped);

    if (choices.length === 0) {
        console.log(`${emoji(':heart:  ')}Your modules look ${chalk.bold('amazing')}. Keep up the great work.${emoji(' :heart:')}`);
        return;
    }

    choices.push(unselectable());
    choices.push(unselectable({title: 'Space to select. Enter to start upgrading. Control-C to cancel.'}));

    const questions = [
        {
            name: 'packages',
            message: 'Choose which packages to update.',
            type: 'checkbox',
            choices: choices.concat(unselectable()),
            pageSize: process.stdout.rows - 2
        }
    ];

    return inquirer.prompt(questions).then(answers => {
        const packagesToUpdate = answers.packages;
        const isYarn = currentState.get('installer') === 'yarn';
        const saveExact = currentState.get('saveExact');

        if (!packagesToUpdate || packagesToUpdate.length === 0) {
            console.log('No packages selected for update.');
            return false;
        }

        const saveDependencies = packagesToUpdate
            .filter(pkg => !pkg.devDependency)
            .map(pkg => buildPackageToUpdate(pkg.moduleName, pkg.latest, isYarn, saveExact));

        const saveDevDependencies = packagesToUpdate
            .filter(pkg => pkg.devDependency)
            .map(pkg => buildPackageToUpdate(pkg.moduleName, pkg.latest, isYarn, saveExact));

        const updatedPackages = packagesToUpdate
            .map(pkg => buildPackageToUpdate(pkg.moduleName, pkg.latest, isYarn, saveExact)).join(', ');

        if (!currentState.get('global')) {
            if (saveDependencies.length > 0) {
                !isYarn && saveDependencies.push('--save');
            }

            if (saveDevDependencies.length > 0) {
                isYarn ? saveDevDependencies.push('--dev') : saveDevDependencies.push('--save-dev');
            }
        }

        return installPackages(saveDependencies, currentState)
            .then(currentState => installPackages(saveDevDependencies, currentState))
            .then(currentState => {
                console.log('');
                console.log(chalk.green('[npm-check] Update complete!'));
                console.log(chalk.green('[npm-check] ' + updatedPackages));
                console.log(chalk.green('[npm-check] You should re-run your tests to make sure everything works with the updates.'));
                return currentState;
            });
    });
}

export default interactive;
