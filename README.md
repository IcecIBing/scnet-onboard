# scnet-onboard — 把「超算互联网（SCNet）」接进任意 DSH 鱼

> 2026-11-11 由「大肥鱼」的接入过程提炼而成。任何 DSH 构造的鱼/智能体都能用，
> **不含任何账号数据**——密钥自己创建、自己粘贴，或从本机客户端凭据自动读取。

## 这是什么

SCNet 的模型 API（OpenAI 兼容）在 2026-11 有限时活动：`SCNet-Max` 旗舰模型
**Token 免费畅享不限量，到 2026-11-30**（1M 上下文 / 128K 输出 / 支持图片与工具调用）。
本套装把它注册成 DSH 的一个 provider，让你鱼的主力模型可以直接用它。

限制须知：单租户限流 **10 QPS**；免费权益目前只在客户端公告里承诺（API 侧实测可用）；
其余模型按量计费（无余额 402）。

## 快速开始（三步）

### ① 拿密钥（二选一）

- **官网自建**：https://www.scnet.cn 注册登录 → 控制台 → 模型服务 → API Keys → 创建。
- **客户端自动读**：已装 SCNet 客户端（https://www.scnet.cn/ui/mall/client/download）并登录的话，
  脚本能从客户端凭据库自动读取，不用手动粘贴。

### ② 注册 provider

```bash
node scnet-onboard.mjs --key sk-xxxx --restart        # 粘贴密钥 + 自动重启 DSH
node scnet-onboard.mjs --key-from-sclaw --restart     # 从客户端凭据自动读
node scnet-onboard.mjs --dry-run                      # 先看将写入什么
node scnet-onboard.mjs --all-models                   # 额外装按量计费模型（无余额 402）
```

脚本做了什么：备份 → 在 `cordis.patch.yml` 的 providers 段注册 `scnet`
（默认只装免费的 SCNet-Max）→ 把密钥写进 `.credentials.yaml` refs（`SCNET_API_KEY`），
provider 以 `apiKeyEnv` 引用它——**DSH 不认配置里的明文 apiKey 字段**，这是本套装踩过的第一个坑。

### ③ 让你的鱼用它 + 体检

- 模型选择里会出现 `scnet/SCNet-Max`，按你鱼自己的场景机制把主力指过去即可。
- 体检：`node scnet-doctor.mjs`（provider 注册 / 凭据引用 / 密钥活性 / 模型目录 / 工具 schema 审计）。

## 懒人一键装（三行）

本机装了 git 和 node 的话，鱼自己或主人贴这三行就完事：

```bash
git clone https://github.com/IcecIBing/scnet-onboard.git
cd scnet-onboard
node scnet-onboard.mjs --key sk-xxxx --restart
```

不想装 git？只下脚本也行（curl 或浏览器直接存）：

```bash
curl -O https://raw.githubusercontent.com/IcecIBing/scnet-onboard/main/scnet-onboard.mjs
curl -O https://raw.githubusercontent.com/IcecIBing/scnet-onboard/main/scnet-doctor.mjs
```

装完跑一遍体检确认：`node scnet-doctor.mjs`。

## 10013 坑：工具 schema 必须是标准 JSON Schema

SCNet 对 `tools[].function.parameters` 做**严格校验**。很多插件把参数写成
「裸属性表」（`{ 字段名: { type } }`），缺 `type:"object"` / `properties` 包裹——
宽松上游（deepseek 官方、ginka、modelscope 等）不校验所以从没暴露，SCNet 直接
`400 10013 Invalid request parameters`，**整个会话一条消息都发不出**。

`node scnet-doctor.mjs --audit` 会扫描本机插件源码找出所有裸属性表并给出位置。
修法（参考 `dsh-bili-toy-bot` 与 `dsh-independent-input` 的修法）：在该插件注册工具的
入口处统一兜底——

```js
if (spec.parameters && typeof spec.parameters === 'object' && spec.parameters.type === undefined) {
  spec = { ...spec, parameters: { type: 'object', properties: spec.parameters } }
}
```

## 摘除

```bash
node scnet-onboard.mjs --remove   # 删 provider 段（密钥引用保留，可手动清理）
```

## 已知边界

- DSH 能力层对 SCNet-Max 拒绝 `max` 思考档 → 走上游默认档（≈high），聊天体感无差。
- 救援写回场景表会覆盖手动改的场景（DSH 既定行为），救援风暴期注意。
- 免费窗口 2026-11-30 结束后按量计费；长期可用可看 Token Plan（基础版 ¥30/月）。
- 平台已开始限制非官方客户端请求（客户端公告原文），API 侧实测目前可用，不保证长期。

## 全自动程度说明（鱼能自己做多少）

**DSH 鱼：接近全自动。** 鱼本身能跑命令，所以它可以自己执行：
- `node scnet-doctor.mjs` —— 体检输出是给人看的整段结论（❌ 在哪、怎么修），鱼读完转述给主人即可；
- 没密钥时，`scnet-onboard.mjs` 会打印官网创建路径并退出——鱼把这段话转给主人，
  主人唯一必须亲手做的事只有一件：**去官网注册账号、创建 API Key**（账号实名与人身验证没法代劳）；
- 拿到 key 后，鱼自己跑 onboard（`--restart` 自动重启）、自己把场景/主力模型指向 `scnet/SCNet-Max`、自己跑 doctor 验证。

**AstrBot 鱼：有一个先有鸡还是先有蛋的边界。** 如果这条鱼还没配置任何可用 provider，
它不会说话，自然也没法自己跑脚本——第一公里的 WebUI 配置（服务提供商新增，字段见
`astrbot-onboard.mjs --dry-run` 的输出）必须主人手动完成。配置好任意一个可用 provider
之后，它就和 DSH 鱼一样能自己跑脚本完成剩余工作。

**所有写入路径都有安全带**：写入前自动备份；`--dry-run` 预览；幂等（已存在跳过）；
AstrBot 旧结构配置会被版本守卫拦下并给人工路径，绝不写坏。
