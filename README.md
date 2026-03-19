# Auraflare Shared

`@auraflare/shared` 提供两组能力：

- `Cloudflare`：Cloudflare API 客户端封装（当前对齐 `DNS records + KV`）
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
import Cloudflare, { KV as Storage } from "@auraflare/shared";
```

### `@auraflare/shared/Cloudflare`

运行时导出：

- `default` -> `Cloudflare`
- `Cloudflare`
- `CloudflareAPIError`

类型导出：

- `ClientOptions`
- `RequestOptions`
- `records + kv` 相关参数与响应类型（如 `Record*` / `Namespace*` / `Key*` / `Value*` / `Metadata*`）

```ts
import Cloudflare, { CloudflareAPIError } from "@auraflare/shared/Cloudflare";
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
import { KV as Storage } from "@auraflare/shared/KV";
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

默认 `baseURL` 为 `https://api.cloudflare.com/client/v4`。

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
client.dns.records.delete(dnsRecordId, { zone_id });
client.dns.records.edit(dnsRecordId, params);

client.kv.namespaces.create({ account_id, title });
client.kv.namespaces.update(namespaceId, { account_id, title });
client.kv.namespaces.list({ account_id });
client.kv.namespaces.get(namespaceId, { account_id });
client.kv.namespaces.delete(namespaceId, { account_id });
client.kv.namespaces.bulkDelete(namespaceId, { account_id, body: ["k1"] });
client.kv.namespaces.bulkGet(namespaceId, { account_id, keys: ["k1"] });
client.kv.namespaces.bulkUpdate(namespaceId, { account_id, body: [{ key: "k1", value: "v1" }] });

client.kv.namespaces.keys.list(namespaceId, { account_id });
client.kv.namespaces.keys.bulkDelete(namespaceId, { account_id, body: ["k1"] });
client.kv.namespaces.keys.bulkGet(namespaceId, { account_id, keys: ["k1"] });
client.kv.namespaces.keys.bulkUpdate(namespaceId, { account_id, body: [{ key: "k1", value: "v1" }] });

client.kv.namespaces.metadata.get(namespaceId, keyName, { account_id });

client.kv.namespaces.values.get(namespaceId, keyName, { account_id });
client.kv.namespaces.values.update(namespaceId, keyName, { account_id, value });
client.kv.namespaces.values.delete(namespaceId, keyName, { account_id });
```

### Legacy -> Current Mapping

以下表格对应旧版 `7f9a00d531d002acc32f2df7016468dac8f1c521` 的调用方式：

| 旧方法（静态） | 新方法（当前） | 说明 |
| --- | --- | --- |
| `Cloudflare.trace(request)` | `Cloudflare.trace(options?)` | 不再传入可变 `request` 对象 |
| `Cloudflare.trace4(request)` | `Cloudflare.trace4(options?)` | 同上 |
| `Cloudflare.trace6(request)` | `Cloudflare.trace6(options?)` | 同上 |
| `Cloudflare.verifyToken(request)` | `client.user.tokens.verify(options?)` | 从静态方法迁移到实例资源 |
| `Cloudflare.getUser(request)` | `client.user.get(options?)` | 从静态方法迁移到实例资源 |
| `Cloudflare.getZone(request, Zone)` | `client.zones.get({ zone_id })` | `zone_id` 直接传结构化参数 |
| `Cloudflare.listZones(request, Zone)` | `client.zones.list({ name })` | 查询参数改为结构化对象 |
| `Cloudflare.createDNSRecord(request, Zone, Record)` | `client.dns.records.create({ zone_id, ...record })` | `zone_id` 放在参数对象内 |
| `Cloudflare.getDNSRecord(request, Zone, Record)` | `client.dns.records.get(recordId, { zone_id })` | 记录 ID 单独参数 |
| `Cloudflare.listDNSRecords(request, Zone, Record)` | `client.dns.records.list({ zone_id, ...filters })` | 过滤参数按字段传入 |
| `Cloudflare.updateDNSRecord(request, Zone, Record)` | `client.dns.records.update(recordId, { zone_id, ...record })` | 记录 ID 单独参数 |
| 旧版无 | `client.dns.records.delete(recordId, { zone_id })` | 当前保留的 DNS 增量接口（新增） |
| 旧版无 | `client.dns.records.edit(recordId, { zone_id, ...patch })` | 当前保留的 DNS 增量接口（新增） |
| `Cloudflare.fetch(request, option)` | `Cloudflare.fetch(request, options?)` | 仍保留静态入口，内部统一处理 JSON/错误/通知 |

补充：当前 DNS 增量接口只保留 `delete` 和 `edit`，未保留 `batch/export/import/scan*`。

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

const value = response.body ?? "";

await client.kv.namespaces.values.delete("namespace-id", "KEY", {
	account_id: "account-id",
});
```

注意：`values.get()` 返回 `FetchResponse`（来自 `@nsnanocat/util`），不是自动解析后的字符串。

### Trace

```ts
const route = await Cloudflare.trace();
const route4 = await Cloudflare.trace4();
const route6 = await Cloudflare.trace6();
```

## KV Adapter (`KV`)

`KV` 提供接近 `Storage` 的统一接口：

```ts
const storage = new Storage(init);

await storage.getItem(keyName, defaultValue);
await storage.setItem(keyName, value);
await storage.removeItem(keyName);
await storage.clear();
await storage.list({ prefix, limit, cursor });
```

### Backend Priority

固定优先级：

1. `namespace` (`new Storage(namespace)` / `new Storage({ namespace })` / `new Storage({ env: { namespace } })`)
2. 显式传入的 `client` + `account_id` + `namespace_id`
3. 认证参数 + `account_id` + `namespace_id`（内部创建 `Cloudflare`）
4. `@nsnanocat/util` 的 `Storage`

### Worker Namespace Example

```ts
const storage = new Storage({
	env: {
		namespace: env.SETTINGS_KV,
	},
});

await storage.setItem("settings", { theme: "light" });
const settings = await storage.getItem("settings", {});
```

### Cloudflare REST Example

```ts
const storage = new Storage({
	apiToken: process.env.CLOUDFLARE_API_TOKEN,
	account_id: "account-id",
	namespace_id: "namespace-id",
});

await storage.setItem("feature-x", true);
const value = await storage.getItem("feature-x", false);
```

### Path Key Support

支持 `@root.path` 形式：

```ts
await storage.setItem("@settings.theme", "dark");
await storage.setItem("@settings.layout.sidebar", true);

const theme = await storage.getItem("@settings.theme", "light");
await storage.removeItem("@settings.layout.sidebar");
```

### `clear()` Behavior

`clear()` 当前为保守实现，固定返回 `false`，不会隐式批量清空 Cloudflare namespace。

## Development

```bash
npm test
```

## License

[Apache-2.0](./LICENSE)
