import { Lodash as _, Storage, type FetchResponse } from "@nsnanocat/util";
import Cloudflare, {
	type ClientOptions,
} from "./Cloudflare.mjs";

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

interface KeyListParams {
	account_id: string;
	prefix?: string;
	limit?: number;
	cursor?: string;
}

interface ValueUpdateParams {
	account_id: string;
	value: string;
	expiration?: number;
	expiration_ttl?: number;
	metadata?: unknown;
}

interface ValueGetParams {
	account_id: string;
}

interface ValueDeleteParams {
	account_id: string;
}

/**
 * 命中的 namespace 注册项。
 * Matched namespace registration entry.
 *
 * `registeredPrefix` 用于指出 `namespaces` 中命中的注册前缀；`namespaceBinding` 就是该前缀绑定的 `KVNamespaceLike` 对象，后续实际读写会调用它。
 * `registeredPrefix` identifies the matched registration key in `namespaces`; `namespaceBinding` is the `KVNamespaceLike` bound to that prefix and receives the actual I/O calls.
 */
interface KVNamespaceEntry {
	registeredPrefix: string;
	namespaceBinding: KVNamespaceLike;
}

/**
 * KV 路由解析结果。
 * KV route resolution result.
 *
 * `originalKeyName` 始终保留调用方传入的原始 key；它不负责定位 `namespaces`，而是用于保持报错信息、legacy 回退和父级聚合裁剪逻辑与调用方输入一致。
 * `originalKeyName` always keeps the caller's original key; it is not used to locate `namespaces`, but keeps error messages, legacy fallback, and parent aggregation trimming aligned with the caller input.
 *
 * 只有 `child` 路由包含 `resolvedKeyName`，因为只有它需要把注册前缀裁掉后，得到实际传给底层 `KVNamespaceLike` 的 key；只有 `legacy` 路由包含 `rootKeyName` / `path`，因为只有它需要在 `@path` 语义下描述根 key 与属性路径。
 * Only the `child` route includes `resolvedKeyName`, because only it needs the prefix-stripped key that will be passed to the underlying `KVNamespaceLike`; only the `legacy` route includes `rootKeyName` / `path`, because only it needs to describe the root key and property path used by `@path` semantics.
 *
 * `entry` / `entries` 只负责指出 `namespaces` 中命中的注册项，也就是“该用哪个绑定对象”；它们不表示最终读写的 KV key。
 * `entry` / `entries` only identify which registrations matched in `namespaces`, meaning "which binding object to use"; they do not represent the final KV keys being read or written.
 */
type NamespaceRoute =
	| {
			kind: "legacy";
			/** 原始输入 key，用于 legacy 回退与报错信息。 / Original input key used for legacy fallback and error messages. */
			originalKeyName: string;
			/** `@path` 的根 key；后续递归读改写会基于它继续解析。 / Root key extracted from `@path`; subsequent recursive read-modify-write flows continue from it. */
			rootKeyName: string;
			/** `@path` 的属性路径；用于 `_.get` / `_.set` / `_.unset`。 / Property path extracted from `@path`, used by `_.get` / `_.set` / `_.unset`. */
			path?: string;
	  }
	| {
			kind: "normal";
			/** 原始输入 key；它会直接传给默认 namespace、Cloudflare REST 或 Storage fallback。 / Original input key passed directly to the default namespace, Cloudflare REST backend, or Storage fallback. */
			originalKeyName: string;
	  }
	| {
			kind: "exact";
			/** 原始输入 key；用于保持精确前缀命中的报错和日志语义。 / Original input key used to preserve error and log semantics for exact-prefix matches. */
			originalKeyName: string;
			/** 命中的单个注册项；用于确定应该调用哪个 namespace 绑定。 / Single matched registration used to determine which namespace binding should be invoked. */
			entry: KVNamespaceEntry;
	  }
	| {
			kind: "child";
			/** 原始输入 key；用于保持前缀裁剪前的调用语义。 / Original input key kept to preserve the caller semantics before prefix stripping. */
			originalKeyName: string;
			/** 实际传给命中 namespace 绑定的 key；它等于裁掉注册前缀后的剩余后缀。 / Actual key passed to the matched namespace binding; it is the suffix left after stripping the registered prefix. */
			resolvedKeyName: string;
			/** 命中的单个注册项；用于确定应该调用哪个 namespace 绑定。 / Single matched registration used to determine which namespace binding should be invoked. */
			entry: KVNamespaceEntry;
	  }
	| {
			kind: "parent";
			/** 原始输入 key；用于父级聚合时计算相对路径。 / Original input key used to compute relative paths during parent aggregation. */
			originalKeyName: string;
			/** 命中的多个注册项；用于聚合多个 namespace 绑定的读结果。 / Multiple matched registrations used to aggregate reads from several namespace bindings. */
			entries: KVNamespaceEntry[];
	  };

