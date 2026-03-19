import assert from "node:assert";
import { describe, it } from "node:test";

import Cloudflare from "../Cloudflare.mjs";

const textResponse = (body, init = {}) =>
	new Response(body, {
		status: init.status ?? 200,
		statusText: init.statusText ?? "",
		headers: init.headers,
	});

const jsonResponse = body =>
	textResponse(JSON.stringify(body), {
		headers: {
			"content-type": "application/json",
		},
	});

const withMockFetch = async (handler, run) => {
	const originalFetch = globalThis.fetch;
	const mockFetch = async (url, options = {}) => await handler(url, options);
	mockFetch.cookieJar = true;
	globalThis.fetch = mockFetch;
	try {
		return await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
};

describe("Cloudflare smoke", () => {
	it("supports dns.records create/get/list/update", async () => {
		const calls = [];
		await withMockFetch(
			async (url, options = {}) => {
				const method = options.method ?? "GET";
				const parsed = new URL(String(url));
				calls.push({ method, url: parsed.toString() });

				if (method === "POST" && parsed.pathname.endsWith("/zones/zone-id/dns_records")) {
					return jsonResponse({ success: true, result: { id: "record-1", type: "A", name: "www" } });
				}
				if (method === "GET" && parsed.pathname.endsWith("/zones/zone-id/dns_records/record-1")) {
					return jsonResponse({ success: true, result: { id: "record-1", type: "A", name: "www" } });
				}
				if (method === "GET" && parsed.pathname.endsWith("/zones/zone-id/dns_records")) {
					return jsonResponse({
						success: true,
						result: [{ id: "record-1", type: "A", name: "www" }],
						result_info: { page: 1, total_pages: 1 },
					});
				}
				if (method === "PUT" && parsed.pathname.endsWith("/zones/zone-id/dns_records/record-1")) {
					return jsonResponse({ success: true, result: { id: "record-1", type: "A", name: "www" } });
				}
				throw new Error(`unexpected request: ${method} ${parsed.toString()}`);
			},
			async () => {
				const client = new Cloudflare({ apiToken: "token", timeout: 1 });

				const created = await client.dns.records.create({
					zone_id: "zone-id",
					type: "A",
					name: "www",
					content: "1.1.1.1",
				});
				assert.strictEqual(created.id, "record-1");

				const record = await client.dns.records.get("record-1", { zone_id: "zone-id" });
				assert.strictEqual(record.id, "record-1");

				const records = await client.dns.records.list({ zone_id: "zone-id" });
				assert.strictEqual(records.length, 1);
				assert.strictEqual(records[0].id, "record-1");

				const updated = await client.dns.records.update(
					"record-1",
					{
						zone_id: "zone-id",
						type: "A",
						name: "www",
						content: "2.2.2.2",
					},
				);
				assert.strictEqual(updated.id, "record-1");

				assert.strictEqual(calls[0].method, "POST");
				assert.strictEqual(calls[1].method, "GET");
				assert.strictEqual(calls[2].method, "GET");
				assert.strictEqual(calls[3].method, "PUT");
			},
		);
	});

	it("supports dns.records delete/edit endpoints", async () => {
		const calls = [];
		await withMockFetch(
			async (url, options = {}) => {
				const method = options.method ?? "GET";
				const parsed = new URL(String(url));
				calls.push({ method, url: parsed.toString(), options });

				if (method === "DELETE" && parsed.pathname.endsWith("/zones/zone-id/dns_records/record-1")) {
					return jsonResponse({ success: true, result: { id: "record-1" } });
				}
				if (method === "PATCH" && parsed.pathname.endsWith("/zones/zone-id/dns_records/record-1")) {
					return jsonResponse({ success: true, result: { id: "record-1", type: "A", name: "www" } });
				}
				throw new Error(`unexpected request: ${method} ${parsed.toString()}`);
			},
			async () => {
				const client = new Cloudflare({ apiToken: "token", timeout: 1 });

				const deleted = await client.dns.records.delete("record-1", { zone_id: "zone-id" });
				assert.strictEqual(deleted.id, "record-1");

				const edited = await client.dns.records.edit("record-1", {
					zone_id: "zone-id",
					name: "www",
					type: "A",
				});
				assert.strictEqual(edited.id, "record-1");

				assert.deepStrictEqual(
					calls.map(call => call.method),
					["DELETE", "PATCH"],
				);
			},
		);
	});

	it("supports kv.namespaces/keys/metadata endpoints", async () => {
		const calls = [];
		await withMockFetch(
			async (url, options = {}) => {
				const method = options.method ?? "GET";
				const parsed = new URL(String(url));
				calls.push({ method, url: parsed.toString(), options });

				if (method === "POST" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces")) {
					return jsonResponse({ success: true, result: { id: "namespace-id", title: "title" } });
				}
				if (method === "PUT" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id")) {
					return jsonResponse({ success: true, result: { id: "namespace-id", title: "title-2" } });
				}
				if (method === "GET" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id")) {
					return jsonResponse({ success: true, result: { id: "namespace-id", title: "title-2" } });
				}
				if (method === "DELETE" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id")) {
					return jsonResponse({ success: true, result: {} });
				}
				if (method === "GET" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces")) {
					return jsonResponse({
						success: true,
						result: [{ id: "namespace-id", title: "title-2" }],
						result_info: { page: 1, total_pages: 1 },
					});
				}
				if (method === "GET" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id/keys")) {
					return jsonResponse({
						success: true,
						result: [{ name: "key-1" }],
						result_info: {},
					});
				}
				if (method === "GET" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id/metadata/key-1")) {
					return jsonResponse({ success: true, result: { source: "test" } });
				}
				if (method === "POST" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id/bulk/delete")) {
					return jsonResponse({ success: true, result: { successful_key_count: 1 } });
				}
				if (method === "POST" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id/bulk/get")) {
					return jsonResponse({ success: true, result: { values: { "key-1": "value-1" } } });
				}
				if (method === "PUT" && parsed.pathname.endsWith("/accounts/account-id/storage/kv/namespaces/namespace-id/bulk")) {
					return jsonResponse({ success: true, result: { successful_key_count: 1 } });
				}
				throw new Error(`unexpected request: ${method} ${parsed.toString()}`);
			},
			async () => {
				const client = new Cloudflare({ apiToken: "token", timeout: 1 });

				const created = await client.kv.namespaces.create({
					account_id: "account-id",
					title: "title",
				});
				assert.strictEqual(created.id, "namespace-id");

				const updated = await client.kv.namespaces.update("namespace-id", {
					account_id: "account-id",
					title: "title-2",
				});
				assert.strictEqual(updated.title, "title-2");

				const namespaces = await client.kv.namespaces.list({
					account_id: "account-id",
				});
				assert.strictEqual(namespaces[0].id, "namespace-id");

				const namespace = await client.kv.namespaces.get("namespace-id", {
					account_id: "account-id",
				});
				assert.strictEqual(namespace.id, "namespace-id");

				const namespaceBulkDelete = await client.kv.namespaces.bulkDelete("namespace-id", {
					account_id: "account-id",
					body: ["key-1"],
				});
				assert.strictEqual(namespaceBulkDelete.successful_key_count, 1);

				const namespaceBulkGet = await client.kv.namespaces.bulkGet("namespace-id", {
					account_id: "account-id",
					keys: ["key-1"],
				});
				assert.strictEqual(namespaceBulkGet.values["key-1"], "value-1");

				const namespaceBulkUpdate = await client.kv.namespaces.bulkUpdate("namespace-id", {
					account_id: "account-id",
					body: [{ key: "key-1", value: "value-1" }],
				});
				assert.strictEqual(namespaceBulkUpdate.successful_key_count, 1);

				const keys = await client.kv.namespaces.keys.list("namespace-id", {
					account_id: "account-id",
				});
				assert.strictEqual(keys[0].name, "key-1");

				const keyBulkDelete = await client.kv.namespaces.keys.bulkDelete("namespace-id", {
					account_id: "account-id",
					body: ["key-1"],
				});
				assert.strictEqual(keyBulkDelete.successful_key_count, 1);

				const keyBulkGet = await client.kv.namespaces.keys.bulkGet("namespace-id", {
					account_id: "account-id",
					keys: ["key-1"],
				});
				assert.strictEqual(keyBulkGet.values["key-1"], "value-1");

				const keyBulkUpdate = await client.kv.namespaces.keys.bulkUpdate("namespace-id", {
					account_id: "account-id",
					body: [{ key: "key-1", value: "value-1" }],
				});
				assert.strictEqual(keyBulkUpdate.successful_key_count, 1);

				const metadata = await client.kv.namespaces.metadata.get("namespace-id", "key-1", {
					account_id: "account-id",
				});
				assert.strictEqual(metadata.source, "test");

				await client.kv.namespaces.delete("namespace-id", {
					account_id: "account-id",
				});

				assert.strictEqual(calls[0].method, "POST");
				assert.strictEqual(calls.at(-1).method, "DELETE");
			},
		);
	});

	it("supports kv.namespaces.values get/update/delete", async () => {
		const calls = [];
		await withMockFetch(
			async (url, options = {}) => {
				const method = options.method ?? "GET";
				const parsed = new URL(String(url));
				calls.push({ method, url: parsed.toString(), options });

				if (method === "PUT" && parsed.pathname.endsWith("/values/key-1")) {
					return jsonResponse({ success: true, result: null });
				}
				if (method === "GET" && parsed.pathname.endsWith("/values/key-1")) {
					return textResponse("value-1");
				}
				if (method === "DELETE" && parsed.pathname.endsWith("/values/key-1")) {
					return jsonResponse({ success: true, result: null });
				}
				throw new Error(`unexpected request: ${method} ${parsed.toString()}`);
			},
			async () => {
				const client = new Cloudflare({ apiToken: "token", timeout: 1 });

				await client.kv.namespaces.values.update("namespace-id", "key-1", {
					account_id: "account-id",
					value: "value-1",
				});

				const response = await client.kv.namespaces.values.get("namespace-id", "key-1", {
					account_id: "account-id",
				});
				assert.strictEqual(typeof response.body === "string" ? response.body : "", "value-1");

				await client.kv.namespaces.values.delete("namespace-id", "key-1", {
					account_id: "account-id",
				});

				assert.strictEqual(calls[0].method, "PUT");
				assert.strictEqual(calls[1].method, "GET");
				assert.strictEqual(calls[2].method, "DELETE");
				assert.strictEqual(
					calls[0].url,
					"https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/values/key-1",
				);
				assert.strictEqual(calls[0].options.headers["Content-Type"], "text/plain;charset=UTF-8");
			},
		);
	});
});
