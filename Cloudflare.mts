import { fetch as utilFetch, notification, type FetchRequest, type FetchResponse } from "@nsnanocat/util";

const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);

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
type QueryValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| QueryValue[]
	| {
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
 * Cloudflare 静态请求行为选项。
 * Cloudflare static request behavior options.
 */
interface CloudflareFetchOptions {
	/**
	 * 最大重试次数（覆盖客户端默认值）。
	 * Max retry count (overrides client default).
	 */
	maxRetries?: number;
	/**
	 * 响应类型，`binary` 时返回原始 `FetchResponse`。
	 * Response type; `binary` returns raw `FetchResponse`.
	 */
	responseType?: "json" | "binary";
	/**
	 * 是否根据 `messages/errors` 发送通知。
	 * Whether to emit notifications from `messages/errors`.
	 */
	notify?: boolean;
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

interface CloudflareEnvelope<Result = unknown> {
	success?: boolean;
	errors?: CloudflareAPIErrorEntry[];
	messages?: Array<{
		code?: number;
		message?: string;
		[key: string]: unknown;
	}>;
	result?: Result;
	result_info?: CloudflareResultInfo;
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
export class CloudflareAPIError extends Error {
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
	constructor(
		message: string,
		init: {
			status?: number;
			errors?: CloudflareAPIErrorEntry[];
			body?: unknown;
		} = {},
	) {
		super(message);
		this.name = "CloudflareAPIError";
		this.status = init.status;
		this.errors = init.errors;
		this.body = init.body;
	}
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
type DNSRecordType =
	| "A"
	| "AAAA"
	| "CAA"
	| "CERT"
	| "CNAME"
	| "DNSKEY"
	| "DS"
	| "HTTPS"
	| "LOC"
	| "MX"
	| "NAPTR"
	| "NS"
	| "OPENPGPKEY"
	| "PTR"
	| "SMIMEA"
	| "SRV"
	| "SSHFP"
	| "SVCB"
	| "TLSA"
	| "TXT"
	| "URI";

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
interface RecordBatchPost extends Omit<RecordCreateParams, "zone_id"> {}

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
interface NamespaceDeleteResponse {}

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
		[key: string]:
			| string
			| number
			| boolean
			| Record<string, unknown>
			| NamespaceBulkGetValueWithMetadata
			| null;
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
interface KeyBulkDeleteParams extends NamespaceBulkDeleteParams {}

/**
 * KV 键批量读取参数。
 * KV key bulk get params.
 */
interface KeyBulkGetParams extends NamespaceBulkGetParams {}

/**
 * KV 键批量写入参数。
 * KV key bulk update params.
 */
interface KeyBulkUpdateParams extends NamespaceBulkUpdateParams {}

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
interface ValueUpdateResponse {}

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
interface ValueDeleteResponse {}

class APIResource {
	protected readonly _client: Cloudflare;

	constructor(client: Cloudflare) {
		this._client = client;
	}
}

/**
 * 用户资源。
 * User resource.
 */
class UserResource extends APIResource {
	readonly tokens = new UserTokensResource(this._client);

	/**
	 * 获取当前用户。
	 * Get the current user.
	 *
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<UserGetResponse>}
	 */
	get(options?: RequestOptions): Promise<UserGetResponse> {
		return getResult<UserGetResponse>(this._client, "/user", options);
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
	verify(options?: RequestOptions): Promise<TokenVerifyResponse> {
		return getResult<TokenVerifyResponse>(this._client, "/user/tokens/verify", options);
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
	list(
		queryOrOptions?: ZoneListParams | RequestOptions,
		options?: RequestOptions,
	): Promise<Zone[]> {
		// Keep the existing "query or options" call style without relying on extra helpers.
		const isOptions =
			typeof queryOrOptions === "object" &&
			queryOrOptions !== null &&
			["headers", "query", "timeout", "maxRetries"].some(key => key in queryOrOptions);
		const query = isOptions ? {} : ({ ...((queryOrOptions as ZoneListParams | undefined) ?? {}) } as QueryLike);
		const requestOptions = isOptions ? (queryOrOptions as RequestOptions) : options;
		return getResult<Zone[]>(this._client, "/zones", {
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
	get(params: ZoneGetParams, options?: RequestOptions): Promise<Zone> {
		return getResult<Zone>(this._client, `/zones/${encodeURIComponent(params.zone_id)}`, options);
	}
}

/**
 * DNS 资源。
 * DNS resource.
 */
class DNSResource extends APIResource {
	readonly records = new DNSRecordsResource(this._client);
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
	create(params: RecordCreateParams, options?: RequestOptions): Promise<RecordResponse> {
		const { zone_id, ...body } = params;
		return postResult<RecordResponse>(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records`, {
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
	update(dnsRecordId: string, params: RecordUpdateParams, options?: RequestOptions): Promise<RecordResponse> {
		const { zone_id, ...body } = params;
		return putResult<RecordResponse>(
			this._client,
			`/zones/${encodeURIComponent(zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`,
			{
				...options,
				body,
			},
		);
	}

	/**
	 * 列出 DNS 记录。
	 * List DNS records.
	 *
	 * @param {RecordListParams} params 查询参数 / Query params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<RecordResponse[]>}
	 */
	list(
		params: RecordListParams,
		options?: RequestOptions,
	): Promise<RecordResponse[]> {
		const { zone_id, ...query } = params;
		return getResult<RecordResponse[]>(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records`, {
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
	delete(
		dnsRecordId: string,
		params: RecordDeleteParams,
		options?: RequestOptions,
	): Promise<RecordDeleteResponse> {
		return deleteResult<RecordDeleteResponse>(
			this._client,
			`/zones/${encodeURIComponent(params.zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`,
			options,
		);
	}

	/**
	 * 批量执行 DNS 记录操作。
	 * Execute DNS record operations in batch.
	 *
	 * @param {RecordBatchParams} params 请求参数 / Request params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<RecordBatchResponse>}
	 */
	batch(params: RecordBatchParams, options?: RequestOptions): Promise<RecordBatchResponse> {
		const { zone_id, ...body } = params;
		return postResult<RecordBatchResponse>(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/batch`, {
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
	edit(dnsRecordId: string, params: RecordEditParams, options?: RequestOptions): Promise<RecordResponse> {
		const { zone_id, ...body } = params;
		return patchResult<RecordResponse>(
			this._client,
			`/zones/${encodeURIComponent(zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`,
			{
				...options,
				body,
			},
		);
	}

	/**
	 * 导出 DNS 区域文件。
	 * Export DNS zone file.
	 *
	 * @param {RecordExportParams} params 路径参数 / Path params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<RecordExportResponse>}
	 */
	export(params: RecordExportParams, options?: RequestOptions): Promise<RecordExportResponse> {
		return getResult<RecordExportResponse>(this._client, `/zones/${encodeURIComponent(params.zone_id)}/dns_records/export`, {
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
	get(dnsRecordId: string, params: RecordGetParams, options?: RequestOptions): Promise<RecordResponse> {
		return getResult<RecordResponse>(
			this._client,
			`/zones/${encodeURIComponent(params.zone_id)}/dns_records/${encodeURIComponent(dnsRecordId)}`,
			options,
		);
	}

	/**
	 * 导入 DNS 区域文件。
	 * Import DNS zone file.
	 *
	 * @param {RecordImportParams} params 请求参数 / Request params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<RecordImportResponse>}
	 */
	import(params: RecordImportParams, options?: RequestOptions): Promise<RecordImportResponse> {
		const { zone_id, file, proxied } = params;
		const formData = new FormData();
		formData.append("file", file);
		if (proxied !== undefined) formData.append("proxied", proxied);
		return postResult<RecordImportResponse>(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/import`, {
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
	scan(params: RecordScanParams, options?: RequestOptions): Promise<RecordScanResponse> {
		const { zone_id, body } = params;
		return postResult<RecordScanResponse>(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/scan`, {
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
	 * @returns {Promise<RecordResponse[]>}
	 */
	scanList(
		params: RecordScanListParams,
		options?: RequestOptions,
	): Promise<RecordResponse[]> {
		return getResult<RecordResponse[]>(this._client, `/zones/${encodeURIComponent(params.zone_id)}/dns_records/scan/review`, options);
	}

	/**
	 * 接受或拒绝扫描出的 DNS 记录。
	 * Accept or reject scanned DNS records.
	 *
	 * @param {RecordScanReviewParams} params 请求参数 / Request params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<RecordScanReviewResponse>}
	 */
	scanReview(params: RecordScanReviewParams, options?: RequestOptions): Promise<RecordScanReviewResponse> {
		const { zone_id, ...body } = params;
		return postResult<RecordScanReviewResponse>(
			this._client,
			`/zones/${encodeURIComponent(zone_id)}/dns_records/scan/review`,
			{
				...options,
				body,
			},
		);
	}

	/**
	 * 触发异步 DNS 记录扫描。
	 * Trigger asynchronous DNS record scan.
	 *
	 * @param {RecordScanTriggerParams} params 路径参数 / Path params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<RecordScanTriggerResponse>}
	 */
	scanTrigger(params: RecordScanTriggerParams, options?: RequestOptions): Promise<RecordScanTriggerResponse> {
		return postResult<RecordScanTriggerResponse>(
			this._client,
			`/zones/${encodeURIComponent(params.zone_id)}/dns_records/scan/trigger`,
			options,
		);
	}
}

/**
 * KV 资源。
 * KV resource.
 */
class KVResource extends APIResource {
	readonly namespaces = new NamespacesResource(this._client);
}

/**
 * KV Namespace 资源。
 * KV namespace resource.
 */
class NamespacesResource extends APIResource {
	readonly keys = new KeysResource(this._client);
	readonly metadata = new MetadataResource(this._client);
	readonly values = new ValuesResource(this._client);

	/**
	 * 创建 Namespace。
	 * Create a namespace.
	 *
	 * @param {NamespaceCreateParams} params 请求参数 / Request params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<Namespace>}
	 */
	create(params: NamespaceCreateParams, options?: RequestOptions): Promise<Namespace> {
		const { account_id, ...body } = params;
		return postResult<Namespace>(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces`, {
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
	update(namespaceId: string, params: NamespaceUpdateParams, options?: RequestOptions): Promise<Namespace> {
		const { account_id, ...body } = params;
		return putResult<Namespace>(
			this._client,
			`/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`,
			{
				...options,
				body,
			},
		);
	}

	/**
	 * 列出 Namespace。
	 * List namespaces.
	 *
	 * @param {NamespaceListParams} params 查询参数 / Query params.
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<Namespace[]>}
	 */
	list(
		params: NamespaceListParams,
		options?: RequestOptions,
	): Promise<Namespace[]> {
		const { account_id, ...query } = params;
		return getResult<Namespace[]>(this._client, `/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces`, {
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
	delete(
		namespaceId: string,
		params: NamespaceDeleteParams,
		options?: RequestOptions,
	): Promise<NamespaceDeleteResponse | null> {
		return deleteResult<NamespaceDeleteResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`,
			options,
		);
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
	bulkDelete(
		namespaceId: string,
		params: NamespaceBulkDeleteParams,
		options?: RequestOptions,
	): Promise<NamespaceBulkDeleteResponse | null> {
		return postResult<NamespaceBulkDeleteResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/delete`,
			{
				...options,
				body: params.body,
			},
		);
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
	bulkGet(
		namespaceId: string,
		params: NamespaceBulkGetParams,
		options?: RequestOptions,
	): Promise<NamespaceBulkGetResponse | null> {
		const { account_id, ...body } = params;
		return postResult<NamespaceBulkGetResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/get`,
			{
				...options,
				body,
			},
		);
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
	bulkUpdate(
		namespaceId: string,
		params: NamespaceBulkUpdateParams,
		options?: RequestOptions,
	): Promise<NamespaceBulkUpdateResponse | null> {
		return putResult<NamespaceBulkUpdateResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk`,
			{
				...options,
				body: params.body,
			},
		);
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
	get(namespaceId: string, params: NamespaceGetParams, options?: RequestOptions): Promise<Namespace> {
		return getResult<Namespace>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`,
			options,
		);
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
	list(
		namespaceId: string,
		params: KeyListParams,
		options?: RequestOptions,
	): Promise<Key[]> {
		const { account_id, ...query } = params;
		return getResult<Key[]>(
			this._client,
			`/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/keys`,
			{
				...options,
				query: {
					...(options?.query ?? {}),
					...query,
				},
			},
		);
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
	bulkDelete(
		namespaceId: string,
		params: KeyBulkDeleteParams,
		options?: RequestOptions,
	): Promise<KeyBulkDeleteResponse | null> {
		return postResult<KeyBulkDeleteResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/delete`,
			{
				...options,
				body: params.body,
			},
		);
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
	bulkGet(
		namespaceId: string,
		params: KeyBulkGetParams,
		options?: RequestOptions,
	): Promise<KeyBulkGetResponse | null> {
		const { account_id, ...body } = params;
		return postResult<KeyBulkGetResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk/get`,
			{
				...options,
				body,
			},
		);
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
	bulkUpdate(
		namespaceId: string,
		params: KeyBulkUpdateParams,
		options?: RequestOptions,
	): Promise<KeyBulkUpdateResponse | null> {
		return putResult<KeyBulkUpdateResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/bulk`,
			{
				...options,
				body: params.body,
			},
		);
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
	get(
		namespaceId: string,
		keyName: string,
		params: MetadataGetParams,
		options?: RequestOptions,
	): Promise<MetadataGetResponse> {
		return getResult<MetadataGetResponse>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/metadata/${encodeURIComponent(keyName)}`,
			options,
		);
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
	update(
		namespaceId: string,
		keyName: string,
		params: ValueUpdateParams,
		options?: RequestOptions,
	): Promise<ValueUpdateResponse | null> {
		const { account_id, expiration, expiration_ttl, value, metadata } = params;
		let body: string | FormData = value;
		let headers: HeadersLike = {
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
		return putResult<ValueUpdateResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`,
			{
				...options,
				query: {
					expiration,
					expiration_ttl,
				},
				body,
				headers,
			},
		);
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
	get(
		namespaceId: string,
		keyName: string,
		params: ValueGetParams,
		options?: RequestOptions,
	): Promise<FetchResponse> {
		return getBinaryResponse(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`,
			{
				...options,
				headers: {
					...options?.headers,
					Accept: "application/octet-stream",
				},
			},
		);
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
	delete(
		namespaceId: string,
		keyName: string,
		params: ValueDeleteParams,
		options?: RequestOptions,
	): Promise<ValueDeleteResponse | null> {
		return deleteResult<ValueDeleteResponse | null>(
			this._client,
			`/accounts/${encodeURIComponent(params.account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`,
			options,
		);
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

	readonly user = new UserResource(this);
	readonly zones = new ZonesResource(this);
	readonly dns = new DNSResource(this);
	readonly kv = new KVResource(this);

	/**
	 * 创建 Cloudflare 客户端。
	 * Create a Cloudflare client.
	 *
	 * @param {ClientOptions} [options={}] 客户端选项 / Client options.
	 */
	constructor(options: ClientOptions = {}) {
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
	static async fetch<Result = unknown>(
		request: FetchRequest,
		options: CloudflareFetchOptions = {},
	): Promise<Result | FetchResponse> {
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
						if (!response.ok) throw await createError(response);
						return response;
					default: {
						const body = parseResponseBody(response);
						const envelope = toCloudflareEnvelope(body);
						if (options.notify !== false && envelope) notifyEnvelope(envelope);
						if (!response.ok || envelope?.success === false) throw await createError(response, envelope ?? body);
						if (envelope) return (envelope.result ?? null) as Result;
						return body as Result;
					}
				}
			} catch (error) {
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
	static async trace(options?: RequestOptions): Promise<Record<string, string>> {
		return await Cloudflare.#trace("https://cloudflare.com/cdn-cgi/trace", options);
	}

	/**
	 * 追踪 IPv4 线路。
	 * Trace the IPv4 route.
	 *
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<Record<string, string>>} 追踪结果对象 / Trace result map.
	 */
	static async trace4(options?: RequestOptions): Promise<Record<string, string>> {
		return await Cloudflare.#trace("https://162.159.36.1/cdn-cgi/trace", options);
	}

	/**
	 * 追踪 IPv6 线路。
	 * Trace the IPv6 route.
	 *
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<Record<string, string>>} 追踪结果对象 / Trace result map.
	 */
	static async trace6(options?: RequestOptions): Promise<Record<string, string>> {
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
	static async #trace(url: string, options?: RequestOptions): Promise<Record<string, string>> {
		const rawResponse = await utilFetch(url, {
			method: "GET",
			timeout: options?.timeout ?? DEFAULT_TIMEOUT,
			headers: options?.headers,
		});
		const body = (rawResponse.body ?? "") as string;
		return Object.fromEntries(
			body
				.trim()
				.split("\n")
				.map(line => line.split("=", 2))
				.filter(parts => parts.length === 2),
		);
	}
}

export type {
	DNSRecordType,
	TTL,
	RecordTags,
	RecordResponse,
	RecordCreateParams,
	RecordUpdateParams,
	RecordEditParams,
	RecordListFieldFilter,
	RecordListTagFilter,
	RecordListParams,
	RecordGetParams,
	RecordDeleteParams,
	RecordBatchDelete,
	RecordBatchPost,
	BatchPutParam,
	BatchPatchParam,
	RecordBatchParams,
	RecordExportParams,
	RecordImportParams,
	RecordScanParams,
	RecordScanListParams,
	RecordScanReject,
	RecordScanReviewParams,
	RecordScanTriggerParams,
	RecordDeleteResponse,
	RecordBatchResponse,
	RecordExportResponse,
	RecordImportResponse,
	RecordScanResponse,
	RecordScanReviewResponse,
	RecordScanTriggerDetail,
	RecordScanTriggerResponse,
	Namespace,
	NamespaceCreateParams,
	NamespaceUpdateParams,
	NamespaceListParams,
	NamespaceDeleteParams,
	NamespaceGetParams,
	KVBulkGetType,
	NamespaceBulkDeleteParams,
	NamespaceBulkGetParams,
	NamespaceBulkUpdateBody,
	NamespaceBulkUpdateParams,
	NamespaceDeleteResponse,
	NamespaceBulkDeleteResponse,
	NamespaceBulkGetValueWithMetadata,
	NamespaceBulkGetResponse,
	NamespaceBulkUpdateResponse,
	Key,
	KeyListParams,
	KeyBulkDeleteParams,
	KeyBulkGetParams,
	KeyBulkUpdateParams,
	KeyBulkDeleteResponse,
	KeyBulkGetResponse,
	KeyBulkUpdateResponse,
	MetadataGetParams,
	MetadataGetResponse,
	ValueUpdateParams,
	ValueUpdateResponse,
	ValueGetParams,
	ValueDeleteParams,
	ValueDeleteResponse,
};

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
async function getResult<Result>(client: Cloudflare, path: string, options?: RequestOptions): Promise<Result> {
	return await requestClient<Result>(client, "GET", path, options);
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
async function postResult<Result>(
	client: Cloudflare,
	path: string,
	options?: RequestOptions & {
		body?: unknown;
	},
): Promise<Result> {
	return await requestClient<Result>(client, "POST", path, options);
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
async function putResult<Result>(
	client: Cloudflare,
	path: string,
	options?: RequestOptions & {
		body?: unknown;
	},
): Promise<Result> {
	return await requestClient<Result>(client, "PUT", path, options);
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
async function patchResult<Result>(
	client: Cloudflare,
	path: string,
	options?: RequestOptions & {
		body?: unknown;
	},
): Promise<Result> {
	return await requestClient<Result>(client, "PATCH", path, options);
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
async function deleteResult<Result>(client: Cloudflare, path: string, options?: RequestOptions): Promise<Result> {
	return await requestClient<Result>(client, "DELETE", path, options);
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
async function getBinaryResponse(client: Cloudflare, path: string, options?: RequestOptions): Promise<FetchResponse> {
	return await requestClient<FetchResponse>(client, "GET", path, {
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
async function requestClient<Result>(
	client: Cloudflare,
	method: string,
	path: string,
	options: (RequestOptions & {
		body?: unknown;
		responseType?: "json" | "binary";
	}) = {},
): Promise<Result> {
	const request = createFetchRequest(client, method, path, options);
	return (await Cloudflare.fetch<Result>(request, {
		maxRetries: options.maxRetries ?? client.maxRetries,
		responseType: options.responseType,
	})) as Result;
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
function createFetchRequest(
	client: Cloudflare,
	method: string,
	path: string,
	options: RequestOptions & {
		body?: unknown;
	},
): FetchRequest {
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
				if (key.toLowerCase() === "content-type") delete headers[key];
			}
			break;
		// 普通对象按 JSON 发送，并在缺失时补充 application/json。
		// Send plain objects as JSON and add application/json when absent.
		case
			!(body instanceof ArrayBuffer) &&
			!ArrayBuffer.isView(body) &&
			typeof body !== "string" &&
			Object.prototype.toString.call(body) === "[object Object]": {
			const hasContentType = Object.keys(headers).some(key => key.toLowerCase() === "content-type");
			if (!hasContentType) headers["Content-Type"] = "application/json";
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
		body: body as FetchRequest["body"],
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
function createURL(client: Cloudflare, path: string, query: QueryLike = {}): URL {
	const url = new URL(`${client.baseURL}${path}`);
	for (const [key, value] of Object.entries({ ...client.defaultQuery, ...query })) {
		if (value === undefined) {
			url.searchParams.delete(key);
			continue;
		}
		if (value === null) continue;
		switch (true) {
			// 数组参数展开为多个同名 query 键。
			// Expand array values into repeated query keys.
			case Array.isArray(value):
				url.searchParams.delete(key);
				for (const item of value) {
					if (item === undefined || item === null) continue;
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
function createAuthHeaders(client: Cloudflare): HeadersLike {
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
				"X-Auth-Key": client.apiKey!,
				"X-Auth-Email": client.apiEmail!,
			};
		// 再次选 User Service Key。
		// Then fallback to User Service Key.
		case Boolean(client.userServiceKey):
			return {
				"X-Auth-User-Service-Key": client.userServiceKey!,
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
function parseResponseBody(response: FetchResponse): unknown {
	const rawBody = (response.body ?? "") as string;
	switch (true) {
		// 非空响应体优先按 JSON 解析，失败则保留原始文本。
		// Parse non-empty response text as JSON first; keep raw text on failure.
		case Boolean(rawBody):
			try {
				return JSON.parse(rawBody);
			} catch (error) {
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
function toCloudflareEnvelope(payload: unknown): CloudflareEnvelope | null {
	return typeof payload === "object" && payload !== null && ("success" in payload || "result" in payload || "errors" in payload)
		? (payload as CloudflareEnvelope)
		: null;
}

/**
 * 按 Cloudflare V4 `messages/errors` 发出通知。
 * Emit notifications from Cloudflare V4 `messages/errors`.
 *
 * @param {CloudflareEnvelope} envelope Cloudflare 包裹响应 / Cloudflare envelope response.
 * @returns {void} 无返回值 / No return value.
 */
function notifyEnvelope(envelope: CloudflareEnvelope): void {
	for (const message of envelope.messages ?? []) {
		if (!message?.message) continue;
		if (message.code === 10000) continue;
		notification("Cloudflare API", `code: ${message.code ?? ""}`, `message: ${message.message}`);
	}
	if (envelope.success !== false) return;
	for (const error of envelope.errors ?? []) {
		if (!error?.message) continue;
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
async function createError(response: FetchResponse, body?: unknown): Promise<CloudflareAPIError> {
	const payload = body === undefined ? parseResponseBody(response) : body;
	const envelope = toCloudflareEnvelope(payload);
	const message =
		envelope?.errors?.find(item => Boolean(item?.message))?.message ??
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
function readEnv(name: string): string | null {
	const runtime = globalThis as typeof globalThis & {
		process?: {
			env?: Record<string, string | undefined>;
		};
	};
	return runtime.process?.env?.[name] ?? null;
}