/**
 * Cloudflare KV 异步适配器。
 * Cloudflare KV async adapter.
 *
 * `KV` 提供和 `Storage` 接近的读写接口，优先使用构造时生成的实例级 `namespaces` 生效映射：先复制静态 `KV.namespaces`，再合并 `init.namespaces`；其中 `""` 前缀代表默认 namespace 兜底。之后才是 `Cloudflare` client、认证信息即时创建 client，最后回退到 util `Storage`。
 * `KV` provides a `Storage`-like read/write API, preferring the instance-level effective `namespaces` map created during construction: it copies static `KV.namespaces`, then merges `init.namespaces`; the `""` prefix is the default namespace fallback. After that it uses a `Cloudflare` client, auth-based client creation, and finally util `Storage`.
 *
 * 示例：
 * Example:
 *
 * ```ts
 * KV.namespaces.set("@iRingo.Maps.Caches", env.Maps);
 *
 * const kv = new KV();
 * await kv.setItem("@iRingo.Maps.Caches.a", "dark");
 * const caches = await kv.getItem("@iRingo.Maps.Caches", {});
 * ```
 */
export class KV {
	static readonly #nameRegex = /^@(?<key>[^.]+)(?:\.(?<path>.*))?$/;

	/**
	 * 前缀到 KVNamespace 的静态注册表。
	 * Static prefix-to-namespace registry.
	 *
	 * `KV` 的所有实例都会优先读取这个注册表。
	 * All `KV` instances consult this registry before legacy backends.
	 */
	static readonly namespaces = new Map<string, KVNamespaceLike>();

