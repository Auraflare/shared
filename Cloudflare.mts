import { fetch as utilFetch, type FetchRequest, type FetchResponse } from "@nsnanocat/util";

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
 * Cloudflare 自定义 fetch。
 * Cloudflare custom fetch.
 */
type FetchLike = (
	resource: string | FetchRequest,
	options?: Partial<FetchRequest>,
) => Promise<FetchResponse | Response | CloudflareResponse>;

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
 * Web Response 兼容响应。
 * Web Response compatible response.
 */
export class CloudflareResponse {
	readonly ok: boolean;
	readonly status: number;
	readonly statusText: string;
	readonly headers: Headers;
	readonly url: string;
	#body: string | ArrayBuffer;

	/**
	 * 创建响应对象。
	 * Create a response object.
	 *
	 * @param {string | ArrayBuffer} body 响应体 / Response body.
	 * @param {{ status?: number; statusText?: string; headers?: HeadersInit; url?: string }} [init={}] 初始化信息 / Response init.
	 */
	constructor(
		body: string | ArrayBuffer,
		init: {
			status?: number;
			statusText?: string;
			headers?: HeadersInit | HeadersLike;
			url?: string;
		} = {},
	) {
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
	async text(): Promise<string> {
		return typeof this.#body === "string" ? this.#body : new TextDecoder().decode(this.#body);
	}

	/**
	 * 读取 JSON 响应体。
	 * Read the response body as JSON.
	 *
	 * @returns {Promise<unknown>}
	 */
	async json(): Promise<unknown> {
		return JSON.parse(await this.text());
	}

	/**
	 * 读取 ArrayBuffer 响应体。
	 * Read the response body as ArrayBuffer.
	 *
	 * @returns {Promise<ArrayBuffer>}
	 */
	async arrayBuffer(): Promise<ArrayBuffer> {
		return typeof this.#body === "string"
			? (new TextEncoder().encode(this.#body).buffer as ArrayBuffer)
			: (this.#body.slice(0) as ArrayBuffer);
	}

	/**
	 * 读取 Blob 响应体。
	 * Read the response body as Blob.
	 *
	 * @returns {Promise<Blob>}
	 */
	async blob(): Promise<Blob> {
		return new Blob([await this.arrayBuffer()]);
	}

	/**
	 * 克隆响应。
	 * Clone the response.
	 *
	 * @returns {CloudflareResponse}
	 */
	clone(): CloudflareResponse {
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

class AbstractPage<TItem> implements AsyncIterable<TItem> {
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
	}) {
		this._client = init.client;
		this._path = init.path;
		this._query = { ...init.query };
		this._options = init.options;
		this.result = init.result;
		this.result_info = init.result_info;
	}

	hasNextPage(): boolean {
		return Boolean(this.getNextQuery());
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<TItem> {
		let page: AbstractPage<TItem> = this;
		while (true) {
			for (const item of page.result) yield item;
			if (!page.hasNextPage()) break;
			page = await page.getNextPage();
		}
	}

	async getNextPage(): Promise<this> {
		const nextQuery = this.getNextQuery();
		if (!nextQuery) return this;
		return (await getAPIPage(this._client, this.constructor as PageClass<this>, this._path, nextQuery, this._options)) as this;
	}

	protected getNextQuery(): QueryLike | null {
		return null;
	}
}

type PageClass<TPage> = new (init: {
	client: Cloudflare;
	path: string;
	query: QueryLike;
	options?: RequestOptions;
	result: unknown[];
	result_info: CloudflareResultInfo;
}) => TPage;

/**
 * V4 分页数组结果。
 * V4 page array result.
 *
 * @template TItem 条目类型 / Item type.
 */
class V4PagePaginationArray<TItem> extends AbstractPage<TItem> {
	protected override getNextQuery(): QueryLike | null {
		const page = Number(this.result_info.page ?? this._query.page ?? 1);
		const totalPages = Number(this.result_info.total_pages ?? 0);
		if (!totalPages || page >= totalPages) return null;
		return { ...this._query, page: page + 1 };
	}
}

/**
 * Cursor 分页结果。
 * Cursor pagination result.
 *
 * @template TItem 条目类型 / Item type.
 */
class CursorPaginationAfter<TItem> extends AbstractPage<TItem> {
	protected override getNextQuery(): QueryLike | null {
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
class SinglePage<TItem> extends AbstractPage<TItem> {}

/**
 * 分页 Promise。
 * Pagination promise.
 *
 * @template TPage 分页类型 / Page type.
 * @template TItem 条目类型 / Item type.
 */
class PagePromise<TPage extends AbstractPage<TItem>, TItem = unknown>
	implements PromiseLike<TPage>, AsyncIterable<TItem>
{
	readonly #factory: () => Promise<TPage>;
	#promise?: Promise<TPage>;

	constructor(factory: () => Promise<TPage>) {
		this.#factory = factory;
	}

	then<TResult1 = TPage, TResult2 = never>(
		onfulfilled?: ((value: TPage) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): PromiseLike<TResult1 | TResult2> {
		return this.#getPromise().then(onfulfilled, onrejected);
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<TItem> {
		const page = await this.#getPromise();
		yield* page;
	}

	#getPromise(): Promise<TPage> {
		this.#promise ??= this.#factory();
		return this.#promise;
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

/**
 * Zone 分页结果。
 * Zone pagination result.
 */
class ZonesV4PagePaginationArray extends V4PagePaginationArray<Zone> {}

/**
 * DNS 记录分页结果。
 * DNS record pagination result.
 */
class RecordResponsesV4PagePaginationArray extends V4PagePaginationArray<RecordResponse> {}

/**
 * DNS 记录单页结果。
 * DNS record single page result.
 */
class RecordResponsesSinglePage extends SinglePage<RecordResponse> {}

/**
 * Namespace 分页结果。
 * Namespace pagination result.
 */
class NamespacesV4PagePaginationArray extends V4PagePaginationArray<Namespace> {}

/**
 * KV 键 Cursor 分页结果。
 * KV key cursor pagination result.
 */
class KeysCursorPaginationAfter extends CursorPaginationAfter<Key> {}

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
	 * @returns {PagePromise<ZonesV4PagePaginationArray, Zone>}
	 */
	list(
		queryOrOptions?: ZoneListParams | RequestOptions,
		options?: RequestOptions,
	): PagePromise<ZonesV4PagePaginationArray, Zone> {
		const { query, requestOptions } = normalizeOptionalQuery(queryOrOptions, options);
		return getAPIList<ZonesV4PagePaginationArray, Zone>(
			this._client,
			"/zones",
			ZonesV4PagePaginationArray,
			query,
			requestOptions,
		);
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
	 * @returns {PagePromise<RecordResponsesV4PagePaginationArray, RecordResponse>}
	 */
	list(
		params: RecordListParams,
		options?: RequestOptions,
	): PagePromise<RecordResponsesV4PagePaginationArray, RecordResponse> {
		const { zone_id, ...query } = params;
		return getAPIList<RecordResponsesV4PagePaginationArray, RecordResponse>(
			this._client,
			`/zones/${encodeURIComponent(zone_id)}/dns_records`,
			RecordResponsesV4PagePaginationArray,
			query,
			options,
		);
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
		return postResult<RecordImportResponse>(this._client, `/zones/${encodeURIComponent(zone_id)}/dns_records/import`, {
			...options,
			body: createRecordImportBody(file, proxied),
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
	 * @returns {PagePromise<RecordResponsesSinglePage, RecordResponse>}
	 */
	scanList(
		params: RecordScanListParams,
		options?: RequestOptions,
	): PagePromise<RecordResponsesSinglePage, RecordResponse> {
		return getAPIList<RecordResponsesSinglePage, RecordResponse>(
			this._client,
			`/zones/${encodeURIComponent(params.zone_id)}/dns_records/scan/review`,
			RecordResponsesSinglePage,
			{},
			options,
		);
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
	 * @returns {PagePromise<NamespacesV4PagePaginationArray, Namespace>}
	 */
	list(
		params: NamespaceListParams,
		options?: RequestOptions,
	): PagePromise<NamespacesV4PagePaginationArray, Namespace> {
		const { account_id, ...query } = params;
		return getAPIList<NamespacesV4PagePaginationArray, Namespace>(
			this._client,
			`/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces`,
			NamespacesV4PagePaginationArray,
			query,
			options,
			);
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
	 * @returns {PagePromise<KeysCursorPaginationAfter, Key>}
	 */
	list(
		namespaceId: string,
		params: KeyListParams,
		options?: RequestOptions,
	): PagePromise<KeysCursorPaginationAfter, Key> {
		const { account_id, ...query } = params;
		return getAPIList<KeysCursorPaginationAfter, Key>(
			this._client,
			`/accounts/${encodeURIComponent(account_id)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/keys`,
			KeysCursorPaginationAfter,
			query,
				options,
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
		const body = createKVValueBody(value, metadata);
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
				headers: {
					...options?.headers,
					...resolveKVValueHeaders(body),
				},
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
	 * @returns {Promise<CloudflareResponse>}
	 */
	get(
		namespaceId: string,
		keyName: string,
		params: ValueGetParams,
		options?: RequestOptions,
	): Promise<CloudflareResponse> {
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
 * const value = await response.text();
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
	readonly fetch?: FetchLike;
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
	static async trace(options?: RequestOptions): Promise<Record<string, string>> {
		return await Cloudflare.#trace("https://cloudflare.com/cdn-cgi/trace", options);
	}

	/**
	 * 追踪 IPv4 线路。
	 * Trace the IPv4 route.
	 *
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<Record<string, string>>}
	 */
	static async trace4(options?: RequestOptions): Promise<Record<string, string>> {
		return await Cloudflare.#trace("https://162.159.36.1/cdn-cgi/trace", options);
	}

	/**
	 * 追踪 IPv6 线路。
	 * Trace the IPv6 route.
	 *
	 * @param {RequestOptions} [options] 请求选项 / Request options.
	 * @returns {Promise<Record<string, string>>}
	 */
	static async trace6(options?: RequestOptions): Promise<Record<string, string>> {
		return await Cloudflare.#trace("https://[2606:4700:4700::1111]/cdn-cgi/trace", options);
	}

	static async #trace(url: string, options?: RequestOptions): Promise<Record<string, string>> {
		const rawResponse = await (options?.fetch ?? utilFetch)(url, {
			method: "GET",
			timeout: options?.timeout ?? DEFAULT_TIMEOUT,
			headers: options?.headers,
		});
		const response = await normalizeResponse(rawResponse, url);
		const body = await response.text();
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

function getAPIList<TPage extends AbstractPage<TItem>, TItem>(
	client: Cloudflare,
	path: string,
	pageClass: PageClass<TPage>,
	query: QueryLike = {},
	options?: RequestOptions,
): PagePromise<TPage, TItem> {
	return new PagePromise<TPage, TItem>(async () => await getAPIPage(client, pageClass, path, query, options));
}

async function getAPIPage<TPage extends AbstractPage<unknown>>(
	client: Cloudflare,
	pageClass: PageClass<TPage>,
	path: string,
	query: QueryLike = {},
	options?: RequestOptions,
): Promise<TPage> {
	const envelope = await requestClient<CloudflareEnvelope<unknown[]>>(client, "GET", path, {
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

async function getResult<Result>(client: Cloudflare, path: string, options?: RequestOptions): Promise<Result> {
	return await requestClient<Result>(client, "GET", path, options);
}

async function postResult<Result>(
	client: Cloudflare,
	path: string,
	options?: RequestOptions & {
		body?: unknown;
	},
): Promise<Result> {
	return await requestClient<Result>(client, "POST", path, options);
}

async function putResult<Result>(
	client: Cloudflare,
	path: string,
	options?: RequestOptions & {
		body?: unknown;
	},
): Promise<Result> {
	return await requestClient<Result>(client, "PUT", path, options);
}

async function patchResult<Result>(
	client: Cloudflare,
	path: string,
	options?: RequestOptions & {
		body?: unknown;
	},
): Promise<Result> {
	return await requestClient<Result>(client, "PATCH", path, options);
}

async function deleteResult<Result>(client: Cloudflare, path: string, options?: RequestOptions): Promise<Result> {
	return await requestClient<Result>(client, "DELETE", path, options);
}

async function getBinaryResponse(client: Cloudflare, path: string, options?: RequestOptions): Promise<CloudflareResponse> {
	return await requestClient<CloudflareResponse>(client, "GET", path, {
		...options,
		responseType: "binary",
	});
}

async function requestClient<Result>(
	client: Cloudflare,
	method: string,
	path: string,
	options: (RequestOptions & {
		body?: unknown;
		responseType?: "json" | "binary";
		unwrapResult?: boolean;
	}) = {},
): Promise<Result> {
	const response = await fetchResponse(client, method, path, options);
	if (!response.ok) throw await createError(response);
	switch (options.responseType) {
		case "binary":
			return response as Result;
		default: {
			const rawBody = await response.text();
			const body = rawBody ? safeParseJSON(rawBody) : null;
			if (isEnvelope(body)) {
				if (body.success === false) throw await createError(response, body);
				return (options.unwrapResult === false ? body : (body.result ?? null)) as Result;
			}
			return body as Result;
		}
	}
}

async function fetchResponse(
	client: Cloudflare,
	method: string,
	path: string,
	options: RequestOptions & {
		body?: unknown;
	},
): Promise<CloudflareResponse> {
	const url = createURL(client, path, options.query);
	const headers = {
		...client.defaultHeaders,
		...createAuthHeaders(client),
		...options.headers,
	};
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
				body: body as FetchRequest["body"],
				timeout,
			});
			const response = await normalizeResponse(rawResponse, url.toString());
			if (attempt < maxRetries && shouldRetry(response.status)) {
				await delay(backoffDelay(attempt));
				attempt += 1;
				continue;
			}
			return response;
		} catch (error) {
			if (attempt >= maxRetries) throw error;
			await delay(backoffDelay(attempt));
			attempt += 1;
		}
	}
}

function createURL(client: Cloudflare, path: string, query: QueryLike = {}): URL {
	const url = new URL(`${client.baseURL}${path}`);
	for (const [key, value] of Object.entries({ ...client.defaultQuery, ...query })) {
		if (value === undefined) {
			url.searchParams.delete(key);
			continue;
		}
		if (value === null) continue;
		switch (true) {
			case Array.isArray(value):
				url.searchParams.delete(key);
				for (const item of value) {
					if (item === undefined || item === null) continue;
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

function createAuthHeaders(client: Cloudflare): HeadersLike {
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

async function createError(response: CloudflareResponse, body?: unknown): Promise<CloudflareAPIError> {
	const payload = body ?? safeParseJSON(await response.text());
	const envelope = isEnvelope(payload) ? payload : null;
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

function readEnv(name: string): string | null {
	const runtime = globalThis as typeof globalThis & {
		process?: {
			env?: Record<string, string | undefined>;
		};
	};
	return runtime.process?.env?.[name] ?? null;
}

function normalizeOptionalQuery<Query extends object>(
	queryOrOptions?: Query | RequestOptions,
	options?: RequestOptions,
): {
	query: QueryLike;
	requestOptions: RequestOptions | undefined;
} {
	switch (true) {
		case isRequestOptions(queryOrOptions):
			return {
				query: {},
				requestOptions: queryOrOptions,
			};
		default:
			return {
				query: { ...((queryOrOptions as Query | undefined) ?? {}) } as QueryLike,
				requestOptions: options,
			};
	}
}

function isRequestOptions(value: unknown): value is RequestOptions {
	return typeof value === "object" && value !== null && ["headers", "query", "timeout", "maxRetries", "fetch"].some(key => key in value);
}

function isEnvelope(value: unknown): value is CloudflareEnvelope {
	return typeof value === "object" && value !== null && ("success" in value || "result" in value || "errors" in value);
}

function normalizeHeadersInit(headers?: HeadersInit | HeadersLike): HeadersInit | undefined {
	if (!headers) return undefined;
	if (headers instanceof Headers) return headers;
	if (Array.isArray(headers)) return headers;
	if (typeof (headers as { forEach?: unknown }).forEach === "function") {
		const iterableHeaders = headers as unknown as {
			forEach(callback: (value: string, key: string) => void): void;
		};
		const normalized: Array<[string, string]> = [];
		iterableHeaders.forEach((value, key) => normalized.push([key, value]));
		return normalized;
	}
	return Object.entries(headers).flatMap(([key, value]) => {
		if (value === undefined || value === null) return [];
		return [[key, String(value)]];
	});
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeBody(body: unknown, headers: HeadersLike): unknown {
	if (body === undefined || body === null) return undefined;
	if (typeof FormData !== "undefined" && body instanceof FormData) {
		deleteHeader(headers, "Content-Type");
		return body;
	}
	if (body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof body === "string") return body;
	if (isPlainObject(body)) {
		if (!hasHeader(headers, "Content-Type")) headers["Content-Type"] = "application/json";
		return JSON.stringify(body);
	}
	return body;
}

function hasHeader(headers: HeadersLike, keyName: string): boolean {
	const headerName = keyName.toLowerCase();
	return Object.keys(headers).some(key => key.toLowerCase() === headerName);
}

function deleteHeader(headers: HeadersLike, keyName: string): void {
	const headerName = keyName.toLowerCase();
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === headerName) delete headers[key];
	}
}

function createKVValueBody(value: string, metadata: unknown): string | FormData {
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

function createRecordImportBody(file: string | Blob, proxied?: string): FormData {
	const formData = new FormData();
	formData.append("file", file);
	if (proxied !== undefined) formData.append("proxied", proxied);
	return formData;
}

function resolveKVValueHeaders(body: string | FormData): HeadersLike {
	return body instanceof FormData
		? {}
		: {
				"Content-Type": "text/plain;charset=UTF-8",
		  };
}

async function normalizeResponse(rawResponse: FetchResponse | Response | CloudflareResponse, url = ""): Promise<CloudflareResponse> {
	if (rawResponse instanceof CloudflareResponse) return rawResponse;
	if (typeof (rawResponse as Response).arrayBuffer === "function") {
		const response = rawResponse as Response;
		return new CloudflareResponse(await response.clone().arrayBuffer(), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
			url: response.url || url,
		});
	}
	const response = rawResponse as FetchResponse;
	const body = response.bodyBytes ?? response.body ?? "";
	return new CloudflareResponse(typeof body === "string" ? body : (body as ArrayBuffer), {
		status: response.status ?? response.statusCode ?? 0,
		statusText: response.statusText ?? "",
		headers: response.headers as HeadersLike | undefined,
		url,
	});
}

function safeParseJSON(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch (error) {
		return value;
	}
}

function shouldRetry(status: number): boolean {
	return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

function backoffDelay(attempt: number): number {
	return 200 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}
