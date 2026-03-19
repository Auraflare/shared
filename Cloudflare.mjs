import { fetch as utilFetch, notification } from "@nsnanocat/util";
const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);
/**
 * Cloudflare 静态请求行为选项。
 * Cloudflare static request behavior options.
 *
 * @typedef {object} CloudflareFetchOptions
 * @property {number} [maxRetries] 最大重试次数（覆盖客户端默认值） / Max retry count (overrides client default).
 * @property {"json" | "binary"} [responseType] 响应类型，`binary` 时返回原始 `FetchResponse` / Response type; `binary` returns raw `FetchResponse`.
 * @property {boolean} [notify] 是否根据 `messages/errors` 发送通知 / Whether to emit notifications from `messages/errors`.
 */
/**
 * Cloudflare API 错误。
 * Cloudflare API error.
 */
export class CloudflareAPIError extends Error {
    status;
    errors;
    body;
    /**
     * 创建 API 错误。
     * Create an API error.
     *
     * @param {string} message 错误消息 / Error message.
     * @param {{ status?: number; errors?: CloudflareAPIErrorEntry[]; body?: unknown }} [init={}] 错误上下文 / Error context.
     */
    constructor(message, init = {}) {
        super(message);
        this.name = "CloudflareAPIError";
        this.status = init.status;
        this.errors = init.errors;
        this.body = init.body;
    }
}
class APIResource {
    _client;
    constructor(client) {
        this._client = client;
    }
}
/**
 * 用户资源。
 * User resource.
 */
class UserResource extends APIResource {
    tokens = new UserTokensResource(this._client);
    /**
     * 获取当前用户。
     * Get the current user.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<UserGetResponse>}
     */
    get(options) {
        return getResult(this._client, "/user", options);
    }
}
/**
 * 用户 Token 资源。
 * User token resource.
 */
class UserTokensResource extends APIResource {
    /**
     * 校验当前 Token。
     * Verify the current token.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<TokenVerifyResponse>}
     */
    verify(options) {
        return getResult(this._client, "/user/tokens/verify", options);
    }
}
/**
 * Zone 资源。
 * Zone resource.
 */
class ZonesResource extends APIResource {
    /**
     * 列出 Zone。
     * List zones.
     *
     * @param {ZoneListParams | RequestOptions} [queryOrOptions] 查询参数或请求选项 / Query params or request options.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Zone[]>}
     */
    list(queryOrOptions, options) {
        // Keep the existing "query or options" call style without relying on extra helpers.
        const isOptions = typeof queryOrOptions === "object" &&
            queryOrOptions !== null &&
            ["headers", "query", "timeout", "maxRetries"].some(key => key in queryOrOptions);
        const query = isOptions ? {} : { ...(queryOrOptions ?? {}) };
        const requestOptions = isOptions ? queryOrOptions : options;
        return getResult(this._client, "/zones", {
            ...requestOptions,
            query: {
                ...(requestOptions?.query ?? {}),
                ...query,
            },
        });
    }
    /**
     * 获取 Zone。
     * Get a zone.
     *
     * @param {ZoneGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Zone>}
     */
    get(params, options) {
        return getResult(this._client, `/zones/${encodeURIComponent(params.zone_id)}`, options);
    }
}
/**
 * DNS 资源。
 * DNS resource.
 */
class DNSResource extends APIResource {
    records = new DNSRecordsResource(this._client);
}
/**
 * DNS 记录资源。
 * DNS records resource.
 */
