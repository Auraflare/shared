import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Storage } from "@nsnanocat/util";

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

const withMockStorage = async run => {
	const originalGetItem = Storage.getItem;
	const originalSetItem = Storage.setItem;
	const originalRemoveItem = Storage.removeItem;
	const store = new Map();
	Storage.getItem = (keyName, defaultValue = null) => store.has(keyName) ? store.get(keyName) : defaultValue;
	Storage.setItem = (keyName, value) => {
		store.set(keyName, value);
		return true;
	};
	Storage.removeItem = keyName => store.delete(keyName);
	try {
		return await run(store);
	} finally {
		Storage.getItem = originalGetItem;
		Storage.setItem = originalSetItem;
		Storage.removeItem = originalRemoveItem;
	}
};

const serialize = value => {
	switch (typeof value) {
		case "object":
			return JSON.stringify(value);
		default:
			return String(value);
	}
};

const createNamespace = (initialEntries = [], { failPutKeys = [], failGetKeys = [], failDeleteKeys = [] } = {}) => {
	const store = new Map(initialEntries.map(([key, value]) => [key, serialize(value)]));
	const calls = [];
	const failPutKeySet = new Set(failPutKeys);
	const failGetKeySet = new Set(failGetKeys);
	const failDeleteKeySet = new Set(failDeleteKeys);
	const namespace = {
		async get(key) {
			calls.push(["get", key]);
			if (failGetKeySet.has(key)) {
				throw new Error(`mock get failed for key: ${key}`);
			}
			return store.get(key) ?? null;
		},
		async put(key, value) {
			calls.push(["put", key, value]);
			if (failPutKeySet.has(key)) {
				throw new Error(`mock put failed for key: ${key}`);
			}
			store.set(key, value);
		},
		async delete(key) {
			calls.push(["delete", key]);
			if (failDeleteKeySet.has(key)) {
				throw new Error(`mock delete failed for key: ${key}`);
			}
			store.delete(key);
		},
	};
	return {
		namespace,
		store,
		calls,
	};
};

