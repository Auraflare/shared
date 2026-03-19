import assert from "node:assert";
import { describe, it } from "node:test";

import Cloudflare from "../Cloudflare.mjs";
import { KV } from "../KV.mjs";

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

describe("KV", () => {
	it("uses namespace binding for read/write/list", async () => {
		const store = new Map();
		const calls = [];
		const namespace = {
			async get(key) {
				calls.push(["get", key]);
				return store.get(key) ?? null;
			},
			async put(key, value) {
				calls.push(["put", key, value]);
				store.set(key, value);
			},
			async delete(key) {
				calls.push(["delete", key]);
				store.delete(key);
			},
			async list(options) {
				calls.push(["list", options]);
				return {
					keys: [{ name: "plain" }],
					list_complete: true,
					cursor: "",
				};
			},
		};

		const kv = new KV(namespace);
		assert.strictEqual(await kv.setItem("plain", "value"), true);
		assert.strictEqual(await kv.getItem("plain"), "value");
		assert.strictEqual(await kv.removeItem("plain"), true);
		assert.strictEqual(await kv.getItem("plain", null), null);
		assert.deepStrictEqual(await kv.list({ prefix: "pl", limit: 10 }), {
			keys: [{ name: "plain" }],
			list_complete: true,
			cursor: "",
		});
		assert.strictEqual(await kv.clear(), false);
		assert.deepStrictEqual(calls.at(-1), ["list", { prefix: "pl", limit: 10 }]);
	});

	it("uses Cloudflare REST backend when client/account/namespace are provided", async () => {
		const calls = [];
		await withMockFetch(
			async (url, options = {}) => {
				const method = options.method ?? "GET";
				const parsed = new URL(String(url));
				calls.push({ method, url: parsed.toString() });

				if (method === "PUT" && parsed.pathname.endsWith("/values/plain")) {
					return jsonResponse({ success: true, result: null });
				}
				if (method === "GET" && parsed.pathname.endsWith("/values/plain")) {
					return textResponse("value");
				}
				if (method === "DELETE" && parsed.pathname.endsWith("/values/plain")) {
					return jsonResponse({ success: true, result: null });
				}
				if (method === "GET" && parsed.pathname.endsWith("/keys")) {
					return jsonResponse({
						success: true,
						result: [{ name: "plain" }],
						result_info: {},
					});
				}
				throw new Error(`unexpected request: ${method} ${parsed.toString()}`);
			},
			async () => {
				const client = new Cloudflare({ apiToken: "token", timeout: 1 });
				const kv = new KV({
					client,
					account_id: "account-id",
					namespace_id: "namespace-id",
				});

				assert.strictEqual(await kv.setItem("plain", "value"), true);
				assert.strictEqual(await kv.getItem("plain"), "value");
				assert.strictEqual(await kv.removeItem("plain"), true);
				assert.deepStrictEqual(await kv.list({ prefix: "pl", limit: 5, cursor: "next" }), {
					keys: [{ name: "plain" }],
					list_complete: true,
					cursor: "",
				});

				assert.strictEqual(calls[0].method, "PUT");
				assert.strictEqual(
					calls[0].url,
					"https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/values/plain",
				);
				assert.strictEqual(calls[1].method, "GET");
				assert.strictEqual(calls[2].method, "DELETE");
				assert.strictEqual(
					calls[3].url,
					"https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/keys?prefix=pl&limit=5&cursor=next",
				);
			},
		);
	});

	it("throws on list when no namespace and no Cloudflare backend", async () => {
		const kv = new KV();
		await assert.rejects(() => kv.list(), /namespace binding or a Cloudflare KV backend/);
	});
});