class DNSRecordsResource extends APIResource {
    /**
     * 创建 DNS 记录。
     * Create a DNS record.
     *
     * @param {RecordCreateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    create(params, options) {
        const { zone_id, ...body } = params;
        return postResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records`, {
            ...options,
            body,
        });
    }
    /**
     * 覆盖更新 DNS 记录。
     * Overwrite a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    update(dnsRecordId, params, options) {
        const { zone_id, ...body } = params;
        return putResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`, {
            ...options,
            body,
        });
    }
    /**
     * 列出 DNS 记录。
     * List DNS records.
     *
     * @param {RecordListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse[]>}
     */
    list(params, options) {
        const { zone_id, ...query } = params;
        return getResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records`, {
            ...options,
            query: {
                ...(options?.query ?? {}),
                ...query,
            },
        });
    }
    /**
     * 删除 DNS 记录。
     * Delete a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordDeleteParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordDeleteResponse>}
     */
    delete(dnsRecordId, params, options) {
        return deleteResult(this._client, `/zones/${encodeURIComponent(params.zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`, options);
    }
    /**
     * 增量更新 DNS 记录。
     * Patch a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordEditParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    edit(dnsRecordId, params, options) {
        const { zone_id, ...body } = params;
        return patchResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`, {
            ...options,
            body,
        });
    }
    /**
     * 获取 DNS 记录。
     * Get a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    get(dnsRecordId, params, options) {
        return getResult(this._client, `/zones/${encodeURIComponent(params.zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`, options);
    }
}
/**
 * KV 资源。
 * KV resource.
 */
class KVResource extends APIResource {
    namespaces = new NamespacesResource(this._client);
}
/**
 * KV Namespace 资源。
 * KV namespace resource.
 */
class NamespacesResource extends APIResource {
    keys = new KeysResource(this._client);
    metadata = new MetadataResource(this._client);
    values = new ValuesResource(this._client);
    /**
     * 创建 Namespace。
     * Create a namespace.
     *
     * @param {NamespaceCreateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Namespace>}
     */
    create(params, options) {
        const { account_id, ...body } = params;
        return postResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces`, {
            ...options,
            body,
        });
    }
    /**
     * 更新 Namespace。
     * Update a namespace.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Namespace>}
     */
    update(namespaceId, params, options) {
        const { account_id, ...body } = params;
        return putResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`, {
            ...options,
            body,
        });
    }
    /**
     * 列出 Namespace。
     * List namespaces.
     *
     * @param {NamespaceListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Namespace[]>}
     */
    list(params, options) {
        const { account_id, ...query } = params;
        return getResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces`, {
            ...options,
            query: {
                ...(options?.query ?? {}),
                ...query,
            },
        });
    }
    /**
     * 删除 Namespace。
     * Delete a namespace.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceDeleteParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceDeleteResponse | null>}
     */
    delete(namespaceId, params, options) {
        return deleteResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`, options);
    }
    /**
     * 批量删除 KV 键。
     * Bulk delete KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceBulkDeleteParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceBulkDeleteResponse | null>}
     */
    bulkDelete(namespaceId, params, options) {
        return postResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/delete`, {
            ...options,
            body: params.body,
        });
    }
    /**
     * 批量读取 KV 键。
     * Bulk get KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceBulkGetParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceBulkGetResponse | null>}
     */
    bulkGet(namespaceId, params, options) {
        const { account_id, ...body } = params;
        return postResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/get`, {
            ...options,
            body,
        });
    }
    /**
     * 批量写入 KV 键。
     * Bulk update KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceBulkUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceBulkUpdateResponse | null>}
     */
    bulkUpdate(namespaceId, params, options) {
        return putResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk`, {
            ...options,
            body: params.body,
        });
    }
    /**
     * 获取 Namespace。
     * Get a namespace.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Namespace>}
     */
    get(namespaceId, params, options) {
        return getResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`, options);
    }
}
/**
 * KV 键资源。
 * KV keys resource.
 */
class KeysResource extends APIResource {
    /**
     * 列出 KV 键。
     * List KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Key[]>}
     */
    list(namespaceId, params, options) {
        const { account_id, ...query } = params;
        return getResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/keys`, {
            ...options,
            query: {
                ...(options?.query ?? {}),
                ...query,
            },
        });
    }
    /**
     * 批量删除 KV 键。
     * Bulk delete KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyBulkDeleteParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<KeyBulkDeleteResponse | null>}
     */
    bulkDelete(namespaceId, params, options) {
        return postResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/delete`, {
            ...options,
            body: params.body,
        });
    }
    /**
     * 批量读取 KV 键。
     * Bulk get KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyBulkGetParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<KeyBulkGetResponse | null>}
     */
    bulkGet(namespaceId, params, options) {
        const { account_id, ...body } = params;
        return postResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/get`, {
            ...options,
            body,
        });
    }
    /**
     * 批量写入 KV 键。
     * Bulk update KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyBulkUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<KeyBulkUpdateResponse | null>}
     */
    bulkUpdate(namespaceId, params, options) {
        return putResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk`, {
            ...options,
            body: params.body,
        });
    }
}
/**
 * KV 元数据资源。
 * KV metadata resource.
 */