	/**
	 * 当前实例的生效前缀映射表。
	 * Effective prefix map for the current instance.
	 *
	 * 构造时会先复制静态 `KV.namespaces`，再合并 `init.namespaces`；其中 `""` 前缀代表默认 namespace。
	 * During construction, it copies static `KV.namespaces`, then merges `init.namespaces`; the `""` prefix represents the default namespace.
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
	constructor(init?: KVInit) {
		if (
			typeof init === "object" &&
			init !== null &&
			!Array.isArray(init) &&
			typeof (init as KVNamespaceLike).get === "function" &&
			typeof (init as KVNamespaceLike).put === "function" &&
			typeof (init as KVNamespaceLike).delete === "function"
		) {
			throw new TypeError('new KV(namespace) was removed. Use new KV({ namespaces: { "": namespace } }) instead.');
		}
		const initOptions = typeof init === "object" && init !== null && !Array.isArray(init) ? init : undefined;
		if (initOptions?.namespace) {
			throw new TypeError('KVInitOptions.namespace was removed. Use KVInitOptions.namespaces[""] instead.');
		}
		if (initOptions?.env && typeof initOptions.env === "object" && initOptions.env !== null && "namespace" in initOptions.env && initOptions.env.namespace) {
			throw new TypeError('KVInitOptions.env.namespace was removed. Use KVInitOptions.env.namespaces[""] instead.');
		}
		const initNamespaces = initOptions?.namespaces ?? initOptions?.env?.namespaces;
		this.namespaces = new Map<string, KVNamespaceLike>();
		// Copy static registrations first so per-instance mappings can override them.
		for (const [prefix, boundNamespace] of KV.namespaces) {
			if (
				typeof boundNamespace !== "object" ||
				boundNamespace === null ||
				typeof boundNamespace.get !== "function" ||
				typeof boundNamespace.put !== "function" ||
				typeof boundNamespace.delete !== "function"
			) {
				throw new TypeError(`KV.namespaces.get(${JSON.stringify(prefix)}) must return a KVNamespace-like value.`);
			}
			this.namespaces.set(prefix, boundNamespace);
		}
		if (initNamespaces && typeof initNamespaces === "object") {
			const entries = initNamespaces instanceof Map ? initNamespaces.entries() : Object.entries(initNamespaces);
			for (const [prefix, boundNamespace] of entries) {
				if (
					typeof boundNamespace !== "object" ||
					boundNamespace === null ||
					typeof boundNamespace.get !== "function" ||
					typeof boundNamespace.put !== "function" ||
					typeof boundNamespace.delete !== "function"
				) {
					throw new TypeError(`KVInitOptions.namespaces[${JSON.stringify(prefix)}] must be a KVNamespace-like value.`);
				}
				this.namespaces.set(prefix, boundNamespace);
			}
		}
		this.account_id = initOptions?.account_id ?? initOptions?.accountId ?? undefined;
		this.namespace_id = initOptions?.namespace_id ?? initOptions?.namespaceId ?? undefined;
		if (!this.namespaces.has("") && initOptions?.client) {
			this.client = initOptions.client;
			return;
		}
		if (
			!this.namespaces.has("") &&
			initOptions &&
			!initOptions.client &&
			[
				"apiToken",
				"apiKey",
				"apiEmail",
				"userServiceKey",
				"baseURL",
				"timeout",
				"defaultHeaders",
				"defaultQuery",
				"maxRetries",
				"account_id",
				"namespace_id",
				"accountId",
				"namespaceId",
			].some(key => key in initOptions)
		) {
			this.client = new Cloudflare(initOptions);
		}
	}

	/**
	 * 读取存储值。
	 * Read value from persistent storage.
	 *
	 * @template T 返回值类型 / Return value type.
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @param {T} [defaultValue=null as T] 默认值 / Default value.
	 * @returns {Promise<T>}
	 */
	async getItem<T = unknown>(keyName: string, defaultValue = null as T): Promise<T> {
		const route = this.#resolveNamespaceRoute(keyName);
		switch (route.kind) {
			case "child": {
				const keyValue = deserialize(await route.entry.namespaceBinding.get(route.resolvedKeyName));
				return (keyValue ?? defaultValue) as T;
			}
			case "exact": {
				const keys = await this.#listAllNamespacedKeys(route.entry, `KV.getItem(${JSON.stringify(route.entry.registeredPrefix)})`);
				const settledValues = await Promise.allSettled(
					keys.map(async key => [key.name, deserialize(await route.entry.namespaceBinding.get(key.name))] as const),
				);
				const values = settledValues
					.filter((result): result is PromiseFulfilledResult<readonly [string, unknown]> => result.status === "fulfilled")
					.map(result => result.value);
				return Object.fromEntries(values) as T;
			}
			case "parent": {
				const value: Record<string, unknown> = {};
				for (const entry of route.entries) {
					const keys = await this.#listAllNamespacedKeys(entry, `KV.getItem(${JSON.stringify(entry.registeredPrefix)})`);
					const settledValues = await Promise.allSettled(
						keys.map(async key => [key.name, deserialize(await entry.namespaceBinding.get(key.name))] as const),
					);
					const values = settledValues
						.filter((result): result is PromiseFulfilledResult<readonly [string, unknown]> => result.status === "fulfilled")
						.map(result => result.value);
					_.set(value, entry.registeredPrefix.slice(route.originalKeyName.length + 1), Object.fromEntries(values));
				}
				return value as T;
			}
			case "legacy": {
				let keyValue: unknown = defaultValue;
				let value = await this.getItem<Record<string, unknown>>(route.rootKeyName, {});
				if (typeof value !== "object" || value === null) value = {};
				keyValue = _.get(value, route.path);
				keyValue = deserialize(keyValue);
				return (keyValue ?? defaultValue) as T;
			}
			case "normal": {
				let keyValue: unknown = defaultValue;

				// The empty-string prefix is the default namespace fallback for plain keys.
				const defaultNamespace = this.namespaces.get("");
				switch (true) {
					case typeof defaultNamespace !== "undefined":
						keyValue = await defaultNamespace.get(route.originalKeyName);
						break;
					// Check whether the Cloudflare REST KV backend is fully configured.
					case Boolean(this.client && this.account_id && this.namespace_id): {
						const params: ValueGetParams = {
							account_id: this.account_id!,
						};
						try {
							const response = await this.client!.kv.namespaces.values.get(this.namespace_id!, route.originalKeyName, params);
							switch (response.status) {
								case 404:
									keyValue = null;
									break;
								default:
									switch (true) {
										case typeof response.body === "string":
											keyValue = response.body;
											break;
										case response.bodyBytes instanceof ArrayBuffer:
											keyValue = new TextDecoder().decode(response.bodyBytes);
											break;
										case response.body instanceof ArrayBuffer:
											keyValue = new TextDecoder().decode(response.body);
											break;
										default:
											keyValue = "";
											break;
									}
							}
						} catch (error) {
							if (
								error &&
								typeof error === "object" &&
								"status" in error &&
								Number((error as { status?: number }).status) === 404
							) {
								keyValue = null;
								break;
							}
							throw error;
						}
						break;
					}
					default:
						keyValue = Storage.getItem(route.originalKeyName, defaultValue);
						break;
				}
				keyValue = deserialize(keyValue);
				return (keyValue ?? defaultValue) as T;
				}
		}
	}

