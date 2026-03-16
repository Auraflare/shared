import { fetch as utilFetch } from "@nsnanocat/util";
const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);
/**
 * Web Response 兼容响应。
 * Web Response compatible response.
 */
export class CloudflareResponse {
    ok;
    status;
    statusText;
    headers;
    url;
    #body;
    /**
     * 创建响应对象。
     * Create a response object.
     *
     * @param {string | ArrayBuffer} body 响应体 / Response body.
     * @param {{ status?: number; statusText?: string; headers?: HeadersInit; url?: string }} [init={}] 初始化信息 / Response init.
     */
    constructor(body, init = {}) {
        this.#body = typeof body === "string" ? body : body.slice(0);
        this.status = init.status ?? 200;
        this.statusText = init.statusText ?? "";
        this.headers = new Headers(normalizeHeadersInit(init.headers));
        this.url = init.url ?? "";
        this.ok = this.status >= 200 && this.status < 300;
    }
    /**
     * 读取文本响应体。
     * Read the response body as text.
     *
     * @returns {Promise<string>}
     */
    async text() {
        return typeof this.#body === "string" ? this.#body : new TextDecoder().decode(this.#body);
    }
    /**
     * 读取 JSON 响应体。
     * Read the response body as JSON.
     *
     * @returns {Promise<unknown>}
     */
    async json() {
        return JSON.parse(await this.text());
    }
    /**
     * 读取 ArrayBuffer 响应体。
     * Read the response body as ArrayBuffer.
     *
     * @returns {Promise<ArrayBuffer>}
     */
    async arrayBuffer() {
        return typeof this.#body === "string"
            ? new TextEncoder().encode(this.#body).buffer
            : this.#body.slice(0);
    }
    /**
     * 读取 Blob 响应体。
     * Read the response body as Blob.
     *
     * @returns {Promise<Blob>}
     */
    async blob() {
        return new Blob([await this.arrayBuffer()]);
    }
    /**
     * 克隆响应。
     * Clone the response.
     *
     * @returns {CloudflareResponse}
     */
    clone() {
        return new CloudflareResponse(this.#body, {
            status: this.status,
            statusText: this.statusText,
            headers: this.headers,
            url: this.url,
        });
    }
}
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
class AbstractPage {
    result;
    result_info;
    _client;
    _path;
    _query;
    _options;
    constructor(init) {
        this._client = init.client;
        this._path = init.path;
        this._query = { ...init.query };
        this._options = init.options;
        this.result = init.result;
        this.result_info = init.result_info;
    }
    hasNextPage() {
        return Boolean(this.getNextQuery());
    }
    async *[Symbol.asyncIterator]() {
        let page = this;
        while (true) {
            for (const item of page.result)
                yield item;
            if (!page.hasNextPage())
                break;
            page = await page.getNextPage();
        }
    }
    async getNextPage() {
        const nextQuery = this.getNextQuery();
        if (!nextQuery)
            return this;
        return (await getAPIPage(this._client, this.constructor, this._path, nextQuery, this._options));
    }
    getNextQuery() {
        return null;
    }
}
/**
 * V4 分页数组结果。
 * V4 page array result.
 *
 * @template TItem 条目类型 / Item type.
 */
export class V4PagePaginationArray extends AbstractPage {
    getNextQuery() {
        const page = Number(this.result_info.page ?? this._query.page ?? 1);
        const totalPages = Number(this.result_info.total_pages ?? 0);
        if (!totalPages || page >= totalPages)
            return null;
        return { ...this._query, page: page + 1 };
    }
}
/**
 * Cursor 分页结果。
 * Cursor pagination result.
 *
 * @template TItem 条目类型 / Item type.
 */
export class CursorPaginationAfter extends AbstractPage {
    getNextQuery() {
        const cursor = this.result_info.cursor ?? this.result_info.cursors?.after;
        return cursor ? { ...this._query, cursor } : null;
    }
}
/**
 * 分页 Promise。
 * Pagination promise.
 *
 * @template TPage 分页类型 / Page type.
 * @template TItem 条目类型 / Item type.
 */
export class PagePromise {
    #factory;
    #promise;
    constructor(factory) {
        this.#factory = factory;
    }
    then(onfulfilled, onrejected) {
        return this.#getPromise().then(onfulfilled, onrejected);
    }
    async *[Symbol.asyncIterator]() {
        const page = await this.#getPromise();
        yield* page;
    }
    #getPromise() {
        this.#promise ??= this.#factory();
        return this.#promise;
    }
}
/**
 * Zone 分页结果。
 * Zone pagination result.
 */
