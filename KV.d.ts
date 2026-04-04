import Cloudflare, { type ClientOptions } from "./Cloudflare.mjs";

/**
 * KV 键列表查询参数。
 * KV key list query options.
 */
export interface KVListOptions {
	prefix?: string;
	limit?: number;
	cursor?: string;
}

/**
 * KV 键列表项。
 * KV key list entry.
 */
interface KVListKey {
	name: string;
	expiration?: number;
	metadata?: unknown;
}

/**
 * KV 键列表结果。
 * KV key list result.
 */
export interface KVListResult {
	keys: KVListKey[];
	list_complete: boolean;
	cursor: string;
}

/**
 * Cloudflare Workers KVNamespace 兼容接口。
 * Cloudflare Workers KVNamespace compatible interface.
 */
export interface KVNamespaceLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
	list?(options?: KVListOptions): Promise<KVListResult>;
}

/**
 * KV 初始化对象。
 * KV initialization object.
 */
export interface KVInitOptions extends ClientOptions {
	namespaces?: ReadonlyMap<string, KVNamespaceLike> | Record<string, KVNamespaceLike> | null;
	env?: {
		namespaces?: ReadonlyMap<string, KVNamespaceLike> | Record<string, KVNamespaceLike> | null;
		[key: string]: unknown;
	};
	client?: Cloudflare;
	account_id?: string;
	namespace_id?: string;
	accountId?: string;
	namespaceId?: string;
}

type KVInit = KVInitOptions | null | undefined;

/**
 * Cloudflare KV 异步适配器。
 * Cloudflare KV async adapter.
 *
 * `KV` 提供和 `Storage` 接近的读写接口，优先使用构造时生成的实例级 `namespaces` 生效映射：先复制静态 `KV.namespaces`，再合并 `init.namespaces`；其中 `""` 前缀代表默认 namespace 兜底。之后才是 `Cloudflare` client、认证信息即时创建 client，最后回退到 util `Storage`。
 * `KV` provides a `Storage`-like read/write API, preferring the instance-level effective `namespaces` map created during construction: it copies static `KV.namespaces`, then merges `init.namespaces`; the `""` prefix is the default namespace fallback. After that it uses a `Cloudflare` client, auth-based client creation, and finally util `Storage`.
 */
export declare class KV {
	#private;
	/**
	 * 前缀到 KVNamespace 的静态注册表。
	 * Static prefix-to-namespace registry.
	 *
	 * `KV` 的所有实例都会优先读取这个注册表。
	 * All `KV` instances consult this registry before legacy backends.
	 */
	static readonly namespaces: Map<string, KVNamespaceLike>;
	/**
	 * 当前实例的生效前缀映射表。
	 * Effective prefix map for the current instance.
	 *
	 * 空字符串前缀 `""` 代表默认 namespace。
	 * The empty-string prefix `""` represents the default namespace.
	 */
	readonly namespaces: Map<string, KVNamespaceLike>;
	readonly client?: Cloudflare;
	readonly account_id?: string;
	readonly namespace_id?: string;
	/**
	 * 创建 KV 实例。
	 * Create a KV instance.
	 *
	 * @param {KVInit} [init] 初始化参数；构造时会生成实例级 `namespaces` 生效映射：先复制静态 `KV.namespaces`，再合并 `init.namespaces`。空字符串前缀 `""` 代表默认 namespace。 / Initialization input; construction creates an instance-level effective `namespaces` map by copying static `KV.namespaces`, then merging `init.namespaces`. The empty-string prefix `""` represents the default namespace.
	 */
	constructor(init?: KVInit);
	/**
	 * 读取存储值。
	 * Read value from persistent storage.
	 *
	 * @template T 返回值类型 / Return value type.
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @param {T} [defaultValue=null as T] 默认值 / Default value.
	 * @returns {Promise<T>}
	 */
	getItem<T = unknown>(keyName: string, defaultValue?: T): Promise<T>;
	/**
	 * 写入存储值。
	 * Write value into persistent storage.
	 *
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @param {unknown} keyValue 写入值 / Value to store.
	 * @returns {Promise<boolean>}
	 */
	setItem(keyName?: string, keyValue?: unknown): Promise<boolean>;
	/**
	 * 删除存储值。
	 * Remove value from persistent storage.
	 *
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @returns {Promise<boolean>}
	 */
	removeItem(keyName: string): Promise<boolean>;
	/**
	 * 清空存储。
	 * Clear storage.
	 *
	 * 无参时保持 legacy 语义并返回 `false`。
	 * Without arguments, keeps legacy behavior and returns `false`.
	 */
	clear(): Promise<boolean>;
	/**
	 * 清空精确注册前缀对应的 KVNamespace。
	 * Clear the KVNamespace bound to an exact registered prefix.
	 *
	 * @param {string} keyName 精确注册前缀 / Exact registered prefix.
	 * @returns {Promise<boolean>}
	 */
	clear(keyName: string): Promise<boolean>;
	/**
	 * 列出 KV 键。
	 * List KV keys.
	 *
	 * 传入 options 时始终走 legacy backend；传入 string 时使用 `KV.namespaces` 做 exact / parent 注册前缀解析。
	 * Passing options always uses legacy backends; passing a string resolves exact / parent registered prefixes via `KV.namespaces`.
	 */
	list(options?: KVListOptions): Promise<KVListResult>;
	/**
	 * 列出注册前缀对应的 KV 键。
	 * List keys for a registered prefix.
	 *
	 * @param {string} keyName 精确或父级注册前缀 / Exact or parent registered prefix.
	 * @param {KVListOptions} [options={}] 列举选项 / List options.
	 * @returns {Promise<KVListResult>}
	 */
	list(keyName: string, options?: KVListOptions): Promise<KVListResult>;
}

export {};