describe("KV", () => {
	beforeEach(() => {
		KV.namespaces.clear();
	});

	afterEach(() => {
		KV.namespaces.clear();
	});

	it("uses namespace binding for read/write", async () => {
		const { namespace, calls } = createNamespace();
		const kv = new KV({
			namespaces: {
				"": namespace,
			},
		});

		assert.strictEqual(await kv.setItem("plain", "value"), true);
		assert.strictEqual(await kv.getItem("plain"), "value");
		assert.strictEqual(await kv.removeItem("plain"), true);
		assert.strictEqual(await kv.getItem("plain", null), null);
		assert.strictEqual(await kv.clear(), false);
		assert.deepStrictEqual(calls, [
			["put", "plain", "value"],
			["get", "plain"],
			["delete", "plain"],
			["get", "plain"],
		]);
	});

	it("uses the empty-prefix default namespace while preserving explicit prefixes and @path", async () => {
		const fallback = createNamespace();
		const explicit = createNamespace();
		KV.namespaces.set("@iRingo.Maps.Caches", explicit.namespace);
		const kv = new KV({
			namespaces: {
				"": fallback.namespace,
			},
		});

		assert.strictEqual(await kv.setItem("plain", "value"), true);
		assert.strictEqual(fallback.store.get("plain"), "value");

		assert.strictEqual(await kv.setItem("@iRingo.Maps.Caches.a", 1), true);
		assert.strictEqual(explicit.store.get("a"), "1");
		assert.strictEqual(fallback.store.has("@iRingo.Maps.Caches.a"), false);

		assert.strictEqual(await kv.setItem("@settings.theme", "dark"), true);
		assert.strictEqual(fallback.store.get("settings"), JSON.stringify({ theme: "dark" }));
		assert.strictEqual(await kv.getItem("@settings.theme"), "dark");
	});

	it("supports init.namespaces and merges them over static namespaces", async () => {
		const staticNamespace = createNamespace();
		const initNamespace = createNamespace();
		const fallback = createNamespace();
		KV.namespaces.set("@iRingo.Maps.Caches", staticNamespace.namespace);
		const kv = new KV({
			namespaces: {
				"": fallback.namespace,
				"@iRingo.Maps.Caches": initNamespace.namespace,
			},
		});

		assert.strictEqual(await kv.setItem("@iRingo.Maps.Caches.a", 2), true);
		assert.strictEqual(initNamespace.store.get("a"), "2");
		assert.strictEqual(staticNamespace.store.has("a"), false);

		assert.strictEqual(await kv.setItem("plain", "value"), true);
		assert.strictEqual(fallback.store.get("plain"), "value");
	});

	it("rejects removed namespace-only constructor inputs", async () => {
		const { namespace } = createNamespace();

		assert.throws(
			() => new KV(namespace),
			/new KV\(namespace\) was removed/,
		);
		assert.throws(
			() => new KV({ namespace }),
			/KVInitOptions\.namespace was removed/,
		);
		assert.throws(
			() => new KV({ env: { namespace } }),
			/KVInitOptions\.env\.namespace was removed/,
		);
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

				assert.strictEqual(calls[0].method, "PUT");
				assert.strictEqual(
					calls[0].url,
					"https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/values/plain",
				);
				assert.strictEqual(calls[1].method, "GET");
				assert.strictEqual(calls[2].method, "DELETE");
			},
		);
	});

	it("routes child keys to namespace root and keeps exact writes available", async () => {
		const { namespace, store } = createNamespace([["legacy", "keep"]]);
		KV.namespaces.set("@iRingo.Maps.Caches", namespace);
		const kv = new KV();

		assert.strictEqual(await kv.setItem("@iRingo.Maps.Caches.a", "value"), true);
		assert.strictEqual(await kv.getItem("@iRingo.Maps.Caches.a"), "value");
		assert.strictEqual(await kv.setItem("@iRingo.Maps.Caches", { b: true, nested: { ok: 1 } }), true);
		assert.strictEqual(store.get("legacy"), "keep");
		assert.strictEqual(store.get("a"), "value");
		assert.strictEqual(store.get("b"), "true");
		assert.strictEqual(store.get("nested"), JSON.stringify({ ok: 1 }));
		await assert.rejects(
			() => kv.getItem("@iRingo.Maps.Caches"),
			/no longer supports exact registered prefixes.*list\(\) removal/,
		);

		assert.strictEqual(await kv.removeItem("@iRingo.Maps.Caches.a"), true);
		assert.strictEqual(store.has("a"), false);
	});

	it("allows partial success for exact prefix setItem writes", async () => {
		const { namespace, store } = createNamespace([], { failPutKeys: ["broken"] });
		KV.namespaces.set("@iRingo.Maps.Caches", namespace);
		const kv = new KV();

		const result = await kv.setItem("@iRingo.Maps.Caches", {
			good: true,
			broken: "boom",
			another: 1,
		});

		assert.strictEqual(result, false);
		assert.strictEqual(store.get("good"), "true");
		assert.strictEqual(store.get("another"), "1");
		assert.strictEqual(store.has("broken"), false);
	});

	it("rejects exact prefix aggregate reads after list removal", async () => {
		const { namespace } = createNamespace([
			["ok", 1],
			["broken", 2],
		]);
		KV.namespaces.set("@iRingo.Maps.Caches", namespace);
		const kv = new KV();

		await assert.rejects(
			() => kv.getItem("@iRingo.Maps.Caches"),
			/no longer supports exact registered prefixes.*list\(\) removal/,
		);
	});

	it("rejects exact prefix bulk removeItem and clear after list removal", async () => {
		const { namespace, store } = createNamespace([
			["ok", 1],
			["broken", 2],
		]);
		KV.namespaces.set("@iRingo.Maps.Caches", namespace);
		const kv = new KV();

		await assert.rejects(
			() => kv.removeItem("@iRingo.Maps.Caches"),
			/no longer supports exact registered prefixes.*list\(\) removal/,
		);
		await assert.rejects(
			() => kv.clear("@iRingo.Maps.Caches"),
			/no longer supports keyName arguments after list\(\) removal/,
		);
		assert.deepStrictEqual(Array.from(store.keys()).sort(), ["broken", "ok"]);
	});

	it("rejects parent prefix aggregate access after list removal", async () => {
		const caches = createNamespace([["a", 1], ["b", 2]]);
		const settings = createNamespace([["theme", "dark"]]);
		KV.namespaces.set("@iRingo.Maps.Caches", caches.namespace);
		KV.namespaces.set("@iRingo.Maps.Settings", settings.namespace);
		const kv = new KV();

		await assert.rejects(
			() => kv.getItem("@iRingo.Maps"),
			/no longer supports parent registered prefixes.*list\(\) removal/,
		);
	});

	it("uses longest prefix priority for overlapping registrations", async () => {
		const maps = createNamespace();
		const caches = createNamespace();
		KV.namespaces.set("@iRingo.Maps", maps.namespace);
		KV.namespaces.set("@iRingo.Maps.Caches", caches.namespace);
		const kv = new KV();

		assert.strictEqual(await kv.setItem("@iRingo.Maps.Caches.a", 1), true);
		assert.strictEqual(caches.store.get("a"), "1");
		assert.strictEqual(maps.store.has("Caches.a"), false);
		assert.strictEqual(await kv.setItem("@iRingo.Maps.theme", "light"), true);
		assert.strictEqual(maps.store.get("theme"), "light");
	});

	it("uses latest registration when a prefix is reassigned", async () => {
		const first = createNamespace();
		const second = createNamespace();
		KV.namespaces.set("@iRingo.Maps.Caches", first.namespace);
		KV.namespaces.set("@iRingo.Maps.Caches", second.namespace);
		const kv = new KV();

		assert.strictEqual(await kv.setItem("@iRingo.Maps.Caches.a", 1), true);
		assert.strictEqual(second.store.get("a"), "1");
		assert.strictEqual(first.store.has("a"), false);
	});

	it("rejects parent writes for registered prefixes", async () => {
		KV.namespaces.set("@iRingo.Maps.Caches", createNamespace().namespace);
		const kv = new KV();

		await assert.rejects(() => kv.getItem("@iRingo.Maps"), /parent registered prefixes.*list\(\) removal/);
		await assert.rejects(() => kv.setItem("@iRingo.Maps", {}), /parent registered prefixes/);
		await assert.rejects(() => kv.removeItem("@iRingo.Maps"), /parent registered prefixes.*list\(\) removal/);
	});

	it("keeps child access available after removing list semantics", async () => {
		const { namespace } = createNamespace([["a", "value"]]);
		KV.namespaces.set("@iRingo.Maps.Caches", namespace);
		const kv = new KV();

		assert.strictEqual(await kv.getItem("@iRingo.Maps.Caches.a"), "value");
		assert.strictEqual(await kv.setItem("@iRingo.Maps.Caches.b", true), true);
		assert.strictEqual(await kv.getItem("@iRingo.Maps.Caches.b"), true);
		await assert.rejects(() => kv.getItem("@iRingo.Maps.Caches"), /exact registered prefixes.*list\(\) removal/);
		await assert.rejects(() => kv.removeItem("@iRingo.Maps.Caches"), /exact registered prefixes.*list\(\) removal/);
		await assert.rejects(() => kv.clear("@iRingo.Maps.Caches"), /keyName arguments after list\(\) removal/);
	});

	it("keeps clear() no-arg behavior while rejecting keyName arguments", async () => {
		const { namespace, store } = createNamespace([["a", 1], ["b", 2]]);
		KV.namespaces.set("@iRingo.Maps.Caches", namespace);
		const kv = new KV();

		assert.strictEqual(await kv.clear(), false);
		await assert.rejects(() => kv.clear("@iRingo.Maps"), /keyName arguments after list\(\) removal/);
		await assert.rejects(() => kv.clear("@iRingo.Maps.Caches"), /keyName arguments after list\(\) removal/);
		assert.deepStrictEqual(Array.from(store.keys()).sort(), ["a", "b"]);
	});

	it("falls back to legacy @path behavior when no registered prefix matches", async () => {
		await withMockStorage(async store => {
			KV.namespaces.set("@iRingo.Maps.Caches", createNamespace().namespace);
			const kv = new KV();
			const keyName = "@auraflareKvMapFallback.theme";
			const nestedKeyName = "@auraflareKvMapFallback.preferences.color";
			assert.strictEqual(await kv.setItem(keyName, "dark"), true);
			assert.strictEqual(await kv.setItem(nestedKeyName, "blue"), true);
			assert.strictEqual(await kv.getItem(keyName), "dark");
			assert.strictEqual(await kv.getItem(nestedKeyName), "blue");
			assert.strictEqual(store.get("auraflareKvMapFallback"), JSON.stringify({ theme: "dark", preferences: { color: "blue" } }));
			assert.strictEqual(await kv.removeItem(keyName), true);
			assert.strictEqual(await kv.removeItem(nestedKeyName), true);
			assert.strictEqual(store.get("auraflareKvMapFallback"), JSON.stringify({ preferences: {} }));
		});
	});

	it("falls back to normal plain-key behavior when no registered prefix matches", async () => {
		await withMockStorage(async store => {
			const kv = new KV();

			assert.strictEqual(await kv.setItem("auraflareKvPlainFallback", 1), true);
			assert.strictEqual(await kv.getItem("auraflareKvPlainFallback"), 1);
			assert.strictEqual(store.get("auraflareKvPlainFallback"), "1");
			assert.strictEqual(await kv.removeItem("auraflareKvPlainFallback"), true);
			assert.strictEqual(store.has("auraflareKvPlainFallback"), false);
		});
	});

});
