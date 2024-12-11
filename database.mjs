export const database = {
	Panel: {
		Settings: {
			Title: "☁ 𝙒𝘼𝙍𝙋 𝙄𝙣𝙛𝙤",
			Icon: "lock.icloud.fill",
			IconColor: "#f48220",
			BackgroundColor: "#f6821f",
			Language: "auto",
		},
		Configs: {
			i18n: {
				"zh-Hans": {
					IPv4: "IPv4",
					IPv6: "IPv6",
					COLO: "托管中心",
					WARP_Level: "隐私保护",
					Account_Type: "账户类型",
					Data_Info: "流量信息",
					Unknown: "未知",
					Fail: "获取失败",
					WARP_Level_Off: "关闭",
					WARP_Level_On: "开启",
					WARP_Level_Plus: "增强",
					Account_Type_unlimited: "无限版",
					Account_Type_limited: "有限版",
					Account_Type_team: "团队版",
					Account_Type_plus: "WARP+",
					Account_Type_free: "免费版",
					Data_Info_Used: "已用",
					Data_Info_Residual: "剩余",
					Data_Info_Total: "总计",
					Data_Info_Unlimited: "无限",
				},
				"zh-Hant": {
					IPv4: "IPv4",
					IPv6: "IPv6",
					COLO: "託管中心",
					WARP_Level: "隱私保護",
					Account_Type: "賬戶類型",
					Data_Info: "流量信息",
					Unknown: "未知",
					Fail: "獲取失敗",
					WARP_Level_Off: "關閉",
					WARP_Level_On: "開啟",
					WARP_Level_Plus: "增強",
					Account_Type_unlimited: "無限版",
					Account_Type_limited: "有限版",
					Account_Type_team: "團隊版",
					Account_Type_plus: "WARP+",
					Account_Type_free: "免費版",
					Data_Info_Used: "已用",
					Data_Info_Residual: "剩餘",
					Data_Info_Total: "總計",
					Data_Info_Unlimited: "無限",
				},
				en: {
					IPv4: "IPv4",
					IPv6: "IPv6",
					COLO: "Colo Center",
					WARP_Level: "WARP Level",
					Account_Type: "Account Type",
					Data_Info: "Data Info.",
					Unknown: "Unknown",
					Fail: "Fail to Get",
					WARP_Level_Off: "OFF",
					WARP_Level_On: "ON",
					WARP_Level_Plus: "PLUS",
					Account_Type_unlimited: "Unlimited",
					Account_Type_limited: "Limited",
					Account_Type_team: "Team",
					Account_Type_plus: "WARP+",
					Account_Type_free: "Free",
					Data_Info_Used: "Used",
					Data_Info_Residual: "Remaining",
					Data_Info_Total: "Earned",
					Data_Info_Unlimited: "Unlimited",
				},
			},
		},
	},
	"1dot1dot1dot1": {
		Settings: {
			setupMode: "ChangeKeypair",
			Verify: {
				RegistrationId: null,
				Mode: "Token",
				Content: null,
			},
		},
	},
	DNS: {
		Settings: {
			IPServer: "ipw.cn",
			Verify: {
				Mode: "Token",
				// Requests
				// https://api.cloudflare.com/#getting-started-requests
				Content: "",
				// API Tokens
				// API Tokens provide a new way to authenticate with the Cloudflare API.
				//"Content":"8M7wS6hCpXVc-DoRnPPY_UCWPgy8aea4Wy6kCe5T"
				// API Keys
				// All requests must include both X-AUTH-KEY and X-AUTH-EMAIL headers to authenticate.
				// Requests that use X-AUTH-USER-SERVICE-KEY can use that instead of the Auth-Key and Auth-Email headers.
				/*
                //Set your account email address and API key. The API key can be found on the My Profile -> API Tokens page in the Cloudflare dashboard.
                "Content":["1234567893feefc5f0q5000bfo0c38d90bbeb",
                //Your contact email address
                "example@example.com" ]
                //User Service Key, A special Cloudflare API key good for a restricted set of endpoints. Always begins with "v1.0-", may vary in length.
                "Content": "v1.0-e24fd090c02efcfecb4de8f4ff246fd5c75b48946fdf0ce26c59f91d0d90797b-cfa33fe60e8e34073c149323454383fc9005d25c9b4c502c2f063457ef65322eade065975001a0b4b4c591c5e1bd36a6e8f7e2d4fa8a9ec01c64c041e99530c2-07b9efe0acd78c82c8d9c690aacb8656d81c369246d7f996a205fe3c18e9254a"
                */
			},
			// Zone
			// https://api.cloudflare.com/#zone-properties
			zone: {
				// Zone Details
				// https://api.cloudflare.com/#zone-zone-details
				id: "",
				// List Zones
				// https://api.cloudflare.com/#zone-list-zones
				name: "", //The domain/website name you want to run updates for (e.g. example.com)
				// DNS Records for a Zone
				// https://api.cloudflare.com/#dns-records-for-a-zone-properties
				dns_records: [
					{
						// DNS Record Details
						// https://api.cloudflare.com/#dns-records-for-a-zone-dns-record-details
						id: "",
						// List DNS Records
						// https://api.cloudflare.com/#dns-records-for-a-zone-list-dns-records
						// type
						// DNS record type
						type: "A",
						// name
						// DNS record name
						name: "",
						// content
						// DNS record content
						content: "",
						// ttl
						// Time to live, in seconds, of the DNS record. Must be between 60 and 86400, or 1 for "automatic"
						ttl: 1,
						// priority
						// Required for MX, SRV and URI records; unused by other record types.
						//"priority":10,
						// proxied
						// Whether the record is receiving the performance and security benefits of Cloudflare
						proxied: false, //Whether the record is receiving the performance and security benefits of Cloudflare
					},
				],
			},
		},
		Configs: {
			Request: {
				// Endpoints
				// https://api.cloudflare.com/#getting-started-endpoints
				url: "https://api.cloudflare.com/client/v4",
				headers: {
					"content-type": "application/json",
				},
			},
		},
	},
	WARP: {
		Settings: {
			setupMode: null,
			deviceType: "iOS",
			Verify: {
				License: null,
				Mode: "Token",
				Content: null,
				RegistrationId: null,
			},
		},
		Configs: {
			Environment: {
				iOS: {
					Type: "i",
					Version: "v0i2308151957",
					headers: {
						"user-agent": "1.1.1.1/6.22",
						"cf-client-version": "i-6.22-2308151957.1",
					},
				},
				macOS: {
					Type: "m",
					Version: "v0i2109031904",
					headers: {
						"user-agent": "1.1.1.1/2109031904.1 CFNetwork/1327.0.4 Darwin/21.2.0",
						"cf-client-version": "m-2021.12.1.0-0",
					},
				},
				Android: {
					Type: "a",
					Version: "v0a1922",
					headers: {
						"user-agent": "okhttp/3.12.1",
						"cf-client-version": "a-6.3-1922",
					},
				},
				Windows: {
					Type: "w",
					Version: "",
					headers: {
						"user-agent": "",
						"cf-client-version": "",
					},
				},
				Linux: {
					Type: "l",
					Version: "",
					headers: {
						"user-agent": "",
						"cf-client-version": "",
					},
				},
			},
		},
	},
	VPN: {
		Settings: {
			PrivateKey: "",
			PublicKey: "",
		},
		Configs: {
			interface: {
				addresses: {
					v4: "",
					v6: "",
				},
			},
			peers: [
				{
					public_key: "",
					endpoint: {
						host: "",
						v4: "",
						v6: "",
					},
				},
			],
		},
	},
	Default: {
		Settings: {},
		Configs: {
			Request: {
				url: "https://api.cloudflareclient.com",
				headers: {
					authorization: null,
					"content-Type": "application/json",
					"user-agent": "1.1.1.1/6.22",
					"cf-client-version": "i-6.22-2308151957.1",
				},
			},
		},
	},
};
