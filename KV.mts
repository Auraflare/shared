import { Lodash as _, Storage } from "@nsnanocat/util";
import Cloudflare, {
	type ClientOptions,
} from "./Cloudflare.mjs";

/**
 * Cloudflare Workers KVNamespace 兼容接口。
 * Cloudflare Workers KVNamespace compatible interface.
 */
export interface KVNamespaceLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
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
 * `registeredPrefix` 用于指出 `namespaces` 中命中的注册前缀；`namespaceBinding` 就是该前缀绑定的 `KVNamespaceLike` 对象，后续实际读写会调用它；`relativePath` 只在需要把调用路径裁剪成真实 namespace key 时出现。
 * `registeredPrefix` identifies the matched registration key in `namespaces`; `namespaceBinding` is the `KVNamespaceLike` bound to that prefix and receives the actual I/O calls; `relativePath` only appears when the caller path must be trimmed into the real namespace key.
 */
interface KVNamespaceEntry {
	registeredPrefix: string;
	namespaceBinding: KVNamespaceLike;
	relativePath?: string;
}

/**·    
 * KV 路由解析结果。
 * KV route resolution result.
 *
 * `originalKeyName` 始终保留调用方传入的原始 key；它不负责定位 `namespaces`，而是用于保持报错信息、legacy 回退和父级聚合裁剪逻辑与调用方输入一致。
 * `originalKeyName` always keeps the caller's original key; it is not used to locate `namespaces`, but keeps error messages, legacy fallback, and parent aggregation trimming aligned with the caller input.
 *
 * `child` 与 `parent` 路由都会把剩余路径收敛到命中 entry 的 `relativePath`；其中 `child` 会继续执行真实读写，`parent` 仅用于阻止误回退到 legacy。只有 `legacy` 路由包含 `rootKeyName` / `path`，因为只有它需要在 `@path` 语义下描述根 key 与属性路径。
 * Both `child` and `parent` routes converge their remaining paths into the matched entry's `relativePath`; `child` continues to real I/O, while `parent` only prevents accidental fallback to legacy behavior. Only the `legacy` route includes `rootKeyName` / `path`, because only it needs to describe the root key and property path used by `@path` semantics.
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
			/** 命中的单个注册项；其 `relativePath` 等于裁掉注册前缀后的剩余后缀，也就是实际传给 namespace 绑定的 key。 / Single matched registration; its `relativePath` is the suffix left after stripping the registered prefix, which becomes the actual key passed to the namespace binding. */
			entry: KVNamespaceEntry;
	  }
	| {
			kind: "parent";
			/** 原始输入 key；用于保持父级注册前缀命中的报错和调用语义。 / Original input key used to preserve error messages and caller semantics for parent-prefix matches. */
			originalKeyName: string;
			/** 命中的多个注册项；每项都带有已解析好的 `relativePath`，用于显式标记仍存在更深层注册前缀。 / Multiple matched registrations; each entry carries a pre-resolved `relativePath` to explicitly mark that deeper registered prefixes still exist. */
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
 * const cacheTheme = await kv.getItem("@iRingo.Maps.Caches.a", "light");
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
				const keyValue = deserialize(await route.entry.namespaceBinding.get(route.entry.relativePath!));
				return (keyValue ?? defaultValue) as T;
			}
			case "exact":
				throw new TypeError(`KV.getItem(${JSON.stringify(route.originalKeyName)}) no longer supports exact registered prefixes in KV.namespaces after list() removal.`);
			case "parent":
				throw new TypeError(`KV.getItem(${JSON.stringify(route.originalKeyName)}) no longer supports parent registered prefixes in KV.namespaces after list() removal.`);
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
				await route.entry.namespaceBinding.put(route.entry.relativePath!, serialize(keyValue));
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
				await route.entry.namespaceBinding.delete(route.entry.relativePath!);
				return true;
			case "exact":
				throw new TypeError(`KV.removeItem(${JSON.stringify(route.originalKeyName)}) no longer supports exact registered prefixes in KV.namespaces after list() removal.`);
			case "parent":
				throw new TypeError(`KV.removeItem(${JSON.stringify(route.originalKeyName)}) no longer supports parent registered prefixes in KV.namespaces after list() removal.`);
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
	 * 无参时保持 legacy 语义并返回 `false`；移除 `list()` 后，不再支持基于注册前缀的批量 clear。
	 * Without arguments, keeps legacy behavior and returns `false`; after `list()` removal, prefix-based bulk clear is no longer supported.
	 *
	 * @returns {Promise<boolean>}
	 */
	async clear(): Promise<boolean>;
	async clear(keyName?: string): Promise<boolean> {
		if (typeof keyName !== "string") {
			return false;
		}
		throw new TypeError(`KV.clear(${JSON.stringify(keyName)}) no longer supports keyName arguments after list() removal.`);
	}

	/**
	 * 统一解析 keyName。
	 * Resolve keyName against the instance-level effective namespace map before falling back to legacy behavior.
	 *
	 * 执行步骤：
	 * Execution steps:
	 * 1. 先用 `KV.namespaces.get(keyName)` 尝试精确命中；命中后立即返回 `exact`，不再继续扫描。 / First try an exact hit via `KV.namespaces.get(keyName)`; return `exact` immediately when matched and skip further scanning.
	 * 2. 再用 `KV.#nameRegex` 对原始 key 做一次单点解析，预先判断它是否属于 `@path` 语义，并复用这份结果给后续 legacy / normal 判定。 / Then parse the original key once with `KV.#nameRegex` to determine whether it belongs to `@path` semantics, and reuse that result for later legacy / normal routing.
	 * 3. 之后遍历 `this.namespaces.entries()`：空前缀 `""` 先单独处理，只接收非 legacy key；其余前缀的 child 用 `keyName.startsWith(prefix + ".")` 判断，parent 用 `prefix.startsWith(keyName + ".")` 判断。这里保留 parent 只是为了显式阻止回退到 legacy，并报告“不再支持”的行为边界。 / After that, iterate `this.namespaces.entries()`: the empty prefix `""` is handled first and only accepts non-legacy keys; for all other prefixes, child uses `keyName.startsWith(prefix + ".")` and parent uses `prefix.startsWith(keyName + ".")`. Parent is retained only to explicitly block fallback to legacy and report unsupported behavior.
	 * 4. 如果存在 child 命中，则在扫描过程中持续保留“最长前缀优先”的最佳命中。 / If a child match exists, keep the current best match during the scan with longest-prefix priority.
	 * 5. 否则如果存在 parent 候选，则按前缀长度从短到长排序后返回受限路由，用于明确这些父级前缀已不再支持聚合操作。 / Otherwise, if parent candidates exist, sort them from shorter to longer prefixes and return a restricted route so these parent prefixes can fail explicitly instead of aggregating.
	 * 6. 最后才根据第二步的 regex 结果，在未命中注册前缀时返回 `legacy` 或 `normal`。 / Finally, fall back to `legacy` or `normal` based on the regex result from step 2 when no registered prefix matches.
	 *
	 * 最终返回规则：
	 * Final route rules:
	 * 1. 精确命中返回 `exact`。 / Exact hits return `exact`.
	 * 2. 子路径命中返回 `child`。 / Descendant-prefix hits return `child`.
	 * 3. 父级注册前缀命中返回 `parent`。 / Parent registered-prefix hits return `parent`.
	 * 4. 未命中但 regex 命中返回 `legacy`。 / Unmatched keys with a regex hit return `legacy`.
	 * 5. 其余情况返回 `normal`。 / All remaining unmatched keys return `normal`.
	 *
	 * 返回值中的 `originalKeyName` 始终保留调用方原始输入；child 与 parent 路由都会把剩余路径收敛到 entry 的 `relativePath`，其中 parent 仅用于显式报错；legacy 路由则额外给出 `rootKeyName` / `path`，用于指出后续 `@path` 读改写实际操作的根 key 与属性路径。
	 * The returned `originalKeyName` always keeps the caller's original input; both child and parent routes converge their remaining paths into each entry's `relativePath`, with parent only used for explicit errors; the legacy route adds `rootKeyName` / `path` to indicate the root key and property path used by subsequent `@path` read-modify-write operations.
	 *
	 * `entry` / `entries` 只表示 `namespaces` 中命中的注册项，也就是“该使用哪个绑定对象或该阻止哪类回退”；它们不直接表示最终读写的 KV key。
	 * `entry` / `entries` only represent matched registrations from `namespaces`, meaning "which binding object to use or which fallback to block"; they do not directly represent the final KV keys being read or written.
	 *
	 * @param {string} keyName 传入的原始键名 / Incoming original key name.
	 * @returns {NamespaceRoute}
	 */
	#resolveNamespaceRoute(keyName: string): NamespaceRoute {
		// 第一步：先做精确命中，命中后直接返回。
		// Step 1: perform the exact lookup first and return immediately on hit.
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
		// 第二步：只解析一次 `@path` 语义，供后续 normal / legacy / empty-prefix 判断复用。
		// Step 2: parse `@path` exactly once so normal / legacy / empty-prefix checks can reuse it.
		const legacyMatch = keyName.match(KV.#nameRegex);

		// 第三步：扫描全部注册前缀；空前缀先单独处理，其他前缀再分别判断 child / parent。
		// Step 3: scan all registered prefixes; handle the empty prefix first, then evaluate child / parent for every other prefix.
		let childEntry: KVNamespaceEntry | undefined;
		const parentEntries: KVNamespaceEntry[] = [];
		for (const [prefix, binding] of this.namespaces) {
			if (prefix === "") {
				if (!legacyMatch) {
					childEntry = {
						registeredPrefix: prefix,
						namespaceBinding: binding,
						relativePath: keyName,
					};
				}
				continue;
			}

			const isChildPrefix = keyName.startsWith(`${prefix}.`);
			const isParentPrefix = prefix.startsWith(`${keyName}.`);
			if (!isChildPrefix && !isParentPrefix) {
				continue;
			}
			const entry = { registeredPrefix: prefix, namespaceBinding: binding };
			if (isChildPrefix) {
				const childCandidate = {
					...entry,
					relativePath: keyName.replace(`${prefix}.`, ""),
				};
				if (
					typeof childEntry === "undefined" ||
					childCandidate.registeredPrefix.length > childEntry.registeredPrefix.length ||
					(childCandidate.registeredPrefix.length === childEntry.registeredPrefix.length &&
						childCandidate.registeredPrefix.localeCompare(childEntry.registeredPrefix) < 0)
				) {
					childEntry = childCandidate;
				}
			}
			if (isParentPrefix) {
				parentEntries.push({
					...entry,
					relativePath: prefix.replace(`${keyName}.`, ""),
				});
			}
		}

		if (childEntry) {
			return {
				kind: "child",
				originalKeyName: keyName,
				entry: childEntry,
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

		if (legacyMatch) {
			const { key, path } = legacyMatch.groups ?? {};
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

