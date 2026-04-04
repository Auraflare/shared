import { Lodash as _, Storage } from "@nsnanocat/util";
import Cloudflare from "./Cloudflare.mjs";

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
	static #nameRegex = /^@(?<key>[^.]+)(?:\.(?<path>.*))?$/;

	/**
	 * 前缀到 KVNamespace 的静态注册表。
	 * Static prefix-to-namespace registry.
	 *
	 * `KV` 的所有实例都会优先读取这个注册表。
	 * All `KV` instances consult this registry before legacy backends.
	 */
	static namespaces = new Map();

	/**
	 * 当前实例的生效前缀映射表。
	 * Effective prefix map for the current instance.
	 *
	 * 构造时会先复制静态 `KV.namespaces`，再合并 `init.namespaces`；其中 `""` 前缀代表默认 namespace。
	 * During construction, it copies static `KV.namespaces`, then merges `init.namespaces`; the `""` prefix represents the default namespace.
	 */
	namespaces;
	client;
	account_id;
	namespace_id;

	/**
	 * 创建 KV 实例。
	 * Create a KV instance.
	 *
	 * @param {import("./KV.d.ts").KVInitOptions | null | undefined} [init] 初始化参数；构造时会生成实例级 `namespaces` 生效映射：先复制静态 `KV.namespaces`，再合并 `init.namespaces`。空字符串前缀 `""` 代表默认 namespace。 / Initialization input; construction creates an instance-level effective `namespaces` map by copying static `KV.namespaces`, then merging `init.namespaces`. The empty-string prefix `""` represents the default namespace.
	 */
	constructor(init) {
		if (
			typeof init === "object" &&
			init !== null &&
			!Array.isArray(init) &&
			typeof init.get === "function" &&
			typeof init.put === "function" &&
			typeof init.delete === "function"
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
		this.namespaces = new Map();
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
	 * @param {T} [defaultValue=null] 默认值 / Default value.
	 * @returns {Promise<T>}
	 */
	async getItem(keyName, defaultValue = null) {
		const route = this.#resolveNamespaceRoute(keyName);
		switch (route.kind) {
			case "child": {
				const keyValue = deserialize(await route.entry.namespace.get(route.keyName));
				return keyValue ?? defaultValue;
			}
			case "exact": {
				const keys = await this.#listAllNamespacedKeys(route.entry, `KV.getItem(${JSON.stringify(route.entry.prefix)})`);
				const settledValues = await Promise.allSettled(
					keys.map(async key => [key.name, deserialize(await route.entry.namespace.get(key.name))]),
				);
				const values = settledValues
					.filter(result => result.status === "fulfilled")
					.map(result => result.value);
				return Object.fromEntries(values);
			}
			case "parent": {
				const value = {};
				for (const entry of route.entries) {
					const keys = await this.#listAllNamespacedKeys(entry, `KV.getItem(${JSON.stringify(entry.prefix)})`);
					const settledValues = await Promise.allSettled(
						keys.map(async key => [key.name, deserialize(await entry.namespace.get(key.name))]),
					);
					const values = settledValues
						.filter(result => result.status === "fulfilled")
						.map(result => result.value);
					_.set(value, entry.prefix.slice(route.logicalKeyName.length + 1), Object.fromEntries(values));
				}
				return value;
			}
			default:
				break;
		}

		let keyValue = defaultValue;
		switch (route.keyName.startsWith("@")) {
			case true: {
				const { key, path } = route.keyName.match(KV.#nameRegex)?.groups ?? {};
				const rootKeyName = key ?? route.keyName;
				let value = await this.getItem(rootKeyName, {});
				if (typeof value !== "object" || value === null) {
					value = {};
				}
				keyValue = _.get(value, path);
				keyValue = deserialize(keyValue);
				break;
			}
			default:
				// The empty-string prefix is the default namespace fallback for plain keys.
				const defaultNamespace = this.namespaces.get("");
				switch (true) {
					case typeof defaultNamespace !== "undefined":
						keyValue = await defaultNamespace.get(route.keyName);
						break;
					// Check whether the Cloudflare REST KV backend is fully configured.
					case Boolean(this.client && this.account_id && this.namespace_id): {
						const params = {
							account_id: this.account_id,
						};
						try {
							const response = await this.client.kv.namespaces.values.get(this.namespace_id, route.keyName, params);
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
							if (error && typeof error === "object" && "status" in error && Number(error.status) === 404) {
								keyValue = null;
								break;
							}
							throw error;
						}
						break;
					}
					default:
						keyValue = Storage.getItem(route.keyName, defaultValue);
						break;
				}
				keyValue = deserialize(keyValue);
				break;
		}
		return keyValue ?? defaultValue;
	}

	/**
	 * 写入存储值。
	 * Write value into persistent storage.
	 *
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @param {unknown} keyValue 写入值 / Value to store.
	 * @returns {Promise<boolean>}
	 */
	async setItem(keyName = String(), keyValue = String()) {
		const route = this.#resolveNamespaceRoute(keyName);
		switch (route.kind) {
			case "child":
				await route.entry.namespace.put(route.keyName, serialize(keyValue));
				return true;
			case "exact": {
				if (!keyValue || typeof keyValue !== "object" || Array.isArray(keyValue)) {
					throw new TypeError(`KV.setItem(${JSON.stringify(route.logicalKeyName)}) requires an object value for exact registered prefixes in KV.namespaces.`);
				}
				const results = await Promise.allSettled(
					Object.entries(keyValue).map(async ([name, value]) => {
						await route.entry.namespace.put(name, serialize(value));
					}),
				);
				return results.every(result => result.status === "fulfilled");
			}
			case "parent":
				throw new TypeError(`KV.setItem(${JSON.stringify(route.logicalKeyName)}) does not support parent registered prefixes in KV.namespaces.`);
			default:
				break;
		}

		let result = false;
		const serializedValue = serialize(keyValue);
		switch (route.keyName.startsWith("@")) {
			case true: {
				const { key, path } = route.keyName.match(KV.#nameRegex)?.groups ?? {};
				const rootKeyName = key ?? route.keyName;
				let value = await this.getItem(rootKeyName, {});
				if (typeof value !== "object" || value === null) {
					value = {};
				}
				_.set(value, path, serializedValue);
				result = await this.setItem(rootKeyName, value);
				break;
			}
			default:
				const defaultNamespace = this.namespaces.get("");
				switch (true) {
					case typeof defaultNamespace !== "undefined":
						await defaultNamespace.put(route.keyName, serializedValue);
						result = true;
						break;
					// Check whether the Cloudflare REST KV backend is fully configured.
					case Boolean(this.client && this.account_id && this.namespace_id): {
						const params = {
							account_id: this.account_id,
							value: serializedValue,
						};
						await this.client.kv.namespaces.values.update(this.namespace_id, route.keyName, params);
						result = true;
						break;
					}
					default:
						result = Storage.setItem(route.keyName, serializedValue);
						break;
				}
				break;
		}
		return result;
	}

	/**
	 * 删除存储值。
	 * Remove value from persistent storage.
	 *
	 * @param {string} keyName 键名或路径键 / Key name or path key.
	 * @returns {Promise<boolean>}
	 */
	async removeItem(keyName) {
		const route = this.#resolveNamespaceRoute(keyName);
		switch (route.kind) {
			case "child":
				await route.entry.namespace.delete(route.keyName);
				return true;
			case "exact": {
				const keys = await this.#listAllNamespacedKeys(route.entry, `KV.clear(${JSON.stringify(route.logicalKeyName)})`);
				const results = await Promise.allSettled(keys.map(async key => await route.entry.namespace.delete(key.name)));
				return results.every(result => result.status === "fulfilled");
			}
			case "parent":
				throw new TypeError(`KV.removeItem(${JSON.stringify(route.logicalKeyName)}) does not support parent registered prefixes in KV.namespaces.`);
			default:
				break;
		}

		let result = false;
		switch (route.keyName.startsWith("@")) {
			case true: {
				const { key, path } = route.keyName.match(KV.#nameRegex)?.groups ?? {};
				const rootKeyName = key ?? route.keyName;
				let value = await this.getItem(rootKeyName, {});
				if (typeof value !== "object" || value === null) {
					value = {};
				}
				_.unset(value, path);
				result = await this.setItem(rootKeyName, value);
				break;
			}
			default:
				const defaultNamespace = this.namespaces.get("");
				switch (true) {
					case typeof defaultNamespace !== "undefined":
						await defaultNamespace.delete(route.keyName);
						result = true;
						break;
					// Check whether the Cloudflare REST KV backend is fully configured.
					case Boolean(this.client && this.account_id && this.namespace_id): {
						const params = {
							account_id: this.account_id,
						};
						await this.client.kv.namespaces.values.delete(this.namespace_id, route.keyName, params);
						result = true;
						break;
					}
					default:
						result = Storage.removeItem(route.keyName);
						break;
				}
				break;
		}
		return result;
	}

	/**
	 * 清空存储。
	 * Clear storage.
	 *
	 * 无参时保持 legacy 语义并返回 `false`；传入参数时只接受 `KV.namespaces` 中的精确注册前缀。
	 * Without arguments, keeps legacy behavior and returns `false`; with an argument, only exact registered prefixes in `KV.namespaces` are allowed.
	 *
	 * @param {string} [keyName] 精确注册前缀 / Exact registered prefix.
	 * @returns {Promise<boolean>}
	 */
	async clear(keyName) {
		if (typeof keyName !== "string") {
			return false;
		}
		const route = this.#resolveNamespaceRoute(keyName);
		if (route.kind !== "exact") {
			throw new TypeError(`KV.clear(${JSON.stringify(keyName)}) requires an exact registered prefix in KV.namespaces.`);
		}
		const keys = await this.#listAllNamespacedKeys(route.entry, `KV.clear(${JSON.stringify(route.logicalKeyName)})`);
		const results = await Promise.allSettled(keys.map(async key => await route.entry.namespace.delete(key.name)));
		return results.every(result => result.status === "fulfilled");
	}

	/**
	 * 列出 KV 键。
	 * List KV keys.
	 *
	 * 传入 options 时始终走 legacy backend；传入 string 时使用 `KV.namespaces` 做 exact / parent 注册前缀解析。
	 * Passing options always uses legacy backends; passing a string resolves exact / parent registered prefixes via `KV.namespaces`.
	 *
	 * @param {import("./KV.d.ts").KVListOptions|string} [keyNameOrOptions={}] 注册前缀或 legacy 列举选项 / Registered prefix or legacy list options.
	 * @param {import("./KV.d.ts").KVListOptions} [options={}] 列举选项 / List options.
	 * @returns {Promise<import("./KV.d.ts").KVListResult>}
	 */
	async list(keyNameOrOptions = {}, options = {}) {
		if (typeof keyNameOrOptions === "string") {
			const route = this.#resolveNamespaceRoute(keyNameOrOptions);
			switch (route.kind) {
				case "exact":
					if (typeof route.entry.namespace.list !== "function") {
						throw new TypeError(`KV.list(${JSON.stringify(route.entry.prefix)}) requires namespace.list() for registered prefix ${JSON.stringify(route.entry.prefix)}.`);
					}
					return await route.entry.namespace.list(options);
				case "parent": {
					const keysByName = new Map();
					for (const entry of route.entries) {
						const relativePath = entry.prefix.slice(route.logicalKeyName.length + 1);
						const keys = await this.#listAllNamespacedKeys(entry, `KV.list(${JSON.stringify(route.logicalKeyName)})`);
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
					throw new TypeError(`KV.list(${JSON.stringify(route.logicalKeyName)}) does not support child keys registered in KV.namespaces.`);
				default:
					throw new TypeError(`KV.list(${JSON.stringify(keyNameOrOptions)}) requires an exact or parent registered prefix in KV.namespaces.`);
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
					const params = {
						account_id: this.account_id,
						prefix: keyNameOrOptions.prefix,
						limit: keyNameOrOptions.limit,
						cursor: keyNameOrOptions.cursor,
					};
					const keys = await this.client.kv.namespaces.keys.list(this.namespace_id, params);
					return {
						keys,
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
	 * 4. 未命中时返回 legacy / legacy fallback when unmatched
	 *
	 * child 命中后会切掉前缀和分隔点，只保留后缀作为真实 keyName。
	 * After a child match, the prefix and separator are removed and only the suffix is kept as the real keyName.
	 *
	 * @param {string} keyName 传入的逻辑键 / Incoming logical key.
	 * @returns {{ kind: "legacy", logicalKeyName: string, keyName: string } | { kind: "exact", logicalKeyName: string, keyName: string, entry: { prefix: string, namespace: import("./KV.d.ts").KVNamespaceLike } } | { kind: "child", logicalKeyName: string, keyName: string, entry: { prefix: string, namespace: import("./KV.d.ts").KVNamespaceLike } } | { kind: "parent", logicalKeyName: string, keyName: string, entries: Array<{ prefix: string, namespace: import("./KV.d.ts").KVNamespaceLike }> }}
	 */
	#resolveNamespaceRoute(keyName) {
		const exactNamespace = this.namespaces.get(keyName);
		if (typeof exactNamespace !== "undefined") {
			return {
				kind: "exact",
				logicalKeyName: keyName,
				keyName,
				entry: {
					prefix: keyName,
					namespace: exactNamespace,
				},
			};
		}

		const childEntries = [];
		const parentEntries = [];
		for (const [prefix, namespace] of this.namespaces) {
			const isChildPrefix = prefix === "" ? !keyName.startsWith("@") : keyName.startsWith(`${prefix}.`);
			const isParentPrefix = prefix.startsWith(`${keyName}.`);
			if (!isChildPrefix && !isParentPrefix) {
				continue;
			}
			const entry = { prefix, namespace };
			if (isChildPrefix) {
				childEntries.push(entry);
			}
			if (isParentPrefix) {
				parentEntries.push(entry);
			}
		}

		if (childEntries.length) {
			const entry = [...childEntries].sort((a, b) => {
				if (a.prefix.length !== b.prefix.length) {
					return b.prefix.length - a.prefix.length;
				}
				return a.prefix.localeCompare(b.prefix);
			})[0];
			return {
				kind: "child",
				logicalKeyName: keyName,
				keyName: entry.prefix ? keyName.slice(entry.prefix.length + 1) : keyName,
				entry,
			};
		}

		if (parentEntries.length) {
			return {
				kind: "parent",
				logicalKeyName: keyName,
				keyName,
				entries: [...parentEntries].sort((a, b) => {
					if (a.prefix.length !== b.prefix.length) {
						return a.prefix.length - b.prefix.length;
					}
					return a.prefix.localeCompare(b.prefix);
				}),
			};
		}

		return {
			kind: "legacy",
			logicalKeyName: keyName,
			keyName,
		};
	}

	/**
	 * 分页拉取某个注册 namespace 的全部键。
	 * Fetch all keys from a registered namespace across pages.
	 *
	 * @param {{ prefix: string, namespace: import("./KV.d.ts").KVNamespaceLike }} entry 注册前缀条目 / Registered prefix entry.
	 * @param {string} operation 报错时使用的操作名 / Operation name used in errors.
	 * @returns {Promise<Array<{ name: string, expiration?: number, metadata?: unknown }>>}
	 */
	async #listAllNamespacedKeys(entry, operation) {
		if (typeof entry.namespace.list !== "function") {
			throw new TypeError(`${operation} requires namespace.list() for registered prefix ${JSON.stringify(entry.prefix)}.`);
		}
		const keys = [];
		const seenCursors = new Set();
		let cursor;
		while (true) {
			const result = await entry.namespace.list({ cursor });
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
function deserialize(value) {
	try {
		return JSON.parse(value);
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
function serialize(value) {
	switch (typeof value) {
		case "object":
			return JSON.stringify(value);
		default:
			return String(value);
	}
}