class MetadataResource extends APIResource {
    /**
     * 读取 KV 元数据。
     * Get KV metadata.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {string} keyName 键名 / Key name.
     * @param {MetadataGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<MetadataGetResponse>}
     */
    get(namespaceId, keyName, params, options) {
        return getResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/metadata/${encodeURIComponent(keyName)}`, options);
    }
}
/**
 * KV 值资源。
 * KV values resource.
 */
class ValuesResource extends APIResource {
    /**
     * 写入 KV 值。
     * Update a KV value.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {string} keyName 键名 / Key name.
     * @param {ValueUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<ValueUpdateResponse | null>}
     */
    update(namespaceId, keyName, params, options) {
        const { account_id, expiration, expiration_ttl, value, metadata } = params;
        let body = value;
        let headers = {
            ...options?.headers,
            "Content-Type": "text/plain;charset=UTF-8",
        };
        // Cloudflare KV uses multipart when metadata is present.
        if (metadata !== undefined) {
            const formData = new FormData();
            formData.append("value", value);
            formData.append("metadata", JSON.stringify(metadata));
            body = formData;
            headers = { ...options?.headers };
        }
        return putResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`, {
            ...options,
            query: {
                expiration,
                expiration_ttl,
            },
            body,
            headers,
        });
    }
    /**
     * 读取 KV 值。
     * Get a KV value.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {string} keyName 键名 / Key name.
     * @param {ValueGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<FetchResponse>}
     */
    get(namespaceId, keyName, params, options) {
        return getBinaryResponse(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`, {
            ...options,
            headers: {
                ...options?.headers,
                Accept: "application/octet-stream",
            },
        });
    }
    /**
     * 删除 KV 值。
     * Delete a KV value.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {string} keyName 键名 / Key name.
     * @param {ValueDeleteParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<ValueDeleteResponse | null>}
     */
    delete(namespaceId, keyName, params, options) {
        return deleteResult(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`, options);
    }
}
/**
 * Cloudflare API 客户端。
 * Cloudflare API client.
 *
 * 使用 `new Cloudflare(options)` 创建实例，然后通过 `user`、`zones`、`dns.records`、`kv.namespaces` 调用当前支持的资源。
 * Create an instance with `new Cloudflare(options)`, then use `user`, `zones`, `dns.records`, and `kv.namespaces` for the supported resources.
 *
 * 示例：
 * Example:
 *
 * ```ts
 * const client = new Cloudflare({ apiToken: process.env.CLOUDFLARE_API_TOKEN });
 * const zone = await client.zones.get({ zone_id: "your-zone-id" });
 * const response = await client.kv.namespaces.values.get("namespace-id", "KEY", {
 * 	account_id: "account-id",
 * });
 * const value = response.body ?? "";
 * ```
 */
