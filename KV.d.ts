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
    namespace?: KVNamespaceLike | null;
    env?: {
        namespace?: KVNamespaceLike | null;
        [key: string]: unknown;
    };
    client?: Cloudflare;
    account_id?: string;
    namespace_id?: string;
    accountId?: string;
    namespaceId?: string;
}
/**
 * KV 初始化参数。
 * KV initialization input.
 */
type KVInit = KVNamespaceLike | KVInitOptions | null | undefined;
/**
 * Cloudflare KV 异步适配器。
 * Cloudflare KV async adapter.
 *
 * `KV` 提供和 `Storage` 接近的读写接口，优先使用 Worker `KVNamespace`，其次使用 `Cloudflare` client，再其次用认证信息即时创建 client，最后回退到 util `Storage`。
 * `KV` provides a `Storage`-like read/write API, preferring a Worker `KVNamespace`, then a `Cloudflare` client, then auth-based client creation, and finally util `Storage`.
 *
 * 示例：
 * Example:
 *
 * ```ts
 * const kv = new KV({
 * 	apiToken: process.env.CLOUDFLARE_API_TOKEN,
 * 	account_id: "account-id",
 * 	namespace_id: "namespace-id",
 * });
 *
 * await kv.setItem("@settings.theme", "dark");
 * const theme = await kv.getItem("@settings.theme", "light");
 * ```
 */
export declare class KV {
    #private;
    readonly namespace?: KVNamespaceLike;
    readonly client?: Cloudflare;
    readonly account_id?: string;
    readonly namespace_id?: string;
    /**
     * 创建 KV 实例。
     * Create a KV instance.
     *
     * @param {KVInit} [init] 初始化参数 / Initialization input.
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
     * @returns {Promise<boolean>}
     */
    clear(): Promise<boolean>;
    /**
     * 列出 KV 键。
     * List KV keys.
     *
     * @param {KVListOptions} [options={}] 列举选项 / List options.
     * @returns {Promise<KVListResult>}
     */
    list(options?: KVListOptions): Promise<KVListResult>;
}
