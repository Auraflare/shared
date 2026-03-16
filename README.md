# ☁️ Auraflare: 🇸 Shared

`@auraflare/shared` 当前主要暴露两组和 Cloudflare 相关的能力：

- `Cloudflare`：按 Cloudflare 官方 SDK 风格封装的最小客户端，只覆盖本仓库当前正在使用的接口。
- `KV`：和 `@nsnanocat/util` 里的 `Storage` 语法兼容的适配器，可以直接接 Worker `KVNamespace`，也可以通过我们自己的 `Cloudflare` client 走 REST API。

## 快速开始

```ts
import Cloudflare, { KV } from "@auraflare/shared";
```

如果你不手动传认证信息，`Cloudflare` 会自动读取这些环境变量：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_API_KEY`
- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_USER_SERVICE_KEY`
- `CLOUDFLARE_BASE_URL`

鉴权优先级和运行时一致：

1. `apiToken`
2. `apiKey + apiEmail`
3. `userServiceKey`

## Cloudflare Client

### 初始化

使用 API Token：

```ts
import Cloudflare from "@auraflare/shared";

const client = new Cloudflare({
	apiToken: process.env.CLOUDFLARE_API_TOKEN,
});
```

使用 Global API Key：

```ts
import Cloudflare from "@auraflare/shared";

const client = new Cloudflare({
	apiEmail: process.env.CLOUDFLARE_EMAIL,
	apiKey: process.env.CLOUDFLARE_API_KEY,
});
```

### 当前支持的资源树

现在只保留本项目已经在用的这组接口：

```ts
const client = new Cloudflare(options);

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

### 用户与 Token

```ts
const me = await client.user.get();
const token = await client.user.tokens.verify();

console.log(me.id);
console.log(token.status);
```

### Zones

`list()` 返回分页对象，既可以 `await` 拿第一页，也可以 `for await` 自动翻页。

```ts
const firstPage = await client.zones.list({
	name: "example.com",
	per_page: 20,
});

console.log(firstPage.result);
console.log(firstPage.result_info);

for await (const zone of client.zones.list({ per_page: 50 })) {
	console.log(zone.id, zone.name);
}
```

读取单个 Zone：

```ts
const zone = await client.zones.get({
	zone_id: "your-zone-id",
});
```

### DNS Records

创建记录：

```ts
const record = await client.dns.records.create({
	zone_id: "your-zone-id",
	type: "A",
	name: "api.example.com",
	content: "203.0.113.10",
	ttl: 1,
	proxied: true,
});
```

列出记录：

```ts
for await (const record of client.dns.records.list({
	zone_id: "your-zone-id",
	type: "A",
	name: "api.example.com",
})) {
	console.log(record.id, record.content);
}
```

读取和覆盖更新记录：

```ts
const current = await client.dns.records.get("dns-record-id", {
	zone_id: "your-zone-id",
});

const updated = await client.dns.records.update("dns-record-id", {
	zone_id: "your-zone-id",
	type: "A",
	name: current.name ?? "api.example.com",
	content: "203.0.113.11",
	ttl: 1,
	proxied: true,
});
```

### KV REST API

列出 Namespaces：

```ts
for await (const namespace of client.kv.namespaces.list({
	account_id: "your-account-id",
	per_page: 100,
})) {
	console.log(namespace.id, namespace.title);
}
```

列出某个 Namespace 的键：

```ts
const page = await client.kv.namespaces.keys.list("your-namespace-id", {
	account_id: "your-account-id",
	prefix: "users:",
	limit: 100,
});

console.log(page.result);
console.log(page.result_info.cursor);
```

读写删除值：

```ts
await client.kv.namespaces.values.update("your-namespace-id", "KEY", {
	account_id: "your-account-id",
	value: "VALUE",
});

const response = await client.kv.namespaces.values.get("your-namespace-id", "KEY", {
	account_id: "your-account-id",
});

const value = await response.text();