export class Cloudflare {
    apiToken;
    apiKey;
    apiEmail;
    userServiceKey;
    baseURL;
    apiVersion;
    timeout;
    httpAgent;
    maxRetries;
    defaultHeaders;
    defaultQuery;
    user = new UserResource(this);
    zones = new ZonesResource(this);
    dns = new DNSResource(this);
    kv = new KVResource(this);
    /**
     * 创建 Cloudflare 客户端。
     * Create a Cloudflare client.
     *
     * @param {ClientOptions} [options={}] 客户端选项 / Client options.
     */
    constructor(options = {}) {
        this.apiToken = options.apiToken ?? readEnv("CLOUDFLARE_API_TOKEN");
        this.apiKey = options.apiKey ?? readEnv("CLOUDFLARE_API_KEY");
        this.apiEmail = options.apiEmail ?? readEnv("CLOUDFLARE_EMAIL");
        this.userServiceKey = options.userServiceKey ?? readEnv("CLOUDFLARE_API_USER_SERVICE_KEY");
        const baseURL = options.baseURL ?? readEnv("CLOUDFLARE_BASE_URL") ?? DEFAULT_BASE_URL;
        this.baseURL = baseURL.replace(/\/+$/, "");
        this.apiVersion = options.apiVersion ?? null;
        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
        this.httpAgent = options.httpAgent;
        this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.defaultHeaders = { ...(options.defaultHeaders ?? {}) };
        this.defaultQuery = { ...(options.defaultQuery ?? {}) };
    }
    /**
     * 执行 Cloudflare API 请求（默认解析 JSON，并统一处理错误与通知）。
     * Execute a Cloudflare API request (JSON-first with unified error/notification handling).
     *
     * @template Result 返回结果类型 / Result type.
     * @param {FetchRequest} request 请求对象 / Request object.
     * @param {CloudflareFetchOptions} [options={}] 请求行为选项 / Request behavior options.
     * @returns {Promise<Result | FetchResponse>} 解析结果或原始响应 / Parsed result or raw response.
     */
    static async fetch(request, options = {}) {
        const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
        let attempt = 0;
        while (true) {
            try {
                const response = await utilFetch(request);
                switch (true) {
                    // 命中可重试状态且未超过上限：指数退避后重试。
                    // Retry with exponential backoff for retryable status while attempts remain.
                    case attempt < maxRetries && (RETRYABLE_STATUS_CODES.has(response.status) || response.status >= 500):
                        await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
                        attempt += 1;
                        continue;
                    default:
                        break;
                }
                switch (options.responseType) {
                    case "binary":
                        if (!response.ok)
                            throw await createError(response);
                        return response;
                    default: {
                        const body = parseResponseBody(response);
                        const envelope = toCloudflareEnvelope(body);
                        if (options.notify !== false && envelope)
                            notifyEnvelope(envelope);
                        if (!response.ok || envelope?.success === false)
                            throw await createError(response, envelope ?? body);
                        if (envelope)
                            return (envelope.result ?? null);
                        return body;
                    }
                }
            }
            catch (error) {
                switch (true) {
                    // 已达到重试上限，抛出最后一次错误。
                    // Throw the last error once retry budget is exhausted.
                    case attempt >= maxRetries:
                        throw error;
                    // 仍可重试时先退避，再进行下一次请求。
                    // Back off and retry when retry budget is still available.
                    default:
                        await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
                        attempt += 1;
                        break;
                }
            }
        }
    }
    /**
     * 追踪默认线路。
     * Trace the default route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>} 追踪结果对象 / Trace result map.
     */
    static async trace(options) {
        return await Cloudflare.#trace("https://cloudflare.com/cdn-cgi/trace", options);
    }
    /**
     * 追踪 IPv4 线路。
     * Trace the IPv4 route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>} 追踪结果对象 / Trace result map.
     */
    static async trace4(options) {
        return await Cloudflare.#trace("https://162.159.36.1/cdn-cgi/trace", options);
    }
    /**
     * 追踪 IPv6 线路。
     * Trace the IPv6 route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>} 追踪结果对象 / Trace result map.
     */
    static async trace6(options) {
        return await Cloudflare.#trace("https://[2606:4700:4700::1111]/cdn-cgi/trace", options);
    }
    /**
     * 访问 Cloudflare Trace 端点并解析键值结果。
     * Request Cloudflare trace endpoint and parse key-value output.
     *
     * @param {string} url 请求地址 / Request URL.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>} 追踪结果对象 / Trace result map.
     */
    static async #trace(url, options) {
        const rawResponse = await utilFetch(url, {
            method: "GET",
            timeout: options?.timeout ?? DEFAULT_TIMEOUT,
            headers: options?.headers,
        });
        const body = rawResponse.body ?? "";
        return Object.fromEntries(body
            .trim()
            .split("\n")
            .map(line => line.split("=", 2))
            .filter(parts => parts.length === 2));
    }
}
export default Cloudflare;
/**
 * 发送 GET 并返回解析后的结果。
 * Send GET and return parsed result.
 *
 * @template Result 返回类型 / Result type.
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions} [options] 请求选项 / Request options.
 * @returns {Promise<Result>} 解析后的结果 / Parsed result.
 */
async function getResult(client, path, options) {
    return await requestClient(client, "GET", path, options);
}
/**
 * 发送 POST 并返回解析后的结果。
 * Send POST and return parsed result.
 *
 * @template Result 返回类型 / Result type.
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions & { body?: unknown }} [options] 请求选项 / Request options.
 * @returns {Promise<Result>} 解析后的结果 / Parsed result.
 */
async function postResult(client, path, options) {
    return await requestClient(client, "POST", path, options);
}
/**
 * 发送 PUT 并返回解析后的结果。
 * Send PUT and return parsed result.
 *
 * @template Result 返回类型 / Result type.
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions & { body?: unknown }} [options] 请求选项 / Request options.
 * @returns {Promise<Result>} 解析后的结果 / Parsed result.
 */
async function putResult(client, path, options) {
    return await requestClient(client, "PUT", path, options);
}
/**
 * 发送 PATCH 并返回解析后的结果。
 * Send PATCH and return parsed result.
 *
 * @template Result 返回类型 / Result type.
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions & { body?: unknown }} [options] 请求选项 / Request options.
 * @returns {Promise<Result>} 解析后的结果 / Parsed result.
 */
