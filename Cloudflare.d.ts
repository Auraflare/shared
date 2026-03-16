import { type FetchRequest, type FetchResponse } from "@nsnanocat/util";
/**
 * Cloudflare 请求头。
 * Cloudflare request headers.
 */
export interface HeadersLike {
    [key: string]: string | number | boolean | null | undefined;
}
/**
 * Cloudflare 查询参数值。
 * Cloudflare query parameter value.
 */
export type QueryValue = string | number | boolean | null | undefined | QueryValue[] | {
    [key: string]: QueryValue;
};
/**
 * Cloudflare 查询参数对象。
 * Cloudflare query parameter object.
 */
export interface QueryLike {
    [key: string]: QueryValue;
}
/**
 * Cloudflare 自定义 fetch。
 * Cloudflare custom fetch.
 */
export type FetchLike = (resource: string | FetchRequest, options?: Partial<FetchRequest>) => Promise<FetchResponse | Response | CloudflareResponse>;
/**
 * 请求选项。
 * Request options.
 */
export interface RequestOptions {
    headers?: HeadersLike;
    query?: QueryLike;
    timeout?: number;
    maxRetries?: number;
    fetch?: FetchLike;
}
/**
 * Cloudflare 客户端选项。
 * Cloudflare client options.
 */
export interface ClientOptions {
    apiToken?: string | null | undefined;
    apiKey?: string | null | undefined;
    apiEmail?: string | null | undefined;
    userServiceKey?: string | null | undefined;
    baseURL?: string | null | undefined;
    apiVersion?: string | null | undefined;
    timeout?: number | undefined;
    httpAgent?: unknown;
    fetch?: FetchLike | undefined;
    maxRetries?: number | undefined;
    defaultHeaders?: HeadersLike | undefined;
    defaultQuery?: QueryLike | undefined;
}
/**
 * Cloudflare V4 错误项。
 * Cloudflare V4 error entry.
 */
export interface CloudflareAPIErrorEntry {
    code?: number;
    message?: string;
    [key: string]: unknown;
}
/**
 * Cloudflare V4 分页信息。
 * Cloudflare V4 pagination info.
 */
export interface CloudflareResultInfo {
    page?: number;
    per_page?: number;
    total_pages?: number;
    cursor?: string;
    cursors?: {
        after?: string;
        before?: string;
    };
    [key: string]: unknown;
}
/**
 * V4 分页数组参数。
 * V4 page array params.
 */
export interface V4PagePaginationArrayParams {
    page?: number;
    per_page?: number;
    order?: string;
    direction?: string;
}
/**
 * Cursor 分页参数。
 * Cursor pagination params.
 */
export interface CursorPaginationAfterParams {
    cursor?: string;
    limit?: number;
}
/**
 * Web Response 兼容响应。
 * Web Response compatible response.
 */
export declare class CloudflareResponse {
    #private;
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly headers: Headers;
    readonly url: string;
    /**
     * 创建响应对象。
     * Create a response object.
     *
     * @param {string | ArrayBuffer} body 响应体 / Response body.
     * @param {{ status?: number; statusText?: string; headers?: HeadersInit; url?: string }} [init={}] 初始化信息 / Response init.
     */
    constructor(body: string | ArrayBuffer, init?: {
        status?: number;
        statusText?: string;
        headers?: HeadersInit | HeadersLike;
        url?: string;
    });
    /**
     * 读取文本响应体。
     * Read the response body as text.
     *
     * @returns {Promise<string>}
     */
    text(): Promise<string>;
    /**
     * 读取 JSON 响应体。
     * Read the response body as JSON.
     *
     * @returns {Promise<unknown>}
     */
    json(): Promise<unknown>;
    /**
     * 读取 ArrayBuffer 响应体。
     * Read the response body as ArrayBuffer.
     *
     * @returns {Promise<ArrayBuffer>}
     */
    arrayBuffer(): Promise<ArrayBuffer>;
    /**
     * 读取 Blob 响应体。
     * Read the response body as Blob.
     *
     * @returns {Promise<Blob>}
     */
    blob(): Promise<Blob>;
    /**
     * 克隆响应。
     * Clone the response.
     *
     * @returns {CloudflareResponse}
     */
    clone(): CloudflareResponse;
}
/**
 * Cloudflare API 错误。
 * Cloudflare API error.
 */
