import type { FetchResponse } from "@nsnanocat/util";

/**
 * Cloudflare 请求头。
 * Cloudflare request headers.
 */
interface HeadersLike {
    [key: string]: string | number | boolean | null | undefined;
}
/**
 * Cloudflare 查询参数值。
 * Cloudflare query parameter value.
 */
type QueryValue = string | number | boolean | null | undefined | QueryValue[] | {
    [key: string]: QueryValue;
};
/**
 * Cloudflare 查询参数对象。
 * Cloudflare query parameter object.
 */
interface QueryLike {
    [key: string]: QueryValue;
}
/**
 * 请求选项。
 * Request options.
 */
export interface RequestOptions {
    headers?: HeadersLike;
    query?: QueryLike;
    timeout?: number;
    maxRetries?: number;
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
    maxRetries?: number | undefined;
    defaultHeaders?: HeadersLike | undefined;
    defaultQuery?: QueryLike | undefined;
}
/**
 * Cloudflare V4 错误项。
 * Cloudflare V4 error entry.
 */
interface CloudflareAPIErrorEntry {
    code?: number;
    message?: string;
    [key: string]: unknown;
}
/**
 * Cloudflare V4 分页信息。
 * Cloudflare V4 pagination info.
 */
interface CloudflareResultInfo {
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
interface V4PagePaginationArrayParams {
    page?: number;
    per_page?: number;
    order?: string;
    direction?: string;
}
/**
 * Cursor 分页参数。
 * Cursor pagination params.
 */
interface CursorPaginationAfterParams {
    cursor?: string;
    limit?: number;
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
declare class V4PagePaginationArray<TItem> extends AbstractPage<TItem> {
    protected getNextQuery(): QueryLike | null;
}
/**
 * Cursor 分页结果。
 * Cursor pagination result.
 *
 * @template TItem 条目类型 / Item type.
 */
declare class CursorPaginationAfter<TItem> extends AbstractPage<TItem> {
    protected getNextQuery(): QueryLike | null;
}
/**
 * 单页结果。
 * Single page result.
 *
 * @template TItem 条目类型 / Item type.
 */
declare class SinglePage<TItem> extends AbstractPage<TItem> {
}
/**
 * 分页 Promise。
 * Pagination promise.
 *
 * @template TPage 分页类型 / Page type.
 * @template TItem 条目类型 / Item type.
 */
declare class PagePromise<TPage extends AbstractPage<TItem>, TItem = unknown> implements PromiseLike<TPage>, AsyncIterable<TItem> {
    #private;
    constructor(factory: () => Promise<TPage>);
    then<TResult1 = TPage, TResult2 = never>(onfulfilled?: ((value: TPage) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2>;
    [Symbol.asyncIterator](): AsyncGenerator<TItem>;
}
/**
 * 用户信息。
 * User information.
 */
interface UserGetResponse {
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
interface TokenVerifyResponse {
    id: string;
    status: "active" | "disabled" | "expired";
    [key: string]: unknown;
}
/**
 * Zone。
 * Zone.
 */
interface Zone {
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
interface ZoneListParams extends V4PagePaginationArrayParams {
    name?: string;
    status?: string;
    match?: string;
}
/**
 * Zone 获取参数。
 * Zone get params.
 */
interface ZoneGetParams {
    zone_id: string;
}
/**
 * DNS 记录类型。
 * DNS record type.
 */
type DNSRecordType = "A" | "AAAA" | "CAA" | "CERT" | "CNAME" | "DNSKEY" | "DS" | "HTTPS" | "LOC" | "MX" | "NAPTR" | "NS" | "OPENPGPKEY" | "PTR" | "SMIMEA" | "SRV" | "SSHFP" | "SVCB" | "TLSA" | "TXT" | "URI";
/**
 * DNS TTL。
 * DNS TTL.
 */
type TTL = number | 1;
/**
 * DNS 标签。
 * DNS record tags.
 */
type RecordTags = string;
/**
 * DNS 记录响应。
 * DNS record response.
 */
interface RecordResponse {
    id?: string;
    zone_id?: string;
    zone_name?: string;
    type?: DNSRecordType;
    name?: string;
    content?: string;
    proxied?: boolean;
    ttl?: TTL;
    priority?: number;
    comment?: string | null;
    tags?: RecordTags[];
    [key: string]: unknown;
}
/**
 * DNS 记录创建参数。
 * DNS record create params.
 */
interface RecordCreateParams {
    zone_id: string;
    type: DNSRecordType;
    name: string;
    content?: string;
    ttl?: TTL;
    priority?: number;
    proxied?: boolean;
    comment?: string | null;
    tags?: RecordTags[];
    [key: string]: unknown;
}
/**
 * DNS 记录更新参数。
 * DNS record update params.
 */
type RecordUpdateParams = RecordCreateParams;
/**
 * DNS 记录增量更新参数。
 * DNS record patch params.
 */
interface RecordEditParams extends Partial<Omit<RecordCreateParams, "zone_id">> {
    zone_id: string;
    type?: DNSRecordType;
    name?: string;
}
/**
 * DNS 列表字段过滤器。
 * DNS list field filter.
 */
interface RecordListFieldFilter {
    contains?: string;
    endswith?: string;
    exact?: string;
    startswith?: string;
    absent?: boolean;
    present?: boolean;
    [key: string]: QueryValue;
}
/**
 * DNS 列表标签过滤器。
 * DNS list tag filter.
 */
interface RecordListTagFilter {
    contains?: string;
    endswith?: string;
    exact?: string;
    startswith?: string;
    absent?: string;
    present?: string;
    [key: string]: QueryValue;
}
/**
 * DNS 记录列表参数。
 * DNS record list params.
 */
interface RecordListParams extends V4PagePaginationArrayParams {
    zone_id: string;
    comment?: string | RecordListFieldFilter;
    content?: string | RecordListFieldFilter;
    direction?: "asc" | "desc";
    match?: "any" | "all";
    name?: string | RecordListFieldFilter;
    order?: "type" | "name" | "content" | "ttl" | "proxied";
    proxied?: boolean;
    search?: string;
    tag?: string | RecordListTagFilter;
    tag_match?: "any" | "all";
    type?: DNSRecordType;
}
/**
 * DNS 记录获取参数。
 * DNS record get params.
 */
interface RecordGetParams {
    zone_id: string;
}
/**
 * DNS 记录删除参数。
 * DNS record delete params.
 */
interface RecordDeleteParams {
    zone_id: string;
}
/**
 * DNS 批量删除条目。
 * DNS batch delete entry.
 */
interface RecordBatchDelete {
    id: string;
}
/**
 * DNS 批量新增条目。
 * DNS batch create entry.
 */
interface RecordBatchPost extends Omit<RecordCreateParams, "zone_id"> {
}
/**
 * DNS 批量覆盖条目。
 * DNS batch put entry.
 */
interface BatchPutParam extends RecordBatchPost {
    id: string;
}
/**
 * DNS 批量补丁条目。
 * DNS batch patch entry.
 */
interface BatchPatchParam extends Partial<RecordBatchPost> {
    id: string;
}
/**
 * DNS 记录批量参数。
 * DNS record batch params.
 */
interface RecordBatchParams {
    zone_id: string;
    deletes?: RecordBatchDelete[];
    patches?: BatchPatchParam[];
    posts?: RecordBatchPost[];
    puts?: BatchPutParam[];
}
/**
 * DNS 导出参数。
 * DNS export params.
 */
interface RecordExportParams {
    zone_id: string;
}
/**
 * DNS 导入参数。
 * DNS import params.
 */
interface RecordImportParams {
    zone_id: string;
    file: string | Blob;
    proxied?: string;
}
/**
 * DNS 扫描参数。
 * DNS scan params.
 */
interface RecordScanParams {
    zone_id: string;
    body: unknown;
}
/**
 * DNS 扫描列表参数。
 * DNS scan list params.
 */
interface RecordScanListParams {
    zone_id: string;
}
/**
 * DNS 扫描拒绝条目。
 * DNS scan reject entry.
 */
interface RecordScanReject {
    id: string;
}
/**
 * DNS 扫描审核参数。
 * DNS scan review params.
 */
interface RecordScanReviewParams {
    zone_id: string;
    accepts?: RecordBatchPost[];
    rejects?: RecordScanReject[];
}
/**
 * DNS 扫描触发参数。
 * DNS scan trigger params.
 */
interface RecordScanTriggerParams {
    zone_id: string;
}
/**
 * DNS 删除响应。
 * DNS delete response.
 */
interface RecordDeleteResponse {
    id?: string;
}
/**
 * DNS 批量响应。
 * DNS batch response.
 */
interface RecordBatchResponse {
    deletes?: RecordResponse[];
    patches?: RecordResponse[];
    posts?: RecordResponse[];
    puts?: RecordResponse[];
}
/**
 * DNS 导出响应。
 * DNS export response.
 */
type RecordExportResponse = string;
/**
 * DNS 导入响应。
 * DNS import response.
 */
interface RecordImportResponse {
    recs_added?: number;
    total_records_parsed?: number;
}
/**
 * DNS 扫描响应。
 * DNS scan response.
 */
interface RecordScanResponse {
    recs_added?: number;
    total_records_parsed?: number;
}
/**
 * DNS 扫描审核响应。
 * DNS scan review response.
 */
interface RecordScanReviewResponse {
    accepts?: RecordResponse[];
    rejects?: string[];
}
/**
 * DNS 扫描触发明细。
 * DNS scan trigger detail.
 */
interface RecordScanTriggerDetail {
    code: number;
    message: string;
    documentation_url?: string;
    source?: {
        pointer?: string;
    };
}
/**
 * DNS 扫描触发响应。
 * DNS scan trigger response.
 */
interface RecordScanTriggerResponse {
    errors: RecordScanTriggerDetail[];
    messages: RecordScanTriggerDetail[];
    success: true;
    [key: string]: unknown;
}
/**
 * KV Namespace。
 * KV namespace.
 */
interface Namespace {
    id: string;
    title: string;
    supports_url_encoding?: boolean;
    [key: string]: unknown;
}
/**
 * KV Namespace 创建参数。
 * KV namespace create params.
 */
interface NamespaceCreateParams {
    account_id: string;
    title: string;
}
/**
 * KV Namespace 更新参数。
 * KV namespace update params.
 */
interface NamespaceUpdateParams {
    account_id: string;
    title: string;
}
/**
 * KV Namespace 列表参数。
 * KV namespace list params.
 */
interface NamespaceListParams extends V4PagePaginationArrayParams {
    account_id: string;
    order?: "id" | "title";
    direction?: "asc" | "desc";
}
/**
 * KV Namespace 删除参数。
 * KV namespace delete params.
 */
interface NamespaceDeleteParams {
    account_id: string;
}
/**
 * KV Namespace 获取参数。
 * KV namespace get params.
 */
interface NamespaceGetParams {
    account_id: string;
}
/**
 * KV 批量读取类型。
 * KV bulk get type.
 */
type KVBulkGetType = "text" | "json";
/**
 * KV Namespace 批量删除参数。
 * KV namespace bulk delete params.
 */
interface NamespaceBulkDeleteParams {
    account_id: string;
    body: string[];
}
/**
 * KV Namespace 批量读取参数。
 * KV namespace bulk get params.
 */
interface NamespaceBulkGetParams {
    account_id: string;
    keys: string[];
    type?: KVBulkGetType;
    withMetadata?: boolean;
}
/**
 * KV Namespace 批量写入条目。
 * KV namespace bulk write entry.
 */
interface NamespaceBulkUpdateBody {
    key: string;
    value: string;
    base64?: boolean;
    expiration?: number;
    expiration_ttl?: number;
    metadata?: unknown;
}
/**
 * KV Namespace 批量写入参数。
 * KV namespace bulk update params.
 */
interface NamespaceBulkUpdateParams {
    account_id: string;
    body: NamespaceBulkUpdateBody[];
}
/**
 * KV Namespace 删除响应。
 * KV namespace delete response.
 */
interface NamespaceDeleteResponse {
}
/**
 * KV Namespace 批量删除响应。
 * KV namespace bulk delete response.
 */
interface NamespaceBulkDeleteResponse {
    successful_key_count?: number;
    unsuccessful_keys?: string[];
}
/**
 * KV Namespace 批量读取响应值（含元数据）。
 * KV namespace bulk get response value with metadata.
 */
interface NamespaceBulkGetValueWithMetadata {
    metadata: unknown;
    value: unknown;
    expiration?: number;
}
/**
 * KV Namespace 批量读取响应。
 * KV namespace bulk get response.
 */
interface NamespaceBulkGetResponse {
    values?: {
        [key: string]: string | number | boolean | Record<string, unknown> | NamespaceBulkGetValueWithMetadata | null;
    };
}
/**
 * KV Namespace 批量写入响应。
 * KV namespace bulk update response.
 */
interface NamespaceBulkUpdateResponse {
    successful_key_count?: number;
    unsuccessful_keys?: string[];
}
/**
 * KV 键。
 * KV key.
 */
interface Key {
    name: string;
    expiration?: number;
    metadata?: unknown;
}
/**
 * KV 键列表参数。
 * KV key list params.
 */
interface KeyListParams extends CursorPaginationAfterParams {
    account_id: string;
    prefix?: string;
}
/**
 * KV 键批量删除参数。
 * KV key bulk delete params.
 */
interface KeyBulkDeleteParams extends NamespaceBulkDeleteParams {
}
/**
 * KV 键批量读取参数。
 * KV key bulk get params.
 */
interface KeyBulkGetParams extends NamespaceBulkGetParams {
}
/**
 * KV 键批量写入参数。
 * KV key bulk update params.
 */
interface KeyBulkUpdateParams extends NamespaceBulkUpdateParams {
}
/**
 * KV 键批量删除响应。
 * KV key bulk delete response.
 */
type KeyBulkDeleteResponse = NamespaceBulkDeleteResponse;
/**
 * KV 键批量读取响应。
 * KV key bulk get response.
 */
type KeyBulkGetResponse = NamespaceBulkGetResponse;
/**
 * KV 键批量写入响应。
 * KV key bulk update response.
 */
type KeyBulkUpdateResponse = NamespaceBulkUpdateResponse;
/**
 * KV 元数据读取参数。
 * KV metadata get params.
 */
interface MetadataGetParams {
    account_id: string;
}
/**
 * KV 元数据读取响应。
 * KV metadata get response.
 */
type MetadataGetResponse = unknown;
/**
 * KV 值写入参数。
 * KV value update params.
 */
interface ValueUpdateParams {
    account_id: string;
    value: string;
    expiration?: number;
    expiration_ttl?: number;
    metadata?: unknown;
}
/**
 * KV 值写入响应。
 * KV value update response.
 */
interface ValueUpdateResponse {
}
/**
 * KV 值读取参数。
 * KV value get params.
 */
interface ValueGetParams {
    account_id: string;
}
/**
 * KV 值删除参数。
 * KV value delete params.
 */
interface ValueDeleteParams {
    account_id: string;
}
/**
 * KV 值删除响应。
 * KV value delete response.
 */
interface ValueDeleteResponse {
}
/**
 * Zone 分页结果。
 * Zone pagination result.
 */
declare class ZonesV4PagePaginationArray extends V4PagePaginationArray<Zone> {
}
/**
 * DNS 记录分页结果。
 * DNS record pagination result.
 */
declare class RecordResponsesV4PagePaginationArray extends V4PagePaginationArray<RecordResponse> {
}
/**
 * DNS 记录单页结果。
 * DNS record single page result.
 */
declare class RecordResponsesSinglePage extends SinglePage<RecordResponse> {
}
/**
 * Namespace 分页结果。
 * Namespace pagination result.
 */
declare class NamespacesV4PagePaginationArray extends V4PagePaginationArray<Namespace> {
}
/**
 * KV 键 Cursor 分页结果。
 * KV key cursor pagination result.
 */
declare class KeysCursorPaginationAfter extends CursorPaginationAfter<Key> {
}
declare class APIResource {
    protected readonly _client: Cloudflare;
    constructor(client: Cloudflare);
}
/**
 * 用户资源。
 * User resource.
 */
declare class UserResource extends APIResource {
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
declare class UserTokensResource extends APIResource {
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
declare class ZonesResource extends APIResource {
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
declare class DNSResource extends APIResource {
    readonly records: DNSRecordsResource;
}
/**
 * DNS 记录资源。
 * DNS records resource.
 */
declare class DNSRecordsResource extends APIResource {
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
     * 覆盖更新 DNS 记录。
     * Overwrite a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    update(dnsRecordId: string, params: RecordUpdateParams, options?: RequestOptions): Promise<RecordResponse>;
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
     * 删除 DNS 记录。
     * Delete a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordDeleteParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordDeleteResponse>}
     */
    delete(dnsRecordId: string, params: RecordDeleteParams, options?: RequestOptions): Promise<RecordDeleteResponse>;
    /**
     * 批量执行 DNS 记录操作。
     * Execute DNS record operations in batch.
     *
     * @param {RecordBatchParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordBatchResponse>}
     */
    batch(params: RecordBatchParams, options?: RequestOptions): Promise<RecordBatchResponse>;
    /**
     * 增量更新 DNS 记录。
     * Patch a DNS record.
     *
     * @param {string} dnsRecordId 记录 ID / Record ID.
     * @param {RecordEditParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordResponse>}
     */
    edit(dnsRecordId: string, params: RecordEditParams, options?: RequestOptions): Promise<RecordResponse>;
    /**
     * 导出 DNS 区域文件。
     * Export DNS zone file.
     *
     * @param {RecordExportParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordExportResponse>}
     */
    export(params: RecordExportParams, options?: RequestOptions): Promise<RecordExportResponse>;
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
     * 导入 DNS 区域文件。
     * Import DNS zone file.
     *
     * @param {RecordImportParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordImportResponse>}
     */
    import(params: RecordImportParams, options?: RequestOptions): Promise<RecordImportResponse>;
    /**
     * 同步扫描并写入 DNS 记录。
     * Scan and import DNS records synchronously.
     *
     * @param {RecordScanParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordScanResponse>}
     */
    scan(params: RecordScanParams, options?: RequestOptions): Promise<RecordScanResponse>;
    /**
     * 获取异步扫描结果列表。
     * List asynchronous scan results.
     *
     * @param {RecordScanListParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<RecordResponsesSinglePage, RecordResponse>}
     */
    scanList(params: RecordScanListParams, options?: RequestOptions): PagePromise<RecordResponsesSinglePage, RecordResponse>;
    /**
     * 接受或拒绝扫描出的 DNS 记录。
     * Accept or reject scanned DNS records.
     *
     * @param {RecordScanReviewParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordScanReviewResponse>}
     */
    scanReview(params: RecordScanReviewParams, options?: RequestOptions): Promise<RecordScanReviewResponse>;
    /**
     * 触发异步 DNS 记录扫描。
     * Trigger asynchronous DNS record scan.
     *
     * @param {RecordScanTriggerParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<RecordScanTriggerResponse>}
     */
    scanTrigger(params: RecordScanTriggerParams, options?: RequestOptions): Promise<RecordScanTriggerResponse>;
}
/**
 * KV 资源。
 * KV resource.
 */
declare class KVResource extends APIResource {
    readonly namespaces: NamespacesResource;
}
/**
 * KV Namespace 资源。
 * KV namespace resource.
 */
declare class NamespacesResource extends APIResource {
    readonly keys: KeysResource;
    readonly metadata: MetadataResource;
    readonly values: ValuesResource;
    /**
     * 创建 Namespace。
     * Create a namespace.
     *
     * @param {NamespaceCreateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Namespace>}
     */
    create(params: NamespaceCreateParams, options?: RequestOptions): Promise<Namespace>;
    /**
     * 更新 Namespace。
     * Update a namespace.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Namespace>}
     */
    update(namespaceId: string, params: NamespaceUpdateParams, options?: RequestOptions): Promise<Namespace>;
    /**
     * 列出 Namespace。
     * List namespaces.
     *
     * @param {NamespaceListParams} params 查询参数 / Query params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {PagePromise<NamespacesV4PagePaginationArray, Namespace>}
     */
    list(params: NamespaceListParams, options?: RequestOptions): PagePromise<NamespacesV4PagePaginationArray, Namespace>;
    /**
     * 删除 Namespace。
     * Delete a namespace.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceDeleteParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceDeleteResponse | null>}
     */
    delete(namespaceId: string, params: NamespaceDeleteParams, options?: RequestOptions): Promise<NamespaceDeleteResponse | null>;
    /**
     * 批量删除 KV 键。
     * Bulk delete KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceBulkDeleteParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceBulkDeleteResponse | null>}
     */
    bulkDelete(namespaceId: string, params: NamespaceBulkDeleteParams, options?: RequestOptions): Promise<NamespaceBulkDeleteResponse | null>;
    /**
     * 批量读取 KV 键。
     * Bulk get KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceBulkGetParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceBulkGetResponse | null>}
     */
    bulkGet(namespaceId: string, params: NamespaceBulkGetParams, options?: RequestOptions): Promise<NamespaceBulkGetResponse | null>;
    /**
     * 批量写入 KV 键。
     * Bulk update KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceBulkUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<NamespaceBulkUpdateResponse | null>}
     */
    bulkUpdate(namespaceId: string, params: NamespaceBulkUpdateParams, options?: RequestOptions): Promise<NamespaceBulkUpdateResponse | null>;
    /**
     * 获取 Namespace。
     * Get a namespace.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {NamespaceGetParams} params 路径参数 / Path params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Namespace>}
     */
    get(namespaceId: string, params: NamespaceGetParams, options?: RequestOptions): Promise<Namespace>;
}
/**
 * KV 键资源。
 * KV keys resource.
 */
declare class KeysResource extends APIResource {
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
    /**
     * 批量删除 KV 键。
     * Bulk delete KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyBulkDeleteParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<KeyBulkDeleteResponse | null>}
     */
    bulkDelete(namespaceId: string, params: KeyBulkDeleteParams, options?: RequestOptions): Promise<KeyBulkDeleteResponse | null>;
    /**
     * 批量读取 KV 键。
     * Bulk get KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyBulkGetParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<KeyBulkGetResponse | null>}
     */
    bulkGet(namespaceId: string, params: KeyBulkGetParams, options?: RequestOptions): Promise<KeyBulkGetResponse | null>;
    /**
     * 批量写入 KV 键。
     * Bulk update KV keys.
     *
     * @param {string} namespaceId Namespace ID / Namespace ID.
     * @param {KeyBulkUpdateParams} params 请求参数 / Request params.
     * @param {RequestOptions} [options] 请求选项 / Request options.
     * @returns {Promise<KeyBulkUpdateResponse | null>}
     */
    bulkUpdate(namespaceId: string, params: KeyBulkUpdateParams, options?: RequestOptions): Promise<KeyBulkUpdateResponse | null>;
}
/**
 * KV 元数据资源。
 * KV metadata resource.
 */
declare class MetadataResource extends APIResource {
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
    get(namespaceId: string, keyName: string, params: MetadataGetParams, options?: RequestOptions): Promise<MetadataGetResponse>;
}
/**
 * KV 值资源。
 * KV values resource.
 */
declare class ValuesResource extends APIResource {
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
    update(namespaceId: string, keyName: string, params: ValueUpdateParams, options?: RequestOptions): Promise<ValueUpdateResponse | null>;
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
    get(namespaceId: string, keyName: string, params: ValueGetParams, options?: RequestOptions): Promise<FetchResponse>;
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
    delete(namespaceId: string, keyName: string, params: ValueDeleteParams, options?: RequestOptions): Promise<ValueDeleteResponse | null>;
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
 * const value = typeof response.body === "string" ? response.body : "";
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
export type { DNSRecordType, TTL, RecordTags, RecordResponse, RecordCreateParams, RecordUpdateParams, RecordEditParams, RecordListFieldFilter, RecordListTagFilter, RecordListParams, RecordGetParams, RecordDeleteParams, RecordBatchDelete, RecordBatchPost, BatchPutParam, BatchPatchParam, RecordBatchParams, RecordExportParams, RecordImportParams, RecordScanParams, RecordScanListParams, RecordScanReject, RecordScanReviewParams, RecordScanTriggerParams, RecordDeleteResponse, RecordBatchResponse, RecordExportResponse, RecordImportResponse, RecordScanResponse, RecordScanReviewResponse, RecordScanTriggerDetail, RecordScanTriggerResponse, Namespace, NamespaceCreateParams, NamespaceUpdateParams, NamespaceListParams, NamespaceDeleteParams, NamespaceGetParams, KVBulkGetType, NamespaceBulkDeleteParams, NamespaceBulkGetParams, NamespaceBulkUpdateBody, NamespaceBulkUpdateParams, NamespaceDeleteResponse, NamespaceBulkDeleteResponse, NamespaceBulkGetValueWithMetadata, NamespaceBulkGetResponse, NamespaceBulkUpdateResponse, Key, KeyListParams, KeyBulkDeleteParams, KeyBulkGetParams, KeyBulkUpdateParams, KeyBulkDeleteResponse, KeyBulkGetResponse, KeyBulkUpdateResponse, MetadataGetParams, MetadataGetResponse, ValueUpdateParams, ValueUpdateResponse, ValueGetParams, ValueDeleteParams, ValueDeleteResponse, };
export default Cloudflare;
