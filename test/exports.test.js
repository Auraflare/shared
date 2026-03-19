import assert from "node:assert";
import { describe, it } from "node:test";

describe("public exports", () => {
	it("root entry only exports default/Cloudflare/KV", async () => {
		const root = await import("../index.mjs");
		assert.deepStrictEqual(Object.keys(root).sort(), ["Cloudflare", "KV", "default"]);
		assert.strictEqual(root.default, root.Cloudflare);
	});

	it("Cloudflare entry only exports intended runtime symbols", async () => {
		const cf = await import("../Cloudflare.mjs");
		assert.deepStrictEqual(Object.keys(cf).sort(), [
			"Cloudflare",
			"CloudflareAPIError",
			"default",
		]);
		assert.ok(!Object.hasOwn(cf, "DNSResource"));
		assert.ok(!Object.hasOwn(cf, "PagePromise"));
	});

	it("KV entry only exports KV class", async () => {
		const kv = await import("../KV.mjs");
		assert.deepStrictEqual(Object.keys(kv).sort(), ["KV"]);
	});
});
