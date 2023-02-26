import _doCommandFiles from "./commandFiles.js";
export const doCommandFiles = _doCommandFiles;

/**
 * @typedef {*} IrcFrameworkMessage
 */
/**
 * @typedef {*} IrcFrameworkClient
 */

/**
 * @typedef {{
 * 	prefix: string,
 * 	defaultListeners: boolean,
 * 	caseSensitive: false,
 * }} Options
 */

/**
 * @typedef {{
 * 	prefix?: string,
 * 	defaultListeners?: boolean,
 * 	caseSensitive?: false,
 * }} OptionsInput
 */

/**
 * @typedef {{
 *	name: string,
 * 	id: string,
 * 	description?: string,
 *	func: CommandCallback,
 *	prefixOverride?: string,
 * 	caseSensitive?: false,
 *	argType?: "pipes" | "spaces" | "one" | "auto",
 *	pms?: boolean | "only"
 * }} Command
 */

/**
 * @typedef {{
 *	name: string,
 * 	id: string,
 *	aliasTo: string,
 *	prefixOverride?: string,
 * 	caseSensitive?: false,
 * }} Alias
 */

/**
 *	@callback CommandCallback
 *	@param {IrcFrameworkMessage} msg
 *	@param {IrcFrameworkClient} client
 *	@param {string[]} args
 *	@param {cmdlib} cmdlib
 */

/**
	The default options for cmdlib instances.
	@constant
	@type {Options}
*/
const DEFAULT_OPTIONS = {
	prefix: "!",
	defaultListeners: true,
	caseSensitive: false,
};

export default class cmdlib {
	/**
	 * 	@param {IrcFrameworkClient} client An irc-framework instance to hook to, for options.defaultListeners.
	 * 	@param {OptionsInput} options An options object.
	 */
	constructor(client, options = {}) {
		/**
		 * 	The IRC client instance.
		 */
		this.client = client;
		/**
		 * 	The instance's options.
		 * 	@type {Options}
		 */
		this.options = {...DEFAULT_OPTIONS, ...options};
		/**
		 * 	A list of added commands.
		 * 	@type {Array<Command | Alias>}
		 */
		this.__cmds = [];

		this.client.on(
			"privmsg",
			/**
			 * @param {*} msg
			 */ msg => {
				if (this.options.defaultListeners) {
					this.runCommands(
						msg,
						msg.message,
						!msg.target.startsWith("#")
					);
				}
			}
		);
	}

	/**
	 * 	Adds a command
	 * 	@param {Command | Alias} options
	 */
	addCommand(options) {
		this.__cmds.push({
			argType: "auto",
			...options,
			// @ts-ignore
			pms: options.pms ?? true,
		});
	}

	/**
	 * @param {IrcFrameworkMessage} msg
	 * @param {string} content
	 * @param {boolean} isPM
	 * @returns
	 */
	runCommands(msg, content, isPM) {
		let cmdToRun = null;
		let realCmdToRun = null;
		let unaliasedCmdToRun = null;

		const lowerContent = content.toLowerCase();

		for (const _cmd of this.__cmds) {
			let cmd = _cmd;
			if ("aliasTo" in _cmd) {
				/**
				 * @type {Command | Alias | undefined}
				 */
				const alias = this.__cmds.find(c => c.id === _cmd.aliasTo);
				if (!alias)
					throw new Error(
						`Aliases can't point to nonexistent commands (cause: command "${_cmd.id}")`
					);
				if ("aliasTo" in alias)
					throw new Error(
						`Aliases can't point to aliases (cause: command "${_cmd.id}")`
					);
				cmd = alias;
			}

			const name = _cmd.name;
			// @ts-ignore
			const fullCmd = (cmd.prefixOverride ?? this.options.prefix) + name;
			const lowerName = fullCmd.toLowerCase();

			// @ts-ignore
			const caseSensitive =
				cmd.caseSensitive ?? this.options.caseSensitive;

			if (
				(!caseSensitive && lowerContent === lowerName) ||
				(!caseSensitive && lowerContent.startsWith(lowerName + " ")) ||
				(caseSensitive && content === fullCmd) ||
				(caseSensitive && content.startsWith(fullCmd + " "))
			) {
				if (
					// @ts-ignore
					cmd.pms === true ||
					// @ts-ignore
					(!isPM && !(cmd.pms === "only")) ||
					// @ts-ignore
					(isPM && cmd.pms === "only")
				) {
					if (cmdToRun === null || name.length > cmdToRun.length) {
						cmdToRun = name;
						// @ts-ignore
						realCmdToRun = _cmd;
						unaliasedCmdToRun = cmd;
					}
				}
			}
		}
		if (!(realCmdToRun && unaliasedCmdToRun)) return;

		if ("aliasTo" in realCmdToRun && realCmdToRun.aliasTo) {
			// Do it this way so subcommands work within aliases
			const fullCmd =
				(unaliasedCmdToRun.prefixOverride ?? this.options.prefix) +
				unaliasedCmdToRun.name;
			const aliasFullCmd =
				(realCmdToRun.prefixOverride ?? this.options.prefix) +
				realCmdToRun.name;
			this.runCommands(msg, content.replace(aliasFullCmd, fullCmd), isPM);
			return;
		}

		this.runCommand(realCmdToRun.id, msg);
	}