async function patchResult(client, path, options) {
    return await requestClient(client, "PATCH", path, options);
}
/**
 * 发送 DELETE 并返回解析后的结果。
 * Send DELETE and return parsed result.
 *
 * @template Result 返回类型 / Result type.
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions} [options] 请求选项 / Request options.
 * @returns {Promise<Result>} 解析后的结果 / Parsed result.
 */
async function deleteResult(client, path, options) {
    return await requestClient(client, "DELETE", path, options);
}
/**
 * 发送二进制 GET 并返回原始响应对象。
 * Send binary GET and return raw response object.
 *
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions} [options] 请求选项 / Request options.
 * @returns {Promise<FetchResponse>} 原始响应 / Raw response.
 */
async function getBinaryResponse(client, path, options) {
    return await requestClient(client, "GET", path, {
        ...options,
        responseType: "binary",
    });
}
/**
 * 构建请求并调用 `Cloudflare.fetch` 统一处理返回。
 * Build request and delegate to `Cloudflare.fetch` for unified handling.
 *
 * @template Result 返回类型 / Result type.
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} method HTTP 方法 / HTTP method.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions & { body?: unknown; responseType?: "json" | "binary"; }} [options={}] 请求选项 / Request options.
 * @returns {Promise<Result>} 解析后的结果 / Parsed result.
 */
async function requestClient(client, method, path, options = {}) {
    const request = createFetchRequest(client, method, path, options);
    return await Cloudflare.fetch(request, {
        maxRetries: options.maxRetries ?? client.maxRetries,
        responseType: options.responseType,
    });
}
/**
 * 把客户端配置和本次参数合并为 util.fetch 请求对象。
 * Merge client config and request params into a util.fetch request object.
 *
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} method HTTP 方法 / HTTP method.
 * @param {string} path API 路径 / API path.
 * @param {RequestOptions & { body?: unknown }} options 请求选项 / Request options.
 * @returns {FetchRequest} util.fetch 请求对象 / util.fetch request object.
 */
function createFetchRequest(client, method, path, options) {
    const url = createURL(client, path, options.query);
    const headers = {
        ...client.defaultHeaders,
        ...createAuthHeaders(client),
        ...options.headers,
    };
    let body = options.body;
    switch (true) {
        // 空 body 不传给 fetch。
        // Do not send a body when it is nullish.
        case body === undefined || body === null:
            body = undefined;
            break;
        // FormData 由运行时自动追加 multipart boundary，因此清理手写 Content-Type。
        // FormData needs runtime-managed multipart boundary, so remove manual Content-Type.
        case typeof FormData !== "undefined" && body instanceof FormData:
            // Let runtime set multipart boundary automatically.
            for (const key of Object.keys(headers)) {
                if (key.toLowerCase() === "content-type")
                    delete headers[key];
            }
            break;
        // 普通对象按 JSON 发送，并在缺失时补充 application/json。
        // Send plain objects as JSON and add application/json when absent.
        case !(body instanceof ArrayBuffer) &&
            !ArrayBuffer.isView(body) &&
            typeof body !== "string" &&
            Object.prototype.toString.call(body) === "[object Object]": {
            const hasContentType = Object.keys(headers).some(key => key.toLowerCase() === "content-type");
            if (!hasContentType)
                headers["Content-Type"] = "application/json";
            body = JSON.stringify(body);
            break;
        }
        // 其余类型（字符串/二进制）原样透传。
        // Pass through other body types (string/binary) unchanged.
        default:
            break;
    }
    return {
        url: url.toString(),
        method,
        headers,
        body: body,
        timeout: options.timeout ?? client.timeout,
    };
}
/**
 * 生成最终请求 URL 并写入 query 参数。
 * Build final request URL and write query params.
 *
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @param {string} path API 路径 / API path.
 * @param {QueryLike} [query={}] 查询参数 / Query params.
 * @returns {URL} 最终 URL / Final URL.
 */
function createURL(client, path, query = {}) {
    const url = new URL(`${client.baseURL}${path}`);
    for (const [key, value] of Object.entries({ ...client.defaultQuery, ...query })) {
        if (value === undefined) {
            url.searchParams.delete(key);
            continue;
        }
        if (value === null)
            continue;
        switch (true) {
            // 数组参数展开为多个同名 query 键。
            // Expand array values into repeated query keys.
            case Array.isArray(value):
                url.searchParams.delete(key);
                for (const item of value) {
                    if (item === undefined || item === null)
                        continue;
                    url.searchParams.append(key, typeof item === "object" ? JSON.stringify(item) : String(item));
                }
                break;
            // 单值参数写入一个 query 键；对象值序列化为 JSON 字符串。
            // Write scalar values as one query key; serialize object values as JSON.
            default:
                url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
                break;
        }
    }
    return url;
}
/**
 * 根据客户端鉴权配置生成请求头。
 * Build auth headers from client credentials.
 *
 * @param {Cloudflare} client 客户端实例 / Client instance.
 * @returns {HeadersLike} 鉴权请求头 / Auth headers.
 */