export declare class CloudflareAPIError extends Error {
    readonly status?: number;
    readonly errors?: CloudflareAPIErrorEntry[];
    readonly body?: unknown;
    /**
     * 创建 API 错误。
     * Create an API error.
     *
     * @param {string} message 错误消息 / Error message.
     * @param {{ status?: number; errors?: CloudflareAPIErrorEntry[]; body?: unknown }} [init={}] 错误上下文 / Error context.
     */
    constructor(message: string, init?: {
        status?: number;
        errors?: CloudflareAPIErrorEntry[];
        body?: unknown;
    });
}
declare class AbstractPage<TItem> implements AsyncIterable<TItem> {
    readonly result: TItem[];
    readonly result_info: CloudflareResultInfo;
    protected readonly _client: Cloudflare;
    protected readonly _path: string;
    protected readonly _query: QueryLike;
    protected readonly _options?: RequestOptions;
    constructor(init: {
        client: Cloudflare;
        path: string;
        query: QueryLike;
        options?: RequestOptions;
        result: TItem[];
        result_info: CloudflareResultInfo;
    });
    hasNextPage(): boolean;
    [Symbol.asyncIterator](): AsyncGenerator<TItem>;
    getNextPage(): Promise<this>;
    protected getNextQuery(): QueryLike | null;
}
/**
 * V4 分页数组结果。
 * V4 page array result.
 *
 * @template TItem 条目类型 / Item type.
 */
export declare class V4PagePaginationArray<TItem> extends AbstractPage<TItem> {
    protected getNextQuery(): QueryLike | null;
}
/**
 * Cursor 分页结果。
 * Cursor pagination result.
 *
 * @template TItem 条目类型 / Item type.
 */
export declare class CursorPaginationAfter<TItem> extends AbstractPage<TItem> {
    protected getNextQuery(): QueryLike | null;
}
/**
 * 分页 Promise。
 * Pagination promise.
 *
 * @template TPage 分页类型 / Page type.
 * @template TItem 条目类型 / Item type.
 */
