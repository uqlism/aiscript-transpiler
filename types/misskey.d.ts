declare const USER_ID: string;
declare const USER_NAME: string;
declare const USER_USERNAME: string;
declare const CUSTOM_EMOJIS: {
	aliases: string[];
	name: string;
	category: string | null;
	url: string;
	localOnly?: boolean;
	isSensitive?: boolean;
	roleIdsThatCanBeUsedThisEmojiAsReaction?: string[];
}[];
declare const LOCALE: string;
declare const SERVER_URL: string;

declare namespace Mk {
	function dialog(
		title: string,
		text: string,
		type?: "info" | "success" | "warning" | "error" | "question",
	): void;
	function toast(text: string): void;
	function confirm(
		title: string,
		text: string,
		type?: "info" | "success" | "warning" | "error" | "question",
	): boolean;
	function api(
		endpoint: string,
		params: { [key: string]: any },
		token?: string,
	): any;
	function save(key: string, value: any): void;
	function load(key: string): any;
	function remove(key: string): void;
	function url(): string;
	function nyaize(text: string): string;
}

declare const THIS_ID: string;
declare const THIS_URL: string;

type Component<T> = {
	id: string;
	update(props: T): void;
};

declare namespace Ui {
	const root: Component<Root>;
	function render(components: Component<any>[]): void;
	function get<T>(id: string): Component<T>;

	type Font = "serif" | "sans-serif" | "monospace";
	type Root = {
		children: Component<any>[];
	};
	type Container = {
		children: Component<any>[];
		align?: "left" | "center" | "right";
		bgColor?: string;
		fgColor?: string;
		font?: Font;
		borderWidth?: number;
		borderColor?: string;
		borderStyle?: "solid";
		padding?: number;
		rounded?: boolean;
		borderRadius?: number;
		hidden?: boolean;
	};
	type Folder = {
		children: Component<any>[];
		title: string;
		opened?: boolean;
	};
	type Text = {
		text: string;
		size?: number;
		bold?: boolean;
		color?: string;
		font?: Font;
	};
	type Mfm = {
		text: string;
		size?: number;
		bold?: boolean;
		color?: string;
		font?: Font;
		onClickEv?: (id: string) => void; // クリックイベント
	};
	type Button = {
		text: string;
		onClick: () => void;
		primary?: boolean;
		rounded?: boolean;
		disabled?: boolean;
	};
	type Buttons = {
		buttons: Button[];
	};
	type Switch = {
		onChange: (enabled: boolean) => void;
		default: boolean;
		label: string;
		caption?: string;
	};
	type TextInput = {
		onInput: (text: string) => void;
		default: string;
		label?: string;
		caption?: string;
	};
	type Textarea = {
		onInput: (text: string) => void;
		default: string;
		label?: string;
		caption?: string;
	};
	type Select<T> = {
		items: { text: "A"; value: T }[];
		onChange: (value: T) => void;
		default: T;
		label?: string;
		caption?: string;
	};
	type PostForm = {
		form: {
			text: string; // 投稿フォームのデフォルト文字列
			cw?: string; // CWを指定する場合の「要約」テキスト
			visibility?: "home" | "public"; // デフォルトの投稿の公開範囲（未指定の場合はpublic）
			localOnly?: boolean; // デフォルトで連合無しかどうか（未指定の場合はfalse）
		};
	};
	type PostFormButton = PostForm & {
		text: string; // ボタンに表示するテキスト
		primary?: boolean; // 色を付けるか？
		rounded?: boolean; // 角を丸くするか？
	};
	const C: {
		container(props: Container): Component<Container>;
		folder(props: Folder): Component<Folder>;
		text(props: Text): Component<Text>;
		mfm(props: Mfm): Component<Mfm>;
		button(props: Button): Component<Button>;
		buttons(props: Buttons): Component<Buttons>;
		switch(props: Switch): Component<Switch>;
		textInput(props: TextInput): Component<TextInput>;
		textarea(props: Textarea): Component<Textarea>;
		select<T>(props: Select<T>): Component<Select<T>>;
		postForm(props: PostForm): Component<PostForm>;
		postFormButton(props: PostFormButton): Component<PostFormButton>;
	};
}