function createAuthHeaders(client) {
    switch (true) {
        // 首选 API Token 鉴权。
        // API Token has highest priority.
        case Boolean(client.apiToken):
            return {
                Authorization: `Bearer ${client.apiToken}`,
            };
        // 次选 Global API Key + Email。
        // Fallback to Global API Key + Email.
        case Boolean(client.apiKey && client.apiEmail):
            return {
                "X-Auth-Key": client.apiKey,
                "X-Auth-Email": client.apiEmail,
            };
        // 再次选 User Service Key。
        // Then fallback to User Service Key.
        case Boolean(client.userServiceKey):
            return {
                "X-Auth-User-Service-Key": client.userServiceKey,
            };
        // 都未配置时不注入鉴权头。
        // Inject no auth header when none is configured.
        default:
            return {};
    }
}
/**
 * 解析响应体为 JSON 或文本。
 * Parse response body as JSON or plain text.
 *
 * @param {FetchResponse} response 统一响应对象 / Unified response object.
 * @returns {unknown} 解析结果 / Parsed payload.
 */
function parseResponseBody(response) {
    const rawBody = response.body ?? "";
    switch (true) {
        // 非空响应体优先按 JSON 解析，失败则保留原始文本。
        // Parse non-empty response text as JSON first; keep raw text on failure.
        case Boolean(rawBody):
            try {
                return JSON.parse(rawBody);
            }
            catch (error) {
                return rawBody;
            }
        // 空响应体统一视为 null。
        // Treat empty response body as null.
        default:
            return null;
    }
}
/**
 * 判断并转换为 Cloudflare V4 包裹结构。
 * Detect and cast payload to Cloudflare V4 envelope.
 *
 * @param {unknown} payload 响应载荷 / Response payload.
 * @returns {CloudflareEnvelope | null} 包裹结构或空 / Envelope or null.
 */
function toCloudflareEnvelope(payload) {
    return typeof payload === "object" && payload !== null && ("success" in payload || "result" in payload || "errors" in payload)
        ? payload
        : null;
}
/**
 * 按 Cloudflare V4 `messages/errors` 发出通知。
 * Emit notifications from Cloudflare V4 `messages/errors`.
 *
 * @param {CloudflareEnvelope} envelope Cloudflare 包裹响应 / Cloudflare envelope response.
 * @returns {void} 无返回值 / No return value.
 */
function notifyEnvelope(envelope) {
    for (const message of envelope.messages ?? []) {
        if (!message?.message)
            continue;
        if (message.code === 10000)
            continue;
        notification("Cloudflare API", `code: ${message.code ?? ""}`, `message: ${message.message}`);
    }
    if (envelope.success !== false)
        return;
    for (const error of envelope.errors ?? []) {
        if (!error?.message)
            continue;
        notification("Cloudflare API", `code: ${error.code ?? ""}`, `message: ${error.message}`);
    }
}
/**
 * 将失败响应转换为统一异常对象。
 * Convert failed response into unified error object.
 *
 * @param {FetchResponse} response 统一响应对象 / Unified response object.
 * @param {unknown} [body] 已解析载荷 / Parsed payload.
 * @returns {Promise<CloudflareAPIError>} API 错误对象 / API error object.
 */
async function createError(response, body) {
    const payload = body === undefined ? parseResponseBody(response) : body;
    const envelope = toCloudflareEnvelope(payload);
    const message = envelope?.errors?.find(item => Boolean(item?.message))?.message ??
        envelope?.messages?.find(item => Boolean(item?.message))?.message ??
        response.statusText ??
        `HTTP ${response.status}`;
    return new CloudflareAPIError(String(message), {
        status: response.status,
        errors: envelope?.errors,
        body: payload,
    });
}
/**
 * 读取环境变量（Node.js 运行时）。
 * Read environment variable (Node.js runtime).
 *
 * @param {string} name 环境变量名 / Environment variable name.
 * @returns {string | null} 环境变量值 / Environment variable value.
 */
function readEnv(name) {
    const runtime = globalThis;
    return runtime.process?.env?.[name] ?? null;
}
