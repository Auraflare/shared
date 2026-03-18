# Auraflare Shared

`@auraflare/shared` 提供两组能力：

- `Cloudflare`：Cloudflare API 的最小客户端封装（保留当前项目在用能力）
- `KV`：`Storage` 风格的 KV 适配器（支持 Worker `KVNamespace`、Cloudflare REST、本地回退）

## Installation

```bash
npm i @auraflare/shared
```

## Public Exports

### `@auraflare/shared`

运行时仅导出：

- `default` -> `Cloudflare`
- `Cloudflare`
- `KV`

```ts
import Cloudflare, { KV } from "@auraflare/shared";
```

### `@auraflare/shared/Cloudflare`

运行时导出：

- `default` -> `Cloudflare`
- `Cloudflare`
- `CloudflareResponse`
- `CloudflareAPIError`

类型导出：

- `ClientOptions`
- `RequestOptions`

```ts
import Cloudflare, { CloudflareResponse, CloudflareAPIError } from "@auraflare/shared/Cloudflare";
import type { ClientOptions, RequestOptions } from "@auraflare/shared/Cloudflare";
```

### `@auraflare/shared/KV`

运行时导出：

- `KV`

类型导出：

- `KVNamespaceLike`
- `KVInitOptions`
- `KVListOptions`
- `KVListResult`

```ts
import { KV } from "@auraflare/shared/KV";
import type { KVInitOptions, KVNamespaceLike } from "@auraflare/shared/KV";
```

## Cloudflare Client

### Create Client

```ts
import Cloudflare from "@auraflare/shared";

const client = new Cloudflare({
	apiToken: process.env.CLOUDFLARE_API_TOKEN,
});
```

也支持 Global API Key：

```ts
const client = new Cloudflare({
	apiEmail: process.env.CLOUDFLARE_EMAIL,
	apiKey: process.env.CLOUDFLARE_API_KEY,
});
```

### Auth Env Fallback

如果构造参数未传，会按运行时读取：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_API_KEY`
- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_USER_SERVICE_KEY`
- `CLOUDFLARE_BASE_URL`

鉴权优先级：

1. `apiToken`
2. `apiKey + apiEmail`
3. `userServiceKey`

### Supported Methods (Current)

```ts
client.user.get();
client.user.tokens.verify();

client.zones.list();
client.zones.get({ zone_id });

client.dns.records.create(params);
client.dns.records.get(dnsRecordId, { zone_id });
client.dns.records.list({ zone_id });
client.dns.records.update(dnsRecordId, params);

client.kv.namespaces.list({ account_id });
client.kv.namespaces.keys.list(namespaceId, { account_id });
client.kv.namespaces.values.get(namespaceId, keyName, { account_id });
client.kv.namespaces.values.update(namespaceId, keyName, { account_id, value });
client.kv.namespaces.values.delete(namespaceId, keyName, { account_id });
```

### DNS Example

```ts
const created = await client.dns.records.create({
	zone_id: "your-zone-id",
	type: "A",
	name: "api.example.com",
	content: "203.0.113.10",
	ttl: 1,
	proxied: true,
});

const current = await client.dns.records.get(created.id, {
	zone_id: "your-zone-id",
});

await client.dns.records.update(created.id, {
	zone_id: "your-zone-id",
	type: "A",
	name: current.name ?? "api.example.com",
	content: "203.0.113.11",
	ttl: 1,
	proxied: true,
});
```

### KV REST Value Example

```ts
await client.kv.namespaces.values.update("namespace-id", "KEY", {
	account_id: "account-id",
	value: "VALUE",
});

const response = await client.kv.namespaces.values.get("namespace-id", "KEY", {
	account_id: "account-id",
});

const value = await response.text();

await client.kv.namespaces.values.delete("namespace-id", "KEY", {
	account_id: "account-id",
});
```

注意：`values.get()` 返回 `CloudflareResponse`，不是自动解析后的字符串。

### Trace

```ts
const route = await Cloudflare.trace();
const route4 = await Cloudflare.trace4();
const route6 = await Cloudflare.trace6();
```

## KV Adapter (`KV`)

`KV` 提供接近 `Storage` 的统一接口：

```ts
const kv = new KV(init);

await kv.getItem(keyName, defaultValue);
await kv.setItem(keyName, value);
await kv.removeItem(keyName);
await kv.clear();
await kv.list({ prefix, limit, cursor });
```

### Backend Priority

固定优先级：

1. `namespace` (`new KV(namespace)` / `new KV({ namespace })` / `new KV({ env: { namespace } })`)
2. 显式传入的 `client` + `account_id` + `namespace_id`
3. 认证参数 + `account_id` + `namespace_id`（内部创建 `Cloudflare`）
4. `@nsnanocat/util` 的 `Storage`

### Worker Namespace Example

```ts
const kv = new KV({
	env: {
		namespace: env.SETTINGS_KV,
	},
});

await kv.setItem("settings", { theme: "light" });
const settings = await kv.getItem("settings", {});
```

### Cloudflare REST Example

```ts
const kv = new KV({
	apiToken: process.env.CLOUDFLARE_API_TOKEN,
	account_id: "account-id",
	namespace_id: "namespace-id",
});

await kv.setItem("feature-x", true);
const value = await kv.getItem("feature-x", false);
```

### Path Key Support

支持 `@root.path` 形式：

```ts
await kv.setItem("@settings.theme", "dark");
await kv.setItem("@settings.layout.sidebar", true);

const theme = await kv.getItem("@settings.theme", "light");
await kv.removeItem("@settings.layout.sidebar");
```

### `clear()` Behavior

`clear()` 当前为保守实现，固定返回 `false`，不会隐式批量清空 Cloudflare namespace。

## Development

```bash
npm test
```

## License

[Apache-2.0](./LICENSE)