export declare class PagePromise<TPage extends AbstractPage<TItem>, TItem = unknown> implements PromiseLike<TPage>, AsyncIterable<TItem> {
    #private;
    constructor(factory: () => Promise<TPage>);
    then<TResult1 = TPage, TResult2 = never>(onfulfilled?: ((value: TPage) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2>;
    [Symbol.asyncIterator](): AsyncGenerator<TItem>;
}
/**
 * 用户信息。
 * User information.
 */
export interface UserGetResponse {
    id?: string;
    betas?: string[];
    country?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    telephone?: string | null;
    zipcode?: string | null;
    organizations?: Record<string, unknown>[];
    [key: string]: unknown;
}
/**
 * Token 校验结果。
 * Token verify result.
 */
export interface TokenVerifyResponse {
    id: string;
    status: "active" | "disabled" | "expired";
    [key: string]: unknown;
}
/**
 * Zone。
 * Zone.
 */
export interface Zone {
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    paused?: boolean;
    name_servers?: string[];
    [key: string]: unknown;
}
/**
 * Zone 列表参数。
 * Zone list params.
 */
export interface ZoneListParams extends V4PagePaginationArrayParams {
    name?: string;
    status?: string;
    match?: string;
}
/**
 * Zone 获取参数。
 * Zone get params.
 */
export interface ZoneGetParams {
    zone_id: string;
}
/**
 * DNS 记录类型。
 * DNS record type.
 */
export type DNSRecordType = "A" | "AAAA" | "CAA" | "CERT" | "CNAME" | "DNSKEY" | "DS" | "HTTPS" | "LOC" | "MX" | "NAPTR" | "NS" | "OPENPGPKEY" | "PTR" | "SMIMEA" | "SRV" | "SSHFP" | "SVCB" | "TLSA" | "TXT" | "URI";
/**
 * DNS 记录响应。
 * DNS record response.
 */
export interface RecordResponse {
    id?: string;
    zone_id?: string;
    zone_name?: string;
    type?: DNSRecordType;
    name?: string;
    content?: string;
    proxied?: boolean;
    ttl?: number;
    priority?: number;
    comment?: string | null;
    tags?: string[];
    [key: string]: unknown;
}
/**
 * DNS 记录创建参数。
 * DNS record create params.
 */
export interface RecordCreateParams {
    zone_id: string;
    type: DNSRecordType;
    name: string;
    content?: string;
    ttl?: number;
    priority?: number;
    proxied?: boolean;
    comment?: string | null;
    tags?: string[];
}
/**
 * DNS 记录更新参数。
 * DNS record update params.
 */
export interface RecordUpdateParams extends RecordCreateParams {
}
/**
 * DNS 记录列表参数。
 * DNS record list params.
 */
export interface RecordListParams extends V4PagePaginationArrayParams {
    zone_id: string;
    type?: DNSRecordType;
    name?: string;
    order?: "type" | "name" | "content" | "ttl" | "proxied";
    match?: string;
}
/**
 * DNS 记录获取参数。
 * DNS record get params.
 */
export interface RecordGetParams {
    zone_id: string;
}
/**
 * KV Namespace。
 * KV namespace.
 */
export interface Namespace {
    id?: string;
    title?: string;
    supports_url_encoding?: boolean;
    [key: string]: unknown;
}
/**
 * KV Namespace 列表参数。
 * KV namespace list params.
 */
export interface NamespaceListParams extends V4PagePaginationArrayParams {
    account_id: string;
}
/**
 * KV 键。
 * KV key.
 */
export interface Key {
    name: string;
    expiration?: number;
    metadata?: unknown;
}
/**
 * KV 键列表参数。
 * KV key list params.
 */
export interface KeyListParams extends CursorPaginationAfterParams {
    account_id: string;
    prefix?: string;
}
/**
 * KV 值写入参数。
 * KV value update params.
 */
export interface ValueUpdateParams {
    account_id: string;
    value: string;
    expiration?: number;
    expiration_ttl?: number;
    metadata?: unknown;
}
/**
 * KV 值读取参数。
 * KV value get params.
 */
export interface ValueGetParams {
    account_id: string;
}
/**
 * KV 值删除参数。
 * KV value delete params.
 */
export interface ValueDeleteParams {
    account_id: string;
}
/**
 * Zone 分页结果。
 * Zone pagination result.
 */
export declare class ZonesV4PagePaginationArray extends V4PagePaginationArray<Zone> {
}
/**
 * DNS 记录分页结果。
 * DNS record pagination result.
 */
export declare class RecordResponsesV4PagePaginationArray extends V4PagePaginationArray<RecordResponse> {
}
/**
 * Namespace 分页结果。
 * Namespace pagination result.
 */
export declare class NamespacesV4PagePaginationArray extends V4PagePaginationArray<Namespace> {
}
/**
 * KV 键 Cursor 分页结果。
 * KV key cursor pagination result.
 */
export declare class KeysCursorPaginationAfter extends CursorPaginationAfter<Key> {
}
declare class APIResource {
    protected readonly _client: Cloudflare;
    constructor(client: Cloudflare);
}
/**
 * 用户资源。
 * User resource.
 */
export declare class UserResource extends APIResource {
    readonly tokens: UserTokensResource;
    /**
     * 获取当前用户。
     * Get the current user.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<UserGetResponse>}
     */
    get(options?: RequestOptions): Promise<UserGetResponse>;
}
/**
 * 用户 Token 资源。
 * User token resource.
 */
export declare class UserTokensResource extends APIResource {
    /**
     * 校验当前 Token。
     * Verify the current token.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<TokenVerifyResponse>}
     */
    verify(options?: RequestOptions): Promise<TokenVerifyResponse>;
}
/**
 * Zone 资源。
 * Zone resource.
 */
export declare class ZonesResource extends APIResource {
    /**
     * 列出 Zone。
     * List zones.
     *
     * @param {ZoneListParams | RequestOptions} [queryOrOptions] 查询参数或请求选项 / Query params or request options.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<ZonesV4PagePaginationArray, Zone>}
     */
    list(queryOrOptions?: ZoneListParams | RequestOptions, options?: RequestOptions): PagePromise<ZonesV4PagePaginationArray, Zone>;
    /**
     * 获取 Zone。
     * Get a zone.
     *
     * @param {ZoneGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Zone>}
     */
    get(params: ZoneGetParams, options?: RequestOptions): Promise<Zone>;
}
/**
 * DNS 资源。
 * DNS resource.
 */
export declare class DNSResource extends APIResource {
    readonly records: DNSRecordsResource;
}
/**
 * DNS 记录资源。
 * DNS records resource.
 */
export declare class DNSRecordsResource extends APIResource {
    /**
     * 创建 DNS 记录。
     * Create a DNS record.
     *
     * @param {RecordCreateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    create(params: RecordCreateParams, options?: RequestOptions): Promise<RecordResponse>;
    /**
     * 获取 DNS 记录。
     * Get a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    get(dnsRecordId: string, params: RecordGetParams, options?: RequestOptions): Promise<RecordResponse>;
    /**
     * 列出 DNS 记录。
     * List DNS records.
     *
     * @param {RecordListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<RecordResponsesV4PagePaginationArray, RecordResponse>}
     */
    list(params: RecordListParams, options?: RequestOptions): PagePromise<RecordResponsesV4PagePaginationArray, RecordResponse>;
    /**
     * 覆盖更新 DNS 记录。
     * Overwrite a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    update(dnsRecordId: string, params: RecordUpdateParams, options?: RequestOptions): Promise<RecordResponse>;
}
/**
 * KV 资源。
 * KV resource.
 */
export declare class KVResource extends APIResource {
    readonly namespaces: NamespacesResource;
}
/**
 * KV Namespace 资源。
 * KV namespace resource.
 */
export declare class NamespacesResource extends APIResource {
    readonly keys: KeysResource;
    readonly values: ValuesResource;
    /**
     * 列出 Namespace。
     * List namespaces.
     *
     * @param {NamespaceListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<NamespacesV4PagePaginationArray, Namespace>}
     */
    list(params: NamespaceListParams, options?: RequestOptions): PagePromise<NamespacesV4PagePaginationArray, Namespace>;
}
/**
 * KV 键资源。
 * KV keys resource.
 */
export declare class KeysResource extends APIResource {
    /**
     * 列出 KV 键。
     * List KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<KeysCursorPaginationAfter, Key>}
     */
    list(namespaceId: string, params: KeyListParams, options?: RequestOptions): PagePromise<KeysCursorPaginationAfter, Key>;
}
/**
 * KV 值资源。
 * KV values resource.
 */
export declare class ValuesResource extends APIResource {
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
    update(namespaceId: string, keyName: string, params: ValueUpdateParams, options?: RequestOptions): Promise<null>;
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
    get(namespaceId: string, keyName: string, params: ValueGetParams, options?: RequestOptions): Promise<CloudflareResponse>;
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
    delete(namespaceId: string, keyName: string, params: ValueDeleteParams, options?: RequestOptions): Promise<null>;
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
export declare class Cloudflare {
    #private;
    readonly apiToken: string | null;
    readonly apiKey: string | null;
    readonly apiEmail: string | null;
    readonly userServiceKey: string | null;
    readonly baseURL: string;
    readonly apiVersion: string | null;
    readonly timeout: number;
    readonly httpAgent?: unknown;
    readonly fetch?: FetchLike;
    readonly maxRetries: number;
    readonly defaultHeaders: HeadersLike;
    readonly defaultQuery: QueryLike;
    readonly user: UserResource;
    readonly zones: ZonesResource;
    readonly dns: DNSResource;
    readonly kv: KVResource;
    /**
     * 创建 Cloudflare 客户端。
     * Create a Cloudflare client.
     *
     * @param {ClientOptions} [options={}] 客户端选项 / Client options.
     */
    constructor(options?: ClientOptions);
    /**
     * 追踪默认线路。
     * Trace the default route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>}
     */
    static trace(options?: RequestOptions): Promise<Record<string, string>>;
    /**
     * 追踪 IPv4 线路。
     * Trace the IPv4 route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>}
     */
    static trace4(options?: RequestOptions): Promise<Record<string, string>>;
    /**
     * 追踪 IPv6 线路。
     * Trace the IPv6 route.
     *
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Record<string, string>>}
     */
    static trace6(options?: RequestOptions): Promise<Record<string, string>>;
}
export default Cloudflare;
