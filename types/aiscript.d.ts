// biome-ignore-all lint/correctness/noUnusedVariables: 型定義ファイルなので

interface Array<T> {
	[n: number]: T;
	len: number;
	at(index: number): T | undefined;
	push(item: T): void;
	unshift(item: T): void;
	pop(): T | undefined;
	shift(): T | undefined;
	concat(array: T[]): T[];
	join(separator?: string): string;
	slice(begin: number, end: number): T[];
	incl(item: T): boolean;
	map<U>(func: (item: T, index: number) => U): U[];
	filter(func: (item: T, index: number) => boolean): T[];
	reduce<U>(
		func: (accumulator: U, current: T, index: number) => U,
		initial: U,
	): U;
	find(func: (item: T, index: number) => boolean): T | undefined;
	index_of(val: T, fromIndex?: number): number;
	reverse(): undefined;
	copy(): T[];

	sort(comp: (a: T, b: T) => number): T[];
	fill(val?: T, fromIndex?: number, toIndex?: number): T[];
	fill(): undefined[];
	repeat(times: number): T[];
	splice(index: number, remove_count?: number, items?: T[]): T[];
	flat(depth?: number): any[];
	flat_map<U>(func: (item: T, index: number) => U[] | U): U[];
	insert(index: number, item: T): undefined;
	remove(index: number): T | null;
	every(func: (item: T, index: number) => boolean): boolean;
	some(func: (item: T, index: number) => boolean): boolean;
}

// biome-ignore lint/suspicious/noEmptyInterface: Ignore
interface Boolean {}

// biome-ignore lint/suspicious/noEmptyInterface: Ignore
interface Function {}

// biome-ignore lint/suspicious/noEmptyInterface: Ignore
interface CallableFunction extends Function {}

// biome-ignore lint/suspicious/noEmptyInterface: Ignore
interface NewableFunction extends Function {}

interface RegExpMatchResult {
	readonly [n: number]: string | undefined;
	readonly index: number;
	readonly input: string;
	readonly length: number;
	readonly groups: { [key: string]: string | undefined } | undefined;
}

interface RegExp {
	readonly source: string;
	readonly flags: string;
	test(str: string): boolean;
	exec(str: string): RegExpMatchResult | null;
	execAll(str: string): RegExpMatchResult[];
	replace(str: string, replacement: string): string;
	replaceWith(
		str: string,
		fn: (
			match: string,
			groups: (string | undefined)[],
			index: number,
			input: string,
		) => string,
	): string;
	split(str: string, limit?: number): string[];
}

// biome-ignore lint/suspicious/noEmptyInterface: Ignore
interface IArguments {}

interface Number {
	to_str(): string;
	to_hex(): string;
}

interface Object {
	[key: string]: any;
}

interface String {
	len: number;
	to_num(): number | undefined;
	to_arr(): string[];
	to_unicode_arr(): string[];
	to_unicode_codepoint_arr(): number[];
	to_char_arr(): string[];
	to_charcode_arr(): string[];
	to_utf8_byte_arr(): number[];
	pick(i: number): string | undefined;
	incl(keyword: string): boolean;
	starts_with(prefix: string, start_index?: number): boolean;
	ends_with(suffix: string, end_index?: number): boolean;
	slice(begin?: number, end?: number): string;
	split(splitter: string): string[];
	replace(old: string, _new: string): string;
	index_of(search: string, fromIndex?: number): number;
	pad_start(width: number, pad?: string): string;
	pad_end(width: number, pad?: string): string;
	trim(): string;
	upper(): string;
	lower(): string;
}

declare namespace Core {
	const v: string;
	function type(v: any): string;
	function to_str(v: any): string;
	function range(a: number, b: number): number[];
	function sleep(time: number): void;
	function abort(message: string): never;
}

declare namespace Math {
	// Constants
	// biome-ignore lint/suspicious/noShadowRestrictedNames: AiScript Const Name
	const Infinity: number;
	const E: number;
	const LN2: number;
	const LN10: number;
	const LOG2E: number;
	const LOG10E: number;
	const PI: number;
	const SQRT1_2: number;
	const SQRT2: number;

	// Basic functions
	function abs(x: number): number;
	function sign(x: number): number;
	function round(x: number): number;
	function ceil(x: number): number;
	function floor(x: number): number;
	function trunc(x: number): number;
	function min(a: number, b: number): number;
	function max(a: number, b: number): number;
	function sqrt(x: number): number;
	function cbrt(x: number): number;
	function hypot(x: number, y: number): number;

	// random functions
	function rnd(): number;
	function rnd(min: number, max: number): number;
	function gen_rng(
		seed: number | string,
	): (min?: number, max?: number) => number;

	// Trigonometric functions
	function sin(x: number): number;
	function cos(x: number): number;
	function tan(x: number): number;
	function asin(x: number): number;
	function acos(x: number): number;
	function atan(x: number): number;
	function atan2(y: number, x: number): number;

	// Hyperbolic functions
	function sinh(x: number): number;
	function cosh(x: number): number;
	function tanh(x: number): number;
	function asinh(x: number): number;
	function acosh(x: number): number;
	function atanh(x: number): number;

	// Exponential/Logarithmic functions
	function pow(base: number, exponent: number): number;
	function exp(x: number): number;
	function expm1(x: number): number;
	function log(x: number): number;
	function log1p(x: number): number;
	function log10(x: number): number;
	function log2(x: number): number;
}

declare namespace Util {
	function uuid(): string;
}

declare namespace Json {
	function stringify(v: any): string;
	function parse(json: string): any;
	function parsable(str: string): boolean;
}

declare namespace Date {
	function now(): number;
	function year(date?: number): number;
	function month(date?: number): number;
	function day(date?: number): number;
	function hour(date?: number): number;
	function minute(date?: number): number;
	function second(date?: number): number;
	function parse(date: string): number;
	function to_iso_str(date?: number): string;
}

declare namespace Str {
	const lf: string;
	function lt(a: string, b: string): number;
	function gt(a: string, b: string): number;
	function from_codepoint(codepoint: number): string;
	function from_unicode_codepoints(codepoints: number[]): string;
	function from_utf8_bytes(bytes: number[]): string;
}

declare namespace Num {
	function from_hex(hex: string): number;
}

declare namespace Uri {
	function encode_full(uri: string): string;
	function decode_component(encoded_text: string): string;
}

declare namespace Obj {
	function keys<T extends Object>(v: T): (keyof T)[];
	function vals<T extends Object>(v: T): T[keyof T][];
	function kvs<T extends Object>(v: T): [string, T[keyof T]][];
	function get(v: object, key: string): any;
	function set(v: object, key: string, val: any): object;
	function has(v: object, key: string): boolean;
	function copy(v: object): object;
	function merge(a: object, b: object): object;
}

declare namespace Arr {
	function create(length: number, initial?: any): any[];
}

declare namespace Async {
	function interval(
		interval: number,
		callback: () => void,
		immediate?: boolean,
	): void;
	function timeout(delay: number, callback: () => void): void;
}

declare function print(message: string): void;
declare function readline(message: string): string;
