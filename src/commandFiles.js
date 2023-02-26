import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as URL from "node:url";

/**
 * Throws an error.
 * @param {*} e Error to throw
 * @private
 */
function t(e) {
	throw e;
}

/**
 * Recursively search a directory of files for command files.
 * @param {import("./index.js").default} cmd The cmdlib instance to use.
 * @param {string} dirName Directory to search.
 * @param {Array<String>} cmdPrefix An array of "parent" commands, for subcommands
 */
export default async function readCmdFiles(cmd, dirName, cmdPrefix) {
	const directory = await fs.readdir(dirName, {withFileTypes: true});

	for (const ent of directory) {
		if (
			ent.isFile() &&
			ent.name.endsWith(".js") &&
			!ent.name.startsWith("_")
		) {
			const filePath = path.join(dirName, ent.name);
			const fileName = path.parse(filePath).name;

			const imported = await import(
				URL.pathToFileURL(filePath).toString()
			);
			const name =
				imported.name ||
				cmdPrefix
					.concat(
						fileName === "index"
							? cmdPrefix.length > 0
								? []
								: fileName
							: fileName
					)
					.join(" ");

			cmd.addCommand(
				"aliasTo" in imported
					? {
							name,
							id: imported.id || name,
							aliasTo: imported.aliasTo,
							caseSensitive: imported.caseSensitive,
							prefixOverride: imported.prefixOverride,
					  }
					: {
							func:
								imported.func ||
								imported.default ||
								t(
									new Error(
										"a `func` or `default` exported function is required"
									)
								),
							// e.g:
							// commands/commandname.js => !commandname
							// commands/sub/command.js = !sub command
							// commands/sub/command/index.js -> !sub command
							// commands/asdf.js (`export const name = "somethingelse"`)
							//   -> !somethingelse
							name: name,
							id: imported.id || name,
							description: imported.description,
							pms: imported.pms,
							argType: imported.argType,
							caseSensitive: imported.caseSensitive,
							prefixOverride: imported.prefixOverride,
					  }
			);
		} else if (ent.isDirectory()) {
			const isGroup = ent.name.startsWith("(") && ent.name.endsWith(")");
			await readCmdFiles(
				cmd,
				path.join(dirName, ent.name),
				isGroup ? cmdPrefix : cmdPrefix.concat(ent.name)
			);
		}
	}
}
