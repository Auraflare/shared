import { Console, fetch, Lodash as _, notification } from "@nsnanocat/util";

/***************** Cloudflare API v4 *****************/
export class Cloudflare {
	static name = "Cloudflare API v4";
	static version = "1.2.0";
	static baseURL = "https://api.cloudflare.com/client/v4";
	static option = {};

	static async trace(request) {
		Console.info("trace: 追踪路由");
		request.url = "https://cloudflare.com/cdn-cgi/trace";
		delete request.headers;
		return await fetch(request, Cloudflare.option).then(response =>
			Object.fromEntries(
				response.body
					.trim()
					.split("\n")
					.map(e => e.split("=")),
			),
		);
	}
	static async trace4(request) {
		Console.info("trace4: 追踪IPv4路由");
		//request.url = "https://1.1.1.1/cdn-cgi/trace";
		request.url = "https://162.159.36.1/cdn-cgi/trace";
		delete request.headers;
		return await fetch(request, Cloudflare.option).then(response =>
			Object.fromEntries(
				response.body
					.trim()
					.split("\n")
					.map(e => e.split("=")),
			),
		);
	}
	static async trace6(request) {
		Console.info("trace6: 追踪IPv6路由");
		request.url = "https://[2606:4700:4700::1111]/cdn-cgi/trace";
		delete request.headers;
		return await fetch(request, Cloudflare.option).then(response =>
			Object.fromEntries(
				response.body
					.trim()
					.split("\n")
					.map(e => e.split("=")),
			),
		);
	}
	static async verifyToken(request) {
		// Verify Token
		// https://api.cloudflare.com/#user-api-tokens-verify-token
		Console.info("verifyToken: 验证令牌");
		request.url = `${Cloudflare.baseURL}/user/tokens/verify`;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}
	static async getUser(request) {
		// User Details
		// https://api.cloudflare.com/#user-user-details
		Console.info("getUser: 获取用户信息");
		request.url = `${Cloudflare.baseURL}/user`;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}
	static async getZone(request, Zone) {
		// Zone Details
		// https://api.cloudflare.com/#zone-zone-details
		Console.info("getZone: 获取区域详情");
		request.url = `${Cloudflare.baseURL}/zones/${Zone.id}`;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}
	static async listZones(request, Zone) {
		// List Zones
		// https://api.cloudflare.com/#zone-list-zones
		Console.info("listZones: 列出区域");
		request.url = `${Cloudflare.baseURL}/zones?name=${Zone.name}`;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}
	static async createDNSRecord(request, Zone, Record) {
		// Create DNS Record
		// https://api.cloudflare.com/#dns-records-for-a-zone-create-dns-record
		Console.info("createDNSRecord: 创建新DNS记录");
		request.url = `${Cloudflare.baseURL}/zones/${Zone.id}/dns_records`;
		request.body = Record;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}
	static async getDNSRecord(request, Zone, Record) {
		// DNS Record Details
		// https://api.cloudflare.com/#dns-records-for-a-zone-dns-record-details
		Console.info("getDNSRecord: 获取DNS记录详情");
		request.url = `${Cloudflare.baseURL}/zones/${Zone.id}/dns_records/${Record.id}`;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}
	static async listDNSRecords(request, Zone, Record) {
		// List DNS Records
		// https://api.cloudflare.com/#dns-records-for-a-zone-list-dns-records
		Console.info("listDNSRecords: 列出DNS记录");
		request.url = `${Cloudflare.baseURL}/zones/${Zone.id}/dns_records?type=${Record.type}&name=${Record.name}.${Zone.name}&order=type`;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}
	static async updateDNSRecord(request, Zone, Record) {
		// Update DNS Record
		// https://api.cloudflare.com/#dns-records-for-a-zone-update-dns-record
		Console.info("updateDNSRecord: 更新DNS记录");
		request.method = "PUT";
		request.url = `${Cloudflare.baseURL}/zones/${Zone.id}/dns_records/${Record.id}`;
		request.body = Record;
		return await Cloudflare.fetch(request, Cloudflare.option);
	}

	static async fetch(request, option) {
		return await fetch(request, option).then(
			response => {
				const body = JSON.parse(response.body);
				if (Array.isArray(body.messages))
					body.messages.forEach(message => {
						if (message.code !== 10000) notification(Cloudflare.name, `code: ${message.code}`, `message: ${message.message}`);
					});
				switch (body.success) {
					case true:
						return body?.result?.[0] ?? body?.result; // body.result, body.meta
					case false:
						if (Array.isArray(body.errors)) body.errors.forEach(error => notification(Cloudflare.name, `code: ${error.code}`, `message: ${error.message}`));
						break;
					case undefined:
						return response;
				}
			},
			error => Console.error("Cloudflare 执行失败", ` error = ${error || e}`),
		);
	}
}