	/**
	 * @param {string} id
	 * @param {IrcFrameworkMessage} msg
	 */
	runCommand(id, msg) {
		const content = msg.message;

		const cmd = this.__cmds.find(cmd => cmd.id === id);
		if (!cmd) return;

		const fullCmd = (cmd.prefixOverride || this.options.prefix) + cmd.name;

		const argsStr = content.substring(fullCmd.length + 1);

		let args;
		// @ts-ignore
		switch (cmd.argType) {
			case "pipes":
				args = this.parseArgs(argsStr);
				break;
			case "spaces":
				args = this.parseArgsSpaces(argsStr);
				break;
			case "one":
				args = [argsStr];
				break;
			default:
				if (argsStr.replaceAll("\\|", "").includes("|")) {
					args = this.parseArgs(argsStr);
				} else {
					args = this.parseArgsSpaces(argsStr);
				}
				break;
		}

		try {
			// @ts-ignore
			cmd.func(msg, this.client, args, this);
		} catch (e) {
			console.error("Error running command", fullCmd, "with args", args);
			console.error(e);
		}
	}

	/**
	 * @param {string} str
	 * @returns {string[]}
	 */
	parseArgs(str) {
		const SEP = "|";

		const splitRegex = new RegExp(`(?<!\\\\)${this._regexEscape(SEP)}`);

		let args = [];

		args = str
			.split(splitRegex)
			.map(v =>
				v
					.replaceAll(
						new RegExp(`\\\\${this._regexEscape(SEP)}`, "g"),
						SEP
					)
					.trim()
			);

		return args;
	}

	/**
	 * @param {string} str
	 * @returns {string[]}
	 */
	parseArgsSpaces(str) {
		const SEP = '"';

		const splitRegex = new RegExp(`(?<!\\\\)${this._regexEscape(SEP)}`);
		const quoteSplit = str
			.replaceAll("\\|", "|")
			.split(splitRegex)
			.map(v =>
				v.replaceAll(
					new RegExp(`\\\\${this._regexEscape(SEP)}`, "g"),
					SEP
				)
			);

		/**
		 * @type {string[]}
		 */
		let finalArgs = [];
		for (const i in quoteSplit) {
			const item = quoteSplit[i];

			// even items are outside quotes
			if (+i % 2 === 0) {
				finalArgs = finalArgs.concat(
					item
						.trim()
						.split(" ")
						.filter(e => e.length > 0)
				);
			} else {
				// don't trim here so that quoted strings are exact
				finalArgs.push(item);
			}
		}

		return finalArgs;
	}

	/**
	 * @param {string} letter
	 * @returns {string}
	 */
	_regexEscape(letter) {
		letter = letter.substring(0, 1);
		return /[a-zA-Z0-9]/.test(letter) ? "" : "\\" + letter;
	}
}
