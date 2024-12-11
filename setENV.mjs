import { Console, getStorage, Lodash as _ } from "@nsnanocat/util";

/**
 * Set Environment Variables
 * @author VirgilClyne
 * @param {String} name - Persistent Store Key
 * @param {Array} platforms - Platform Names
 * @param {Object} database - Default DataBase
 * @return {Object} { Settings, Caches, Configs }
 */
export function setENV(name, platforms, database) {
	Console.log("☑️ Set Environment Variables");
	const { Settings, Caches, Configs } = getStorage(name, platforms, database);
	/***************** Settings *****************/
	switch (Settings.Verify?.Mode) {
		case "Token":
			_.set(Configs, "Request.headers.authorization", `Bearer ${Settings.Verify?.Content}`);
			break;
		case "ServiceKey":
			_.set(Configs, "Request.headers.x-auth-user-service-key", Settings.Verify?.Content);
			break;
		case "Key":
			_.set(Settings, "Verify.Content", Array.from(Settings.Verify?.Content.split("\n")));
			//Console.debug(JSON.stringify(Settings.Verify.Content))
			_.set(Configs, "Request.headers.x-auth-key", Settings.Verify?.Content[0]);
			_.set(Configs, "Request.headers.x-auth-email", Settings.Verify?.Content[1]);
			break;
		case undefined:
			break;
		default:
			Console.error("无可用授权方式", `Mode=${Settings.Verify?.Mode}\nContent=${Settings.Verify?.Content}`);
			break;
	}
	switch (platforms.toString()) {
		case "DNS":
			Console.debug(`typeof Settings.zone.dns_records: ${typeof Settings.zone.dns_records}`);
			switch (typeof Settings.zone.dns_records) {
				case "string":
					Console.debug(`Settings.zone.dns_records: ${Settings.zone.dns_records}`);
					Settings.zone.dns_records = Array.from(Settings.zone.dns_records.split("\n"));
					Console.debug(JSON.stringify(Settings.zone.dns_records))
					Settings.zone.dns_records.forEach((item, i) => {
						Settings.zone.dns_records[i] = Object.fromEntries(item.split("&").map(item => item.split("=")));
						Settings.zone.dns_records[i].proxied = JSON.parse(Settings.zone.dns_records[i].proxied);
					});
					break;
				case "object":
					Settings.zone.dns_records = Settings.zone.dns_records.join(",").replace(/'/g, "\"");
					Console.debug(`Settings.zone.dns_records: ${Settings.zone.dns_records}`);
					Settings.zone.dns_records = JSON.parse(Settings.zone.dns_records);
					Console.debug(`Settings.zone.dns_records: ${JSON.stringify(Settings.zone.dns_records, null, 2)}`);
					break;
			}
			break;
		case "Panel":
			break;
		case "1dot1dot1dot1":
			break;
		case "WARP":
			break;
	}
	Console.info(`typeof Settings: ${typeof Settings}`, `Settings: ${JSON.stringify(Settings, null, 2)}`);
	/***************** Caches *****************/
	Console.debug(`typeof Caches: ${typeof Caches}`, `Caches: ${JSON.stringify(Caches, null, 2)}`);
	/***************** Configs *****************/
	Console.log("✅ Set Environment Variables");
	return { Settings, Caches, Configs };
}