	/**
	 * 写入存储值。
	 * Write value into persistent storage.
	 *
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @param {unknown} keyValue 写入值 / Value to store.
	 * @returns {Promise<boolean>}
	 */
	async setItem(keyName: string = String(), keyValue: unknown = String()): Promise<boolean> {
		const route = this.#resolveNamespaceRoute(keyName);
		switch (route.kind) {
			case "child":
				await route.entry.namespaceBinding.put(route.resolvedKeyName, serialize(keyValue));
				return true;
			case "exact": {
				if (!keyValue || typeof keyValue !== "object" || Array.isArray(keyValue)) {
					throw new TypeError(`KV.setItem(${JSON.stringify(route.originalKeyName)}) requires an object value for exact registered prefixes in KV.namespaces.`);
				}
				const results = await Promise.allSettled(
					Object.entries(keyValue).map(async ([name, value]) => {
						await route.entry.namespaceBinding.put(name, serialize(value));
					}),
				);
				return results.every(result => result.status === "fulfilled");
			}
			case "parent":
				throw new TypeError(`KV.setItem(${JSON.stringify(route.originalKeyName)}) does not support parent registered prefixes in KV.namespaces.`);
			case "legacy": {
				let result = false;
				const serializedValue = serialize(keyValue);
				let value = await this.getItem<Record<string, unknown>>(route.rootKeyName, {});
				if (typeof value !== "object" || value === null) value = {};
				_.set(value, route.path, serializedValue);
				result = await this.setItem(route.rootKeyName, value);
				return result;
			}
			case "normal": {
				let result = false;
				const serializedValue = serialize(keyValue);

				const defaultNamespace = this.namespaces.get("");
				switch (true) {
					case typeof defaultNamespace !== "undefined":
						await defaultNamespace.put(route.originalKeyName, serializedValue);
						result = true;
						break;
					// Check whether the Cloudflare REST KV backend is fully configured.
					case Boolean(this.client && this.account_id && this.namespace_id): {
						const params: ValueUpdateParams = {
							account_id: this.account_id!,
							value: serializedValue,
						};
						await this.client!.kv.namespaces.values.update(this.namespace_id!, route.originalKeyName, params);
						result = true;
						break;
					}
					default:
						result = Storage.setItem(route.originalKeyName, serializedValue);
						break;
				}
				return result;
		}
		}

	/**
	 * 删除存储值。
	 * Remove value from persistent storage.
	 *
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @returns {Promise<boolean>}
	 */
	async removeItem(keyName: string): Promise<boolean> {
		const route = this.#resolveNamespaceRoute(keyName);
		switch (route.kind) {
			case "child":
				await route.entry.namespaceBinding.delete(route.resolvedKeyName);
				return true;
			case "exact": {
				const keys = await this.#listAllNamespacedKeys(route.entry, `KV.clear(${JSON.stringify(route.originalKeyName)})`);
				const results = await Promise.allSettled(keys.map(async key => await route.entry.namespaceBinding.delete(key.name)));
				return results.every(result => result.status === "fulfilled");
			}
			case "parent":
				throw new TypeError(`KV.removeItem(${JSON.stringify(route.originalKeyName)}) does not support parent registered prefixes in KV.namespaces.`);
			case "legacy": {
				let result = false;
				let value = await this.getItem<Record<string, unknown>>(route.rootKeyName, {});
				if (typeof value !== "object" || value === null) value = {};
				_.unset(value, route.path);
				result = await this.setItem(route.rootKeyName, value);
				return result;
			}
			case "normal": {
				let result = false;

				const defaultNamespace = this.namespaces.get("");
				switch (true) {
					case typeof defaultNamespace !== "undefined":
						await defaultNamespace.delete(route.originalKeyName);
						result = true;
						break;
					// Check whether the Cloudflare REST KV backend is fully configured.
					case Boolean(this.client && this.account_id && this.namespace_id): {
						const params: ValueDeleteParams = {
							account_id: this.account_id!,
						};
						await this.client!.kv.namespaces.values.delete(this.namespace_id!, route.originalKeyName, params);
						result = true;
						break;
					}
					default:
						result = Storage.removeItem(route.originalKeyName);
						break;
				}
				return result;
		}
		}

	/**
	 * 清空存储。
	 * Clear storage.
	 *
	 * 无参时保持 legacy 语义并返回 `false`。
	 * Without arguments, keeps legacy behavior and returns `false`.
	 *
	 * @returns {Promise<boolean>}
	 */
	async clear(): Promise<boolean>;
	/**
	 * 清空精确注册前缀对应的 KVNamespace。
	 * Clear the KVNamespace bound to an exact registered prefix.
	 *
	 * @param {string} keyName 精确注册前缀 / Exact registered prefix.
	 * @returns {Promise<boolean>}
	 */
	async clear(keyName: string): Promise<boolean>;
	async clear(keyName?: string): Promise<boolean> {
		if (typeof keyName !== "string") {
			return false;
		}
		const route = this.#resolveNamespaceRoute(keyName);
		if (route.kind !== "exact") {
			throw new TypeError(`KV.clear(${JSON.stringify(keyName)}) requires an exact registered prefix in KV.namespaces.`);
		}
		const keys = await this.#listAllNamespacedKeys(route.entry, `KV.clear(${JSON.stringify(route.originalKeyName)})`);
		const results = await Promise.allSettled(keys.map(async key => await route.entry.namespaceBinding.delete(key.name)));
		return results.every(result => result.status === "fulfilled");
	}

	/**
	 * 列出 KV 键。
	 * List KV keys.
	 *
	 * 传入 options 时始终走 legacy backend；传入 string 时使用 `KV.namespaces` 做 exact / parent 注册前缀解析。
	 * Passing options always uses legacy backends; passing a string resolves exact / parent registered prefixes via `KV.namespaces`.
	 *
	 * @param {KVListOptions} [options] legacy 列举选项 / Legacy list options.
	 * @returns {Promise<KVListResult>}
	 */
	async list(options?: KVListOptions): Promise<KVListResult>;
	/**
	 * 列出注册前缀对应的 KV 键。
	 * List keys for a registered prefix.
	 *
	 * @param {string} keyName 精确或父级注册前缀 / Exact or parent registered prefix.
	 * @param {KVListOptions} [options={}] 列举选项 / List options.
	 * @returns {Promise<KVListResult>}
	 */
	async list(keyName: string, options?: KVListOptions): Promise<KVListResult>;
	async list(keyNameOrOptions: string | KVListOptions = {}, options: KVListOptions = {}): Promise<KVListResult> {
		if (typeof keyNameOrOptions === "string") {
			const route = this.#resolveNamespaceRoute(keyNameOrOptions);
			switch (route.kind) {
				case "exact":
					if (typeof route.entry.namespaceBinding.list !== "function") {
						throw new TypeError(`KV.list(${JSON.stringify(route.entry.registeredPrefix)}) requires namespace.list() for registered prefix ${JSON.stringify(route.entry.registeredPrefix)}.`);
					}
					return await route.entry.namespaceBinding.list!(options);
				case "parent": {
					const keysByName = new Map<string, KVListKey>();
					for (const entry of route.entries) {
						const relativePath = entry.registeredPrefix.slice(route.originalKeyName.length + 1);
						const keys = await this.#listAllNamespacedKeys(entry, `KV.list(${JSON.stringify(route.originalKeyName)})`);
						for (const key of keys) {
							const name = relativePath ? `${relativePath}.${key.name}` : key.name;
							if (options.prefix && !name.startsWith(options.prefix)) {
								continue;
							}
							keysByName.set(name, {
								...key,
								name,
							});
						}
					}
					return {
						keys: Array.from(keysByName.values()),
						list_complete: true,
						cursor: "",
					};
				}
				case "child":
					throw new TypeError(`KV.list(${JSON.stringify(route.originalKeyName)}) does not support child keys registered in KV.namespaces.`);
				case "legacy":
				case "normal":
					throw new TypeError(`KV.list(${JSON.stringify(route.originalKeyName)}) requires an exact or parent registered prefix in KV.namespaces.`);
			}
		}

		const defaultNamespace = this.namespaces.get("");
		switch (true) {
			case typeof defaultNamespace !== "undefined":
				if (typeof defaultNamespace.list !== "function") {
					throw new TypeError("KV.list() requires the default namespace binding to provide list().");
				}
				return await defaultNamespace.list(keyNameOrOptions);
				// Check whether the Cloudflare REST KV backend is fully configured.
				case Boolean(this.client && this.account_id && this.namespace_id): {
					const params: KeyListParams = {
						account_id: this.account_id!,
						prefix: keyNameOrOptions.prefix,
						limit: keyNameOrOptions.limit,
						cursor: keyNameOrOptions.cursor,
					};
					const keys = await this.client!.kv.namespaces.keys.list(this.namespace_id!, params);
					return {
						keys: keys as KVListKey[],
						list_complete: true,
						cursor: "",
					};
				}
			default:
				throw new TypeError('KV.list() requires a default namespace binding in namespaces[""] or a Cloudflare KV backend.');
		}
	}

	/**
	 * 统一解析 keyName。
	 * Resolve keyName against the instance-level effective namespace map before falling back to legacy behavior.
	 *
	 * 匹配顺序：
	 * Match order:
	 * 1. `KV.namespaces.get(keyName)` 精确命中 / exact hit
	 * 2. `keyName.startsWith(prefix + ".")` 的最长前缀 / longest child prefix
	 * 3. `prefix.startsWith(keyName + ".")` 的父前缀聚合 / parent-prefix aggregation
	 * 4. 未命中且原始 key 以 `@` 开头时返回 legacy / return legacy when unmatched and the original key starts with `@`
	 * 5. 其余未命中返回 normal / remaining unmatched keys return normal
	 *
	 * 返回值中的 `originalKeyName` 始终保留调用方原始输入；只有 child 路由会额外给出 `resolvedKeyName`，而 legacy 路由会额外给出 `rootKeyName` / `path`，用于指出后续 `@path` 读改写实际操作的根 key 与属性路径。
	 * The returned `originalKeyName` always keeps the caller's original input; only the child route adds `resolvedKeyName`, while the legacy route adds `rootKeyName` / `path` to indicate the root key and property path used by subsequent `@path` read-modify-write operations.
	 *
	 * `entry` / `entries` 只表示 `namespaces` 中命中的注册项，也就是“该使用哪个绑定对象”；它们不直接表示最终读写的 KV key。
	 * `entry` / `entries` only represent matched registrations from `namespaces`, meaning "which binding object to use"; they do not directly represent the final KV keys being read or written.
	 *
	 * @param {string} keyName 传入的原始键名 / Incoming original key name.
	 * @returns {NamespaceRoute}
	 */
	#resolveNamespaceRoute(keyName: string): NamespaceRoute {
		const exactNamespace = this.namespaces.get(keyName);
		if (typeof exactNamespace !== "undefined") {
			return {
				kind: "exact",
				originalKeyName: keyName,
				entry: {
					registeredPrefix: keyName,
					namespaceBinding: exactNamespace,
				},
			};
		}

		const childEntries: KVNamespaceEntry[] = [];
		const parentEntries: KVNamespaceEntry[] = [];
		for (const [registeredPrefix, namespaceBinding] of this.namespaces) {
			const isChildPrefix = registeredPrefix === "" ? !keyName.startsWith("@") : keyName.startsWith(`${registeredPrefix}.`);
			const isParentPrefix = registeredPrefix.startsWith(`${keyName}.`);
			if (!isChildPrefix && !isParentPrefix) {
				continue;
			}
			const entry = { registeredPrefix, namespaceBinding };
			if (isChildPrefix) {
				childEntries.push(entry);
			}
			if (isParentPrefix) {
				parentEntries.push(entry);
			}
		}

		if (childEntries.length) {
			const entry = [...childEntries].sort((a, b) => {
				if (a.registeredPrefix.length !== b.registeredPrefix.length) {
					return b.registeredPrefix.length - a.registeredPrefix.length;
				}
				return a.registeredPrefix.localeCompare(b.registeredPrefix);
			})[0]!;
			return {
				kind: "child",
				originalKeyName: keyName,
				resolvedKeyName: entry.registeredPrefix ? keyName.slice(entry.registeredPrefix.length + 1) : keyName,
				entry,
			};
		}

		if (parentEntries.length) {
			return {
				kind: "parent",
				originalKeyName: keyName,
				entries: [...parentEntries].sort((a, b) => {
					if (a.registeredPrefix.length !== b.registeredPrefix.length) {
						return a.registeredPrefix.length - b.registeredPrefix.length;
					}
					return a.registeredPrefix.localeCompare(b.registeredPrefix);
				}),
			};
		}

		if (keyName.startsWith("@")) {
			const { key, path } = keyName.match(KV.#nameRegex)?.groups ?? {};
			return {
				kind: "legacy",
				originalKeyName: keyName,
				rootKeyName: key ?? keyName,
				path,
			};
		}

		return {
			kind: "normal",
			originalKeyName: keyName,
		};
	}

	/**
	 * 分页拉取某个注册 namespace 的全部键。
	 * Fetch all keys from a registered namespace across pages.
	 *
	 * @param {KVNamespaceEntry} entry 命中的注册项；`registeredPrefix` 用于报错信息，`namespaceBinding` 用于实际 list 读取。 / Matched registration entry; `registeredPrefix` is used in error messages and `namespaceBinding` is used for the actual list reads.
	 * @param {string} operation 报错时使用的操作名 / Operation name used in errors.
	 * @returns {Promise<KVListKey[]>}
	 */
	async #listAllNamespacedKeys(entry: KVNamespaceEntry, operation: string): Promise<KVListKey[]> {
		if (typeof entry.namespaceBinding.list !== "function") {
			throw new TypeError(`${operation} requires namespace.list() for registered prefix ${JSON.stringify(entry.registeredPrefix)}.`);
		}
		const keys: KVListKey[] = [];
		const seenCursors = new Set<string>();
		let cursor: string | undefined;
		while (true) {
			const result = await entry.namespaceBinding.list!({ cursor });
			keys.push(...result.keys);
			if (result.list_complete || !result.cursor || seenCursors.has(result.cursor)) {
				break;
			}
			seenCursors.add(result.cursor);
			cursor = result.cursor;
		}
		return keys;
	}

}
/**
 * 尝试将存储值反序列化为 JSON；失败时返回原值。
 * Attempt to deserialize a stored value as JSON; return the raw value on failure.
 *
 * @param {unknown} value 存储原值 / Stored raw value.
 * @returns {unknown}
 */
function deserialize(value: unknown): unknown {
	try {
		return JSON.parse(value as string);
	} catch (error) {
		return value;
	}
}

/**
 * 将任意值序列化为可存储字符串。
 * Serialize any value into a storable string.
 *
 * @param {unknown} value 待序列化值 / Value to serialize.
 * @returns {string}
 */
function serialize(value: unknown): string {
	switch (typeof value) {
		case "object":
			return JSON.stringify(value);
		default:
			return String(value);
	}
}

