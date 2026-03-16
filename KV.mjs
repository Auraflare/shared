import { Lodash as _, Storage } from "@nsnanocat/util";
import Cloudflare from "./Cloudflare.mjs";
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
export class KV {
    static #nameRegex = /^@(?<key>[^.]+)(?:\.(?<path>.*))?$/;
    namespace;
    client;
    account_id;
    namespace_id;
    /**
     * 创建 KV 实例。
     * Create a KV instance.
     *
     * @param {KVInit} [init] 初始化参数 / Initialization input.
     */
    constructor(init) {
        const namespace = resolveNamespace(init);
        const initOptions = isKVInitOptions(init) ? init : undefined;
        this.namespace = namespace ?? undefined;
        this.account_id = initOptions?.account_id ?? initOptions?.accountId ?? undefined;
        this.namespace_id = initOptions?.namespace_id ?? initOptions?.namespaceId ?? undefined;
        if (!this.namespace && initOptions?.client) {
            this.client = initOptions.client;
            return;
        }
        if (!this.namespace && shouldCreateClient(initOptions)) {
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
    async getItem(keyName, defaultValue = null) {
        let keyValue = defaultValue;
        switch (keyName.startsWith("@")) {
            case true: {
                const { key, path } = keyName.match(KV.#nameRegex)?.groups ?? {};
                keyName = key ?? keyName;
                let value = await this.getItem(keyName, {});
                if (typeof value !== "object" || value === null)
                    value = {};
                keyValue = _.get(value, path);
                keyValue = deserialize(keyValue);
                break;
            }
            default:
                switch (true) {
                    case Boolean(this.namespace):
                        keyValue = await this.namespace.get(keyName);
                        break;
                    case this.#hasCloudflareBackend():
                        keyValue = await this.#getCloudflareValue(keyName);
                        break;
                    default:
                        keyValue = Storage.getItem(keyName, defaultValue);
                        break;
                }
                keyValue = deserialize(keyValue);
                break;
        }
        return (keyValue ?? defaultValue);
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
        let result = false;
        const serializedValue = serialize(keyValue);
        switch (keyName.startsWith("@")) {
            case true: {
                const { key, path } = keyName.match(KV.#nameRegex)?.groups ?? {};
                keyName = key ?? keyName;
                let value = await this.getItem(keyName, {});
                if (typeof value !== "object" || value === null)
                    value = {};
                _.set(value, path, serializedValue);
                result = await this.setItem(keyName, value);
                break;
            }
            default:
                switch (true) {
                    case Boolean(this.namespace):
                        await this.namespace.put(keyName, serializedValue);
                        result = true;
                        break;
                    case this.#hasCloudflareBackend():
                        await this.#setCloudflareValue(keyName, serializedValue);
                        result = true;
                        break;
                    default:
                        result = Storage.setItem(keyName, serializedValue);
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
        let result = false;
        switch (keyName.startsWith("@")) {
            case true: {
                const { key, path } = keyName.match(KV.#nameRegex)?.groups ?? {};
                keyName = key ?? keyName;
                let value = await this.getItem(keyName, {});
                if (typeof value !== "object" || value === null)
                    value = {};
                _.unset(value, path);
                result = await this.setItem(keyName, value);
                break;
            }
            default:
                switch (true) {
                    case Boolean(this.namespace):
                        await this.namespace.delete(keyName);
                        result = true;
                        break;
                    case this.#hasCloudflareBackend():
                        await this.#deleteCloudflareValue(keyName);
                        result = true;
                        break;
                    default:
                        result = Storage.removeItem(keyName);
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
     * @returns {Promise<boolean>}
     */
    async clear() {
        return false;
    }
    /**
     * 列出 KV 键。
     * List KV keys.
     *
     * @param {KVListOptions} [options={}] 列举选项 / List options.
     * @returns {Promise<KVListResult>}
     */
    async list(options = {}) {
        switch (true) {
            case Boolean(this.namespace):
                if (typeof this.namespace.list !== "function") {
                    throw new TypeError("KV.list() requires a namespace binding with list().");
                }
                return await this.namespace.list(options);
            case this.#hasCloudflareBackend():
                return await this.#listCloudflareKeys(options);
            default:
                throw new TypeError("KV.list() requires a namespace binding or a Cloudflare KV backend.");
        }
    }
    #hasCloudflareBackend() {
        return Boolean(this.client && this.account_id && this.namespace_id);
    }
    async #getCloudflareValue(keyName) {
        const params = {
            account_id: this.account_id,
        };
        try {
            const response = await this.client.kv.namespaces.values.get(this.namespace_id, keyName, params);
            return await readResponseText(response);
        }
        catch (error) {
            if (isNotFoundError(error))
                return null;
            throw error;
        }
    }
    async #setCloudflareValue(keyName, value) {
        const params = {
            account_id: this.account_id,
            value,
        };
        await this.client.kv.namespaces.values.update(this.namespace_id, keyName, params);
    }
    async #deleteCloudflareValue(keyName) {
        const params = {
            account_id: this.account_id,
        };
        await this.client.kv.namespaces.values.delete(this.namespace_id, keyName, params);
    }
    async #listCloudflareKeys(options) {
        const params = {
            account_id: this.account_id,
            prefix: options.prefix,
            limit: options.limit,
            cursor: options.cursor,
        };
        const page = await this.client.kv.namespaces.keys.list(this.namespace_id, params);
        const cursor = page.result_info.cursor ?? page.result_info.cursors?.after ?? "";
        return {
            keys: page.result,
            list_complete: !page.hasNextPage(),
            cursor,
        };
    }
}
function resolveNamespace(init) {
    if (isNamespaceLike(init))
        return init;
    if (!isKVInitOptions(init))
        return undefined;
    return init.namespace ?? init.env?.namespace;
}
function isNamespaceLike(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.get === "function" &&
        typeof value.put === "function" &&
        typeof value.delete === "function");
}
function isKVInitOptions(value) {
    return typeof value === "object" && value !== null && !isNamespaceLike(value);
}
function shouldCreateClient(init) {
    if (!init)
        return false;
    if (init.client)
        return false;
    return [
        "apiToken",
        "apiKey",
        "apiEmail",
        "userServiceKey",
        "baseURL",
        "fetch",
        "timeout",
        "defaultHeaders",
        "defaultQuery",
        "maxRetries",
        "account_id",
        "namespace_id",
        "accountId",
        "namespaceId",
    ].some(key => key in init);
}
function deserialize(value) {
    try {
        return JSON.parse(value);
    }
    catch (error) {
        return value;
    }
}
function serialize(value) {
    switch (typeof value) {
        case "object":
            return JSON.stringify(value);
        default:
            return String(value);
    }
}
async function readResponseText(response) {
    switch (response.status) {
        case 404:
            return null;
        default:
            return await response.text();
    }
}
function isNotFoundError(error) {
    return Boolean(error &&
        typeof error === "object" &&
        "status" in error &&
        Number(error.status) === 404);
}
