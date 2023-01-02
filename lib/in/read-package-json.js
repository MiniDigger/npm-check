import {readFileSync} from 'fs';
import extend from 'xtend';

function readPackageJson(filename) {
    let pkg;
    let error;
    try {
        pkg = JSON.parse(readFileSync(
            filename,
            {encoding: 'utf8'}
        ));
    } catch (error_) {
        error = error_.code === 'MODULE_NOT_FOUND' ?
            new Error(`A package.json was not found at ${filename}`) :
            new Error(`A package.json was found at ${filename}, but it is not valid: ${error_.code}: ${error_.message}`);
    }

    return extend({devDependencies: {}, dependencies: {}, error}, pkg);
}

export default readPackageJson;
