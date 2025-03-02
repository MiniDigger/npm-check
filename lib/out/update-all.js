import chalk from 'chalk';
import installPackages from './install-packages.js';
import emoji from './emoji.js';

function buildPackageToUpdate(moduleName, version, isYarn, saveExact) {
    // Handle adding ^ for yarn, npm seems to handle this if not exact
    return (isYarn && !saveExact) ? moduleName + '@^' + version : moduleName + '@' + version;
}

function updateAll(currentState) {
    const packages = currentState.get('packages');

    if (currentState.get('debug')) {
        console.log('packages', packages);
    }

    const packagesToUpdate = packages.filter(packageEntry => packageEntry.mismatch || packageEntry.notInstalled || packageEntry.bump);

    if (packagesToUpdate.length === 0) {
        console.log(`${emoji(':heart:  ')}Your modules look ${chalk.bold('amazing')}. Keep up the great work.${emoji(' :heart:')}`);
        return;
    }

    const isYarn = currentState.get('installer') === 'yarn';
    const saveExact = currentState.get('saveExact');

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
            isYarn ?
                saveDevDependencies.push('--dev') :
                saveDevDependencies.push('--save-dev');
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
}

export default updateAll;
