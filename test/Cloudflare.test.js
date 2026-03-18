import assert from "node:assert";
import { describe, it } from "node:test";

import Cloudflare from "../Cloudflare.mjs";

const jsonResponse = body =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});

describe("Cloudflare smoke", () => {
	it("supports dns.records create/get/list/update", async () => {
		const calls = [];
		const client = new Cloudflare({
			apiToken: "token",
			fetch: async (url, options = {}) => {
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
		});

		const created = await client.dns.records.create({
			zone_id: "zone-id",
			type: "A",
			name: "www",
			content: "1.1.1.1",
		});
		assert.strictEqual(created.id, "record-1");

		const record = await client.dns.records.get("record-1", { zone_id: "zone-id" });
		assert.strictEqual(record.id, "record-1");

		const page = await client.dns.records.list({ zone_id: "zone-id" });
		assert.strictEqual(page.result.length, 1);
		assert.strictEqual(page.result[0].id, "record-1");
		assert.strictEqual(page.hasNextPage(), false);

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
	});

	it("supports dns.records delete/batch/edit/export/import/scan endpoints", async () => {
		const calls = [];
		const client = new Cloudflare({
			apiToken: "token",
			fetch: async (url, options = {}) => {
				const method = options.method ?? "GET";
				const parsed = new URL(String(url));
				calls.push({ method, url: parsed.toString(), options });

				if (method === "DELETE" && parsed.pathname.endsWith("/zones/zone-id/dns_records/record-1")) {
					return jsonResponse({ success: true, result: { id: "record-1" } });
				}
				if (method === "POST" && parsed.pathname.endsWith("/zones/zone-id/dns_records/batch")) {
					return jsonResponse({
						success: true,
						result: {
							deletes: [{ id: "record-1" }],
							patches: [],
							posts: [],
							puts: [],
						},
					});
				}
				if (method === "PATCH" && parsed.pathname.endsWith("/zones/zone-id/dns_records/record-1")) {
					return jsonResponse({ success: true, result: { id: "record-1", type: "A", name: "www" } });
				}
				if (method === "GET" && parsed.pathname.endsWith("/zones/zone-id/dns_records/export")) {
					return new Response("example.com. 300 IN A 1.1.1.1", { status: 200 });
				}
				if (method === "POST" && parsed.pathname.endsWith("/zones/zone-id/dns_records/import")) {
					return jsonResponse({ success: true, result: { recs_added: 1, total_records_parsed: 1 } });
				}
				if (method === "POST" && parsed.pathname.endsWith("/zones/zone-id/dns_records/scan")) {
					return jsonResponse({ success: true, result: { recs_added: 1, total_records_parsed: 1 } });
				}
				if (method === "GET" && parsed.pathname.endsWith("/zones/zone-id/dns_records/scan/review")) {
					return jsonResponse({
						success: true,
						result: [{ id: "record-1", type: "A", name: "www" }],
						result_info: {},
					});
				}
				if (method === "POST" && parsed.pathname.endsWith("/zones/zone-id/dns_records/scan/review")) {
					return jsonResponse({
						success: true,
						result: { accepts: [{ id: "record-1", type: "A", name: "www" }], rejects: ["record-2"] },
					});
				}
				if (method === "POST" && parsed.pathname.endsWith("/zones/zone-id/dns_records/scan/trigger")) {
					return jsonResponse({ success: true, result: { success: true, errors: [], messages: [] } });
				}
				throw new Error(`unexpected request: ${method} ${parsed.toString()}`);
			},
		});

		const deleted = await client.dns.records.delete("record-1", { zone_id: "zone-id" });
		assert.strictEqual(deleted.id, "record-1");

		const batched = await client.dns.records.batch({
			zone_id: "zone-id",
			deletes: [{ id: "record-1" }],
		});
		assert.strictEqual(batched.deletes[0].id, "record-1");

		const edited = await client.dns.records.edit("record-1", {
			zone_id: "zone-id",
			name: "www",
			type: "A",
		});
		assert.strictEqual(edited.id, "record-1");

		const exported = await client.dns.records.export({ zone_id: "zone-id" });
		assert.match(exported, /example\.com/);

		const imported = await client.dns.records.import({
			zone_id: "zone-id",
			file: "example.com. 300 IN A 1.1.1.1",
			proxied: "true",
		});
		assert.strictEqual(imported.recs_added, 1);
		assert.strictEqual(calls[4].options.body instanceof FormData, true);

		const scanned = await client.dns.records.scan({
			zone_id: "zone-id",
			body: { force: true },
		});
		assert.strictEqual(scanned.total_records_parsed, 1);

		const scannedPage = await client.dns.records.scanList({ zone_id: "zone-id" });
		assert.strictEqual(scannedPage.result.length, 1);
		assert.strictEqual(scannedPage.hasNextPage(), false);

		const reviewed = await client.dns.records.scanReview({
			zone_id: "zone-id",
			accepts: [{ type: "A", name: "www" }],
			rejects: [{ id: "record-2" }],
		});
		assert.strictEqual(reviewed.rejects[0], "record-2");

		const triggered = await client.dns.records.scanTrigger({ zone_id: "zone-id" });
		assert.strictEqual(triggered.success, true);

		assert.deepStrictEqual(
			calls.map(call => call.method),
			["DELETE", "POST", "PATCH", "GET", "POST", "POST", "GET", "POST", "POST"],
		);
	});

	it("supports kv.namespaces/keys/metadata endpoints", async () => {
		const calls = [];
		const client = new Cloudflare({
			apiToken: "token",
			fetch: async (url, options = {}) => {
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
		});

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

		const namespacesPage = await client.kv.namespaces.list({
			account_id: "account-id",
		});
		assert.strictEqual(namespacesPage.result[0].id, "namespace-id");

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

		const keysPage = await client.kv.namespaces.keys.list("namespace-id", {
			account_id: "account-id",
		});
		assert.strictEqual(keysPage.result[0].name, "key-1");

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
	});

	it("supports kv.namespaces.values get/update/delete", async () => {
		const calls = [];
		const client = new Cloudflare({
			apiToken: "token",
			fetch: async (url, options = {}) => {
				const method = options.method ?? "GET";
				const parsed = new URL(String(url));
				calls.push({ method, url: parsed.toString(), options });

				if (method === "PUT" && parsed.pathname.endsWith("/values/key-1")) {
					return jsonResponse({ success: true, result: null });
				}
				if (method === "GET" && parsed.pathname.endsWith("/values/key-1")) {
					return new Response("value-1", { status: 200 });
				}
				if (method === "DELETE" && parsed.pathname.endsWith("/values/key-1")) {
					return jsonResponse({ success: true, result: null });
				}
				throw new Error(`unexpected request: ${method} ${parsed.toString()}`);
			},
		});

		await client.kv.namespaces.values.update("namespace-id", "key-1", {
			account_id: "account-id",
			value: "value-1",
		});

		const response = await client.kv.namespaces.values.get("namespace-id", "key-1", {
			account_id: "account-id",
		});
		assert.strictEqual(await response.text(), "value-1");

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
	});
});
