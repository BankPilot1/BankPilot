# AI 与线上团队演示

## 本地配置

复制 `.env.example` 为 `.env`，填写服务商提供的三项值（不提交到 Git）：

- `AI_BASE_URL`：兼容 OpenAI Chat Completions 的基址，按服务商要求包含 `/v1`；不包含 `/chat/completions`。
- `AI_API_KEY`：模型服务密钥，仅服务端使用。
- `AI_MODEL`：服务商的准确模型 ID。
- `TEAM_ACCESS_CODE`：线上 AI 团队访问码，不要用 API Key 代替。

修改配置后重启 `npm start`。无配置时会明确显示规则演示模式，不能当作真实 AI 结果。

## AI 执行路径

自然语言 → 模型识别白名单只读意图 → 后端按账户范围计算事实 → 模型解读事实 → 结构化卡片及模型标记。

转账、取消代扣、强验证等仍使用原有后端流程，不授予模型执行或确认权限。原始欺诈标签不发送模型；只发送最近少量对话和当前查询事实，不发送 API 密钥。模型调用失败时不伪造结果；第二阶段解读失败则保留已取得的计算结果。

当前适配标准 OpenAI 兼容 Chat Completions 文本接口，不依赖特定 SDK。基址支持根路径、/v1 或完整 /chat/completions 地址；可用 AI_TOKEN_PARAMETER、AI_TEMPERATURE、AI_EXTRA_BODY 适配服务商参数差异。不能保证每一家自称兼容的服务商无需配置即可运行。默认使用 DeepSeek 官方 deepseek-flash，关闭思考模式，已完成真实调用验证。分析示例见 ai-analysis-sample.json。

## 托管版本

源码位于 `sites/bankpilot-demo`，由 `node scripts/build-hosted.mjs` 从本地前后端和精简数据生成单文件 Worker。

线上为一次性浏览器沙箱：各浏览器独立保存服务端签名的演示快照；签名有效期 24 小时，近期消息、任务和流水有数量上限。不是持久化银行账本，不保证跨设备同步，也不提供防回放保障；用户可重置自己的模拟数据。

托管环境变量：`SESSION_SECRET`（签名密钥，已使用 Sites secret 配置）、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`TEAM_ACCESS_CODE`。模型密钥在托管平台中也必须设为 secret。当前公开演示无需登录或访问码；仅当 AI_REQUIRE_ACCESS_CODE=true 时启用可选访问码。快照内的每日调用计数只用于演示提示，不是可靠的计费限额，正式公开服务还需数据库或网关级配额。

站点已按用户要求设为 public，拿到链接即可访问。访问范围通过 Sites 原生权限配置管理。
