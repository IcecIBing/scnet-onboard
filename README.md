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

不想装 git？只下脚本也行。**推荐整包下载**（最稳，一条命令拿全）：

```bash
curl -LO https://codeload.github.com/IcecIBing/scnet-onboard/zip/refs/heads/main
# 解压后进目录即可；Windows 也可直接在仓库页点 Code → Download ZIP
```

只要单个脚本的话，用镜像直链（国内网络对 `raw.githubusercontent.com` 常会 TLS 握手失败）：

```bash
curl -O https://ghproxy.net/https://raw.githubusercontent.com/IcecIBing/scnet-onboard/main/scnet-onboard.mjs
curl -O https://ghproxy.net/https://raw.githubusercontent.com/IcecIBing/scnet-onboard/main/scnet-doctor.mjs
```

也可以直接在仓库页打开文件，点 **Raw** 或右键「另存为」保存。

装完跑一遍体检确认：`node scnet-doctor.mjs`。

## 跑之前 / 跑之后各查一遍（给鱼看的自检单）

上面三步是「怎么做」，这一节是**别踩的那几个**。有 DSH 鱼的话直接把这段丢给它，
它能自己逐条核；主人自己装也建议照着过一遍。

### 跑之前

- **先 `--dry-run`**。它会完整打印将要写进 `cordis.patch.yml` 的 provider 段和
  `.credentials.yaml` 的 ref 名，不落盘。看不懂就停在这里，别硬跑。
- **确认 DSH home 对**。默认 `~/DSH`，多套 DSH / 非标准安装要显式给
  `--dsh-home <路径>`；写错地方的表现是「脚本说成功，模型列表里啥也没有」。
- **密钥别手工往配置里塞**。`cordis.patch.yml` 里的明文 `apiKey:` DSH **不认**，
  只会静默失效——必须走 `--key` / `--key-from-sclaw`，让脚本写进 refs。
- **别并发跑两个**。脚本是「读全文 → 改 → 写回」，两个同时跑会互相覆盖，
  后写的那个把前一个的改动抹掉。
- **改过配置就先自己留档**。脚本写入前会备份，但备份就在同目录、同名 `.bak`，
  跑第二次会盖掉第一份。你手改过 `cordis.patch.yml` 的话，先另存一份。
- **`--restart` 依赖 DSH-Guard**（`~/DSH-Guard/dsh_guard_cli.py`）。没有它会提示
  手动重启——这时候别去叉窗口/强杀进程，用控制台的停止按钮或 Guard 重来一遍，
  否则下次启动可能「假成功」且不报错。
- **已经有 `scnet:` 段时默认跳过**。换密钥、加模型得显式加 `--update`，
  不然你会以为换了、其实一个字节都没动。
- **鱼正在回话时别 `--restart`**。重启会把进行中的会话打断，等它说完。

### 跑之后

- **一定跑 `node scnet-doctor.mjs`**。五项结论：provider 是否注册、`SCNET_API_KEY`
  是否存在、密钥是否真能调通、平台模型目录、本机插件工具 schema 审计。前四项任一
  ❌ 都别往下走。
- **看错误码认病因**：`401` 是密钥失效/抄错（回客户端重新取），`402` 是余额不足
  （调 SCNet-Max 出现它 = 免费窗口过了或平台收紧，调别的模型本就按量计费），
  `400 10013` 是工具参数格式问题——见下面那节，跑 `--audit` 定位。
- **模型要自己指过去**。装完只在模型选择里多出 `scnet/SCNet-Max`，
  主力/场景不会自动切；改完场景表记住：救援风暴期 DSH 会把手改的场景覆盖回去。
- **`--remove` 只删 provider 段**，`SCNET_API_KEY` 还留在 `.credentials.yaml` 里，
  要清得手动删那一行。
- **记两个时间点**：免费窗口到 **2026-11-30**，之后按量计费；账户余额为零时调用
  只会 402、不会欠费——不充值就是免疫。
- **用 `ask_scnet.py` 的额外一条**：GLM 系免费包扣完会**静默转现金扣费**，
  控制台没有独立开关。跑之前确认 `scnet-glm-guard.json` 的状态，别绕过保险。

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

## 思考档位怎么选（2026-11-13 实测）

裸测口径：直连 `api.scnet.cn`、固定约 400 字中文长文、`temperature=0`、`max_tokens=2000`，
只变 `reasoning_effort`，每档 5 轮取中位数；**有效出字 = 正文 token ÷ 端到端总耗时（含思考等待）**。

| 档位 | 思考 token | 正文出字 | 备注 |
|---|---|---|---|
| `none`（需显式传） | 0 | **73.7 t/s** | 最快，首字 1.29 s；插件里选不到 |
| `off`（不传参） | 315–1638 | — | **不等于关思考**，服务端照样想，首字 3.6–12 s |
| `minimal` | ~0 | 41.9 t/s | |
| `low` | ~0 | 41.6 t/s | |
| `medium` | ~0 | 40.4 t/s | |
| `high` | ~0 | 40.7 t/s | 日常写作推荐这档 |
| `max` | ~708 | 32.7 t/s | 最慢，首字 7.1 s |

结论：**中间四档差别不到 3%，不用纠结；`max` 是最慢的一档**——它只是「想得更久」，
不是「写得更好」，只值得留给最难的推理题。日常写作选 `high` 就够。
想彻底不思考要显式传 `none`（正文 73.7 t/s，首字 1.29 s），但**插件档位白名单里没有
`none`**，`off` 只是「不发这个字段」，服务端照样会思考。

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

## ask_scnet.py — 通用共享调用器（带免费包保险）

不想接 DSH、只想把 SCNet 当命令行工具用的（脚本、流水线、批处理），用这个：

```bash
# 1. 配置密钥
cp scnet-key.example.json scnet-key.json   # 然后把你的 sk-xxxx 填进去
# 2. 调用（默认 SCNet-Max，活动窗口内不扣免费额度池）
python ask_scnet.py "问题"
python ask_scnet.py --file 文档.md "总结要点"      # 带文件
python ask_scnet.py --out 结果.md "问题"           # 答案存盘
python ask_scnet.py --model GLM-5.3-Flash "问题"   # 扣 GLM 免费包（见下方保险）
```

### 内置保险（防静默扣现金）

免费额度按**模型**分家：`SCNet-Max` 走 API 在活动窗口内（到 2026-11-30）**不扣**
免费额度池；扣池子的是 GLM 系免费包，**扣完不会提醒，会静默转现金扣费**，而控制台
没有独立的「关闭自动扣费」开关。本脚本内置三重保险：

1. **本地记账**：GLM 调用累计到包上限的 99% 自动熔断，之后拒绝发请求；
2. **402 熔断**：服务端返回 402（包尽/余额不足）时自动停用并记账；
3. **状态可查可控**：`scnet-glm-guard.json` 随时可看，`--force` 临时越过。

另一个天然防线：**账户余额为零时调用只会失败（402），不会欠费**——不充值就是免疫。

### 实测数据（2026-11-12）

- SCNet-Max 走 API 一个月跑了 1700 万+ tokens，免费额度池零消耗（窗口内等同不限量）；
- 免费额度池 1.2 亿（1 亿 + 1000 万 + 1000 万）全部挂在 GLM-5.3-Flash 名下，到账起 30 天到期；
- 免费额度**按模型分家，不按 API/客户端通道分**——这一点官方页面没写明，实测得出。

> 注：早期版本提到「单租户限流 10 QPS」，实测无官方出处（错误码表只有 429 速率上限、
> 无数值），请以自己实测为准，勿引用为官方数字。