export class ZonesV4PagePaginationArray extends V4PagePaginationArray {
}
/**
 * DNS 记录分页结果。
 * DNS record pagination result.
 */
export class RecordResponsesV4PagePaginationArray extends V4PagePaginationArray {
}
/**
 * Namespace 分页结果。
 * Namespace pagination result.
 */
export class NamespacesV4PagePaginationArray extends V4PagePaginationArray {
}
/**
 * KV 键 Cursor 分页结果。
 * KV key cursor pagination result.
 */
export class KeysCursorPaginationAfter extends CursorPaginationAfter {
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
export class UserResource extends APIResource {
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
export class UserTokensResource extends APIResource {
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
export class ZonesResource extends APIResource {
    /**
     * 列出 Zone。
     * List zones.
     *
     * @param {ZoneListParams | RequestOptions} [queryOrOptions] 查询参数或请求选项 / Query params or request options.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<ZonesV4PagePaginationArray, Zone>}
     */
    list(queryOrOptions, options) {
        const { query, requestOptions } = normalizeOptionalQuery(queryOrOptions, options);
        return getAPIList(this._client, "/zones", ZonesV4PagePaginationArray, query, requestOptions);
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
export class DNSResource extends APIResource {
    records = new DNSRecordsResource(this._client);
}
/**
 * DNS 记录资源。
 * DNS records resource.
 */
export class DNSRecordsResource extends APIResource {
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
    /**
     * 列出 DNS 记录。
     * List DNS records.
     *
     * @param {RecordListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<RecordResponsesV4PagePaginationArray, RecordResponse>}
     */
    list(params, options) {
        const { zone_id, ...query } = params;
        return getAPIList(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records`, RecordResponsesV4PagePaginationArray, query, options);
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
}
/**
 * KV 资源。
 * KV resource.
 */
export class KVResource extends APIResource {
    namespaces = new NamespacesResource(this._client);
}
/**
 * KV Namespace 资源。
 * KV namespace resource.
 */
export class NamespacesResource extends APIResource {
    keys = new KeysResource(this._client);
    values = new ValuesResource(this._client);
    /**
     * 列出 Namespace。
     * List namespaces.
     *
     * @param {NamespaceListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<NamespacesV4PagePaginationArray, Namespace>}
     */
    list(params, options) {
        const { account_id, ...query } = params;
        return getAPIList(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces`, NamespacesV4PagePaginationArray, query, options);
    }
}
/**
 * KV 键资源。
 * KV keys resource.
 */
export class KeysResource extends APIResource {
    /**
     * 列出 KV 键。
     * List KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<KeysCursorPaginationAfter, Key>}
     */
    list(namespaceId, params, options) {
        const { account_id, ...query } = params;
        return getAPIList(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/keys`, KeysCursorPaginationAfter, query, options);
    }
}
/**
 * KV 值资源。
 * KV values resource.
 */
export class ValuesResource extends APIResource {
    /**
     * 写入 KV 值。
     * Update a KV value.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {string} keyName 键名 / Key name.
     * @param {ValueUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<null>}
     */
    update(namespaceId, keyName, params, options) {
        const { account_id, expiration, expiration_ttl, value, metadata } = params;
        const body = createKVValueBody(value, metadata);
        return putResult(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`, {
            ...options,
            query: {
                expiration,
                expiration_ttl,
            },
            body,
            headers: mergeHeaders(options?.headers, resolveKVValueHeaders(body)),
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
     * @returns {Promise<CloudflareResponse>}
     */
    get(namespaceId, keyName, params, options) {
        return getBinaryResponse(this._client, `/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`, {
            ...options,
            headers: mergeHeaders(options?.headers, {
                Accept: "application/octet-stream",
            }),
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
     * @returns {Promise<null>}
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
 * const value = await response.text();
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
    fetch;
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
        this.baseURL = options.baseURL ?? readEnv("CLOUDFLARE_BASE_URL") ?? DEFAULT_BASE_URL;
        this.apiVersion = options.apiVersion ?? null;
        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
        this.httpAgent = options.httpAgent;
        this.fetch = options.fetch;
        this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.defaultHeaders = { ...(options.defaultHeaders ?? {}) };
        this.defaultQuery = { ...(options.defaultQuery ?? {}) };
    }
    /**
     * 追踪默认线路。
     * Trace the default route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>}
     */
    static async trace(options) {
        return await Cloudflare.#trace("https://cloudflare.com/cdn-cgi/trace", options);
    }
    /**
     * 追踪 IPv4 线路。
     * Trace the IPv4 route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>}
     */
    static async trace4(options) {
        return await Cloudflare.#trace("https://162.159.36.1/cdn-cgi/trace", options);
    }
    /**
     * 追踪 IPv6 线路。
     * Trace the IPv6 route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>}
     */
    static async trace6(options) {
        return await Cloudflare.#trace("https://[2606:4700:4700::1111]/cdn-cgi/trace", options);
    }
    static async #trace(url, options) {
        const rawResponse = await (options?.fetch ?? utilFetch)(url, {
            method: "GET",
            timeout: options?.timeout ?? DEFAULT_TIMEOUT,
            headers: options?.headers,
        });
        const response = await normalizeResponse(rawResponse, url);
        const body = await response.text();
        return Object.fromEntries(body
            .trim()
            .split("\n")
            .map(line => line.split("=", 2))
            .filter(parts => parts.length === 2));
    }
}
export default Cloudflare;
function getAPIList(client, path, pageClass, query = {}, options) {
    return new PagePromise(async () => await getAPIPage(client, pageClass, path, query, options));
}
async function getAPIPage(client, pageClass, path, query = {}, options) {
    const envelope = await requestClient(client, "GET", path, {
        ...options,
        query,
        unwrapResult: false,
    });
    return new pageClass({
        client,
        path,
        query,
        options,
        result: Array.isArray(envelope.result) ? envelope.result : [],
        result_info: envelope.result_info ?? {},
    });
}
async function getResult(client, path, options) {
    return await requestClient(client, "GET", path, options);
}
async function postResult(client, path, options) {
    return await requestClient(client, "POST", path, options);
}
async function putResult(client, path, options) {
    return await requestClient(client, "PUT", path, options);
}
async function deleteResult(client, path, options) {
    return await requestClient(client, "DELETE", path, options);
}
async function getBinaryResponse(client, path, options) {
    return await requestClient(client, "GET", path, {
        ...options,
        responseType: "binary",
    });
}
async function requestClient(client, method, path, options = {}) {
    const response = await fetchResponse(client, method, path, options);
    if (!response.ok)
        throw await createError(response);
    switch (options.responseType) {
        case "binary":
            return response;
        default: {
            const rawBody = await response.text();
            const body = rawBody ? safeParseJSON(rawBody) : null;
            if (isEnvelope(body)) {
                if (body.success === false)
                    throw await createError(response, body);
                return (options.unwrapResult === false ? body : (body.result ?? null));
            }
            return body;
        }
    }
}
async function fetchResponse(client, method, path, options) {
    const url = createURL(client, path, options.query);
    const headers = mergeHeaders(client.defaultHeaders, createAuthHeaders(client), options.headers);
    const body = normalizeBody(options.body, headers);
    const fetcher = options.fetch ?? client.fetch ?? utilFetch;
    const timeout = options.timeout ?? client.timeout;
    const maxRetries = options.maxRetries ?? client.maxRetries;
    let attempt = 0;
    while (true) {
        try {
            const rawResponse = await fetcher(url.toString(), {
                method,
                headers,
                body: body,
                timeout,
            });
            const response = await normalizeResponse(rawResponse, url.toString());
            if (attempt < maxRetries && shouldRetry(response.status)) {
                await delay(backoffDelay(attempt));
                attempt += 1;
                continue;
            }
            return response;
        }
        catch (error) {
            if (attempt >= maxRetries)
                throw error;
            await delay(backoffDelay(attempt));
            attempt += 1;
        }
    }
}
function createURL(client, path, query = {}) {
    const url = new URL(path, ensureBaseURL(client.baseURL));
    appendQuery(url.searchParams, mergeQuery(client.defaultQuery, query));
    return url;
}
function createAuthHeaders(client) {
    if (client.apiToken) {
        return {
            Authorization: `Bearer ${client.apiToken}`,
        };
    }
    if (client.apiKey && client.apiEmail) {
        return {
            "X-Auth-Key": client.apiKey,
            "X-Auth-Email": client.apiEmail,
        };
    }
    if (client.userServiceKey) {
        return {
            "X-Auth-User-Service-Key": client.userServiceKey,
        };
    }
    return {};
}
async function createError(response, body) {
    const payload = body ?? safeParseJSON(await response.text());
    const envelope = isEnvelope(payload) ? payload : null;
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
function readEnv(name) {
    const runtime = globalThis;
    return runtime.process?.env?.[name] ?? null;
}
function normalizeOptionalQuery(queryOrOptions, options) {
    switch (true) {
        case isRequestOptions(queryOrOptions):
            return {
                query: {},
                requestOptions: queryOrOptions,
            };
        default:
            return {
                query: { ...(queryOrOptions ?? {}) },
                requestOptions: options,
            };
    }
}
function isRequestOptions(value) {
    return typeof value === "object" && value !== null && ["headers", "query", "timeout", "maxRetries", "fetch"].some(key => key in value);
}
function isEnvelope(value) {
    return typeof value === "object" && value !== null && ("success" in value || "result" in value || "errors" in value);
}
function mergeHeaders(...headersList) {
    const headers = {};
    for (const item of headersList) {
        if (!item)
            continue;
        for (const [key, value] of Object.entries(item)) {
            if (value === undefined || value === null) {
                delete headers[key];
                continue;
            }
            headers[key] = value;
        }
    }
    return headers;
}
function mergeQuery(...queryList) {
    const query = {};
    for (const item of queryList) {
        if (!item)
            continue;
        for (const [key, value] of Object.entries(item)) {
            if (value === undefined) {
                delete query[key];
                continue;
            }
            query[key] = value;
        }
    }
    return query;
}
function appendQuery(searchParams, query, prefix) {
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null)
            continue;
        const queryKey = prefix ? `${prefix}.${key}` : key;
        switch (true) {
            case Array.isArray(value):
                for (const item of value)
                    appendQuery(searchParams, { [queryKey]: item });
                break;
            case isPlainObject(value):
                appendQuery(searchParams, value, queryKey);
                break;
            default:
                searchParams.append(queryKey, String(value));
                break;
        }
    }
}
function normalizeHeadersInit(headers) {
    if (!headers)
        return undefined;
    if (headers instanceof Headers)
        return headers;
    if (Array.isArray(headers))
        return headers;
    if (typeof headers.forEach === "function") {
        const iterableHeaders = headers;
        const normalized = [];
        iterableHeaders.forEach((value, key) => normalized.push([key, value]));
        return normalized;
    }
    return Object.entries(headers).flatMap(([key, value]) => {
        if (value === undefined || value === null)
            return [];
        return [[key, String(value)]];
    });
}
function ensureBaseURL(baseURL) {
    return baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
}
function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}
function normalizeBody(body, headers) {
    if (body === undefined || body === null)
        return undefined;
    if (typeof FormData !== "undefined" && body instanceof FormData) {
        deleteHeader(headers, "Content-Type");
        return body;
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof body === "string")
        return body;
    if (isPlainObject(body)) {
        if (!hasHeader(headers, "Content-Type"))
            headers["Content-Type"] = "application/json";
        return JSON.stringify(body);
    }
    return body;
}
function hasHeader(headers, keyName) {
    const headerName = keyName.toLowerCase();
    return Object.keys(headers).some(key => key.toLowerCase() === headerName);
}
function deleteHeader(headers, keyName) {
    const headerName = keyName.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === headerName)
            delete headers[key];
    }
}
function createKVValueBody(value, metadata) {
    switch (metadata === undefined) {
        case true:
            return value;
        default: {
            const formData = new FormData();
            formData.append("value", value);
            formData.append("metadata", JSON.stringify(metadata));
            return formData;
        }
    }
}
function resolveKVValueHeaders(body) {
    return body instanceof FormData
        ? {}
        : {
            "Content-Type": "text/plain;charset=UTF-8",
        };
}
async function normalizeResponse(rawResponse, url = "") {
    if (rawResponse instanceof CloudflareResponse)
        return rawResponse;
    if (typeof rawResponse.arrayBuffer === "function") {
        const response = rawResponse;
        return new CloudflareResponse(await response.clone().arrayBuffer(), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            url: response.url || url,
        });
    }
    const response = rawResponse;
    const body = response.bodyBytes ?? response.body ?? "";
    return new CloudflareResponse(typeof body === "string" ? body : body, {
        status: response.status ?? response.statusCode ?? 0,
        statusText: response.statusText ?? "",
        headers: response.headers,
        url,
    });
}
function safeParseJSON(value) {
    try {
        return JSON.parse(value);
    }
    catch (error) {
        return value;
    }
}
function shouldRetry(status) {
    return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}
function backoffDelay(attempt) {
    return 200 * 2 ** attempt;
}
function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
