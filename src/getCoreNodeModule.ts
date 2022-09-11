import * as vscode from 'vscode';

/**
 * Returns a node module installed with VSCode, or null if it fails.
 * See: https://github.com/microsoft/vscode/issues/84439#issuecomment-552328194
 */
export function getCoreNodeModule(moduleName: string) {
	try {
			return require(`${vscode.env.appRoot}/node_modules.asar/${moduleName}`);
	} catch (err) { }

	try {
			return require(`${vscode.env.appRoot}/node_modules/${moduleName}`);
	} catch (err) { }

	return null;
}