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