await client.kv.namespaces.values.delete("your-namespace-id", "KEY", {
	account_id: "your-account-id",
});
```

注意：

- `values.get()` 返回的是 `CloudflareResponse`，不是已经解析好的字符串。
- 如果你只是想像 `Storage` 一样读写 JSON，更适合直接用下面的 `KV` 适配器。

### Trace

```ts
const trace = await Cloudflare.trace();
const trace4 = await Cloudflare.trace4();
const trace6 = await Cloudflare.trace6();
```

## KV Adapter

`KV` 的目标不是完整复刻 Cloudflare 官方 SDK，而是提供一个 `Storage` 风格的统一入口：

```ts
const kv = new KV(init);

await kv.getItem(keyName, defaultValue);
await kv.setItem(keyName, value);
await kv.removeItem(keyName);
await kv.clear();
await kv.list();
```

后端优先级固定为：

1. `namespace binding`
2. 已传入的 `client`
3. 传入的 Cloudflare 认证 + `account_id` + `namespace_id`
4. `@nsnanocat/util` 的 `Storage`

### 后端选择规则

`KV` 不会根据“当前是不是 Worker 环境”自动决定走哪条链路，而是严格按初始化参数判断：

- 只要拿到了 `namespace`，就直接调用 `this.namespace.get/put/delete/list`。
- `namespace` 的来源可以是 `new KV(namespace)`、`new KV({ namespace })`，或者 `new KV({ env: { namespace } })`。
- 如果没有 `namespace`，但传了 `client`，就调用我们自己的 `client.kv.namespaces.*`。
- 如果没有 `namespace`、也没有现成 `client`，但传了认证参数，`KV` 会先内部 `new Cloudflare(initOptions)`，然后再调用 `client.kv.namespaces.*`。
- REST 分支要真正生效，除了认证信息，还必须同时有 `account_id` 和 `namespace_id`。
- 只传 `apiToken`、只传 `account_id`、或者只传 `namespace_id` 都不够；缺任何一个都会继续回退。
- 如果前面条件都不满足，才回退到 `@nsnanocat/util` 的 `Storage`。

可以把它理解成这段伪代码：

```ts
if (namespace) {
	return namespace;
}

if (client && account_id && namespace_id) {
	return client.kv.namespaces;
}

if (auth && account_id && namespace_id) {
	return new Cloudflare(auth).kv.namespaces;
}

return Storage;
```

### 方式 1：直接使用 Worker `KVNamespace`

```ts
const kv = new KV({
	env: {
		namespace: env.SETTINGS_KV,
	},
});

await kv.setItem("profile", {
	name: "Auraflare",
});

const profile = await kv.getItem("profile", {});
```

也可以直接把 namespace 传进去：

```ts
const kv = new KV(env.SETTINGS_KV);
```

### 方式 2：传入现成的 Cloudflare client

```ts
const client = new Cloudflare({
	apiToken: process.env.CLOUDFLARE_API_TOKEN,
});

const kv = new KV({
	client,
	account_id: "your-account-id",
	namespace_id: "your-namespace-id",
});
```

### 方式 3：直接传认证信息

```ts
const kv = new KV({
	apiToken: process.env.CLOUDFLARE_API_TOKEN,
	account_id: "your-account-id",
	namespace_id: "your-namespace-id",
});
```

### `Storage` 兼容行为

对象会自动序列化为 JSON，读取时会尽量自动反序列化：

```ts
await kv.setItem("settings", {
	theme: "light",
	lang: "zh-CN",
});

const settings = await kv.getItem("settings", {});
```

支持 `@root.path.to.value` 路径键：

```ts
await kv.setItem("@settings.theme", "dark");
await kv.setItem("@settings.layout.sidebar", true);

const theme = await kv.getItem("@settings.theme", "light");

await kv.removeItem("@settings.layout.sidebar");
```

列出键：

```ts
const result = await kv.list({
	prefix: "settings",
	limit: 100,
});

console.log(result.keys);
console.log(result.cursor);
console.log(result.list_complete);
```

### 关于 `clear()`

当前 `clear()` 仍然保持保守实现，不会偷偷去批量清空整个 Cloudflare namespace，默认直接返回 `false`。如果后面确实需要“清空整个 namespace”，建议单独补一个语义明确的方法。

## 类型与入口

- 包默认导出：`Cloudflare`
- 命名导出：`Cloudflare`、`KV`
- 类型入口：`index.d.ts`

如果你想看具体类型定义，优先看这几个文件：

- `Cloudflare.d.ts`
- `KV.d.ts`
- `index.d.ts`
