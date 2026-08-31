/**
 * Terminal output.
 *
 * Colour is disabled when stdout is not a TTY or NO_COLOR is set, so piped
 * output stays clean.
 */

const useColor = process.stdout.isTTY && !process.env['NO_COLOR'];

const paint = (code: string) => (text: string) => (useColor ? `[${code}m${text}[0m` : text);

export const color = {
	dim: paint('2'),
	bold: paint('1'),
	red: paint('31'),
	green: paint('32'),
	yellow: paint('33'),
	blue: paint('34'),
	cyan: paint('36'),
};

let quiet = false;

export function setQuiet(value: boolean): void {
	quiet = value;
}

export const log = {
	step(message: string): void {
		if (!quiet) console.log(`\n${color.bold(color.cyan('==>'))} ${color.bold(message)}`);
	},
	info(message: string): void {
		if (!quiet) console.log(`    ${message}`);
	},
	detail(message: string): void {
		if (!quiet) console.log(`    ${color.dim(message)}`);
	},
	warn(message: string): void {
		console.log(`    ${color.yellow('warn')} ${message}`);
	},
	error(message: string): void {
		console.error(`    ${color.red('error')} ${message}`);
	},
	success(message: string): void {
		if (!quiet) console.log(`    ${color.green('ok')} ${message}`);
	},
	plain(message: string): void {
		console.log(message);
	},
};
