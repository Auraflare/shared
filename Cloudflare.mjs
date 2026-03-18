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
        this.headers = new Headers(init.headers);
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
class V4PagePaginationArray extends AbstractPage {
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
class CursorPaginationAfter extends AbstractPage {
    getNextQuery() {
        const cursor = this.result_info.cursor ?? this.result_info.cursors?.after;
        return cursor ? { ...this._query, cursor } : null;
    }
}
/**
 * 单页结果。
 * Single page result.
 *
 * @template TItem 条目类型 / Item type.
 */
class SinglePage extends AbstractPage {
}
/**
 * 分页 Promise。
 * Pagination promise.
 *
 * @template TPage 分页类型 / Page type.
 * @template TItem 条目类型 / Item type.
 */
class PagePromise {
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
class ZonesV4PagePaginationArray extends V4PagePaginationArray {
}
/**
 * DNS 记录分页结果。
 * DNS record pagination result.
 */
class RecordResponsesV4PagePaginationArray extends V4PagePaginationArray {
}
/**
 * DNS 记录单页结果。
 * DNS record single page result.
 */
class RecordResponsesSinglePage extends SinglePage {
}
/**
 * Namespace 分页结果。
 * Namespace pagination result.
 */
class NamespacesV4PagePaginationArray extends V4PagePaginationArray {
}
/**
 * KV 键 Cursor 分页结果。
 * KV key cursor pagination result.
 */
class KeysCursorPaginationAfter extends CursorPaginationAfter {
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
     * @returns {PagePromise<ZonesV4PagePaginationArray, Zone>}
     */
    list(queryOrOptions, options) {
        // Keep the existing "query or options" call style without relying on extra helpers.
        const isOptions = typeof queryOrOptions === "object" &&
            queryOrOptions !== null &&
            ["headers", "query", "timeout", "maxRetries", "fetch"].some(key => key in queryOrOptions);
        const query = isOptions ? {} : { ...(queryOrOptions ?? {}) };
        const requestOptions = isOptions ? queryOrOptions : options;
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
     * @returns {PagePromise<RecordResponsesV4PagePaginationArray, RecordResponse>}
     */
    list(params, options) {
        const { zone_id, ...query } = params;
        return getAPIList(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records`, RecordResponsesV4PagePaginationArray, query, options);
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
     * 批量执行 DNS 记录操作。
     * Execute DNS record operations in batch.
     *
     * @param {RecordBatchParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordBatchResponse>}
     */
    batch(params, options) {
        const { zone_id, ...body } = params;
        return postResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/batch`, {
            ...options,
            body,
        });
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
     * 导出 DNS 区域文件。
     * Export DNS zone file.
     *
     * @param {RecordExportParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordExportResponse>}
     */
    export(params, options) {
        return getResult(this._client, `/zones/${encodeURIComponent(params.zone_id)}/dns_records/export`, {
            ...options,
            headers: {
                ...options?.headers,
                Accept: "text/plain",
            },
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
     * 导入 DNS 区域文件。
     * Import DNS zone file.
     *
     * @param {RecordImportParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordImportResponse>}
     */
    import(params, options) {
        const { zone_id, file, proxied } = params;
        const formData = new FormData();
        formData.append("file", file);
        if (proxied !== undefined)
            formData.append("proxied", proxied);
        return postResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/import`, {
            ...options,
            body: formData,
        });
    }
    /**
     * 同步扫描并写入 DNS 记录。
     * Scan and import DNS records synchronously.
     *
     * @param {RecordScanParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordScanResponse>}
     */
    scan(params, options) {
        const { zone_id, body } = params;
        return postResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/scan`, {
            ...options,
            body,
        });
    }
    /**
     * 获取异步扫描结果列表。
     * List asynchronous scan results.
     *
     * @param {RecordScanListParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<RecordResponsesSinglePage, RecordResponse>}
     */
    scanList(params, options) {
        return getAPIList(this._client, `/zones/${encodeURIComponent(params.zone_id)}/dns_records/scan/review`, RecordResponsesSinglePage, {}, options);
    }
    /**
     * 接受或拒绝扫描出的 DNS 记录。
     * Accept or reject scanned DNS records.
     *
     * @param {RecordScanReviewParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordScanReviewResponse>}
     */
    scanReview(params, options) {
        const { zone_id, ...body } = params;
        return postResult(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/scan/review`, {
            ...options,
            body,
        });
    }
    /**
     * 触发异步 DNS 记录扫描。
     * Trigger asynchronous DNS record scan.
     *
     * @param {RecordScanTriggerParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordScanTriggerResponse>}
     */
    scanTrigger(params, options) {
        return postResult(this._client, `/zones/${encodeURIComponent(params.zone_id)}/dns_records/scan/trigger`, options);
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
     * @returns {PagePromise<NamespacesV4PagePaginationArray, Namespace>}
     */
    list(params, options) {
        const { account_id, ...query } = params;
        return getAPIList(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces`, NamespacesV4PagePaginationArray, query, options);
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
     * @returns {PagePromise<KeysCursorPaginationAfter, Key>}
     */
    list(namespaceId, params, options) {
        const { account_id, ...query } = params;
        return getAPIList(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/keys`, KeysCursorPaginationAfter, query, options);
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
     * @returns {Promise<CloudflareResponse>}
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
        const baseURL = options.baseURL ?? readEnv("CLOUDFLARE_BASE_URL") ?? DEFAULT_BASE_URL;
        this.baseURL = baseURL.replace(/\/+$/, "");
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
async function patchResult(client, path, options) {
    return await requestClient(client, "PATCH", path, options);
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
            let body = null;
            if (rawBody) {
                try {
                    body = JSON.parse(rawBody);
                }
                catch (error) {
                    body = rawBody;
                }
            }
            // V4 APIs usually return envelopes: { success, result, errors, ... }.
            if (typeof body === "object" && body !== null && ("success" in body || "result" in body || "errors" in body)) {
                const envelope = body;
                if (envelope.success === false)
                    throw await createError(response, envelope);
                return (options.unwrapResult === false ? envelope : (envelope.result ?? null));
            }
            return body;
        }
    }
}
async function fetchResponse(client, method, path, options) {
    const url = createURL(client, path, options.query);
    const headers = {
        ...client.defaultHeaders,
        ...createAuthHeaders(client),
        ...options.headers,
    };
    let body = options.body;
    if (body === undefined || body === null) {
        body = undefined;
    }
    else if (typeof FormData !== "undefined" && body instanceof FormData) {
        // Let runtime set multipart boundary automatically.
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === "content-type")
                delete headers[key];
        }
    }
    else if (!(body instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(body) &&
        typeof body !== "string" &&
        Object.prototype.toString.call(body) === "[object Object]") {
        const hasContentType = Object.keys(headers).some(key => key.toLowerCase() === "content-type");
        if (!hasContentType)
            headers["Content-Type"] = "application/json";
        body = JSON.stringify(body);
    }
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
            if (attempt < maxRetries && (RETRYABLE_STATUS_CODES.has(response.status) || response.status >= 500)) {
                // Reuse current backoff policy inline to avoid helper indirection.
                await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
                attempt += 1;
                continue;
            }
            return response;
        }
        catch (error) {
            if (attempt >= maxRetries)
                throw error;
            await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
            attempt += 1;
        }
    }
}
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
            case Array.isArray(value):
                url.searchParams.delete(key);
                for (const item of value) {
                    if (item === undefined || item === null)
                        continue;
                    url.searchParams.append(key, typeof item === "object" ? JSON.stringify(item) : String(item));
                }
                break;
            default:
                url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
                break;
        }
    }
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
    let payload = body;
    if (payload === undefined) {
        const rawBody = await response.text();
        if (rawBody) {
            try {
                payload = JSON.parse(rawBody);
            }
            catch (error) {
                payload = rawBody;
            }
        }
        else {
            payload = null;
        }
    }
    const envelope = typeof payload === "object" && payload !== null && ("success" in payload || "result" in payload || "errors" in payload)
        ? payload
        : null;
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
