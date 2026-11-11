#!/usr/bin/env node
/**
 * astrbot-onboard.mjs — 给 AstrBot（桌面版/Tauri 及同代 backend 配置结构）注册
 * 「超算互联网（SCNet）」OpenAI 兼容 provider。
 *
 * 与 DSH 版（scnet-onboard.mjs）共用同一套密钥来源与账号原则：不含任何账号数据。
 *
 * AstrBot 桌面版的配置结构（cmd_config.json，带 BOM 的 JSON）：
 *   provider_sources: [{ id, provider, type, provider_type:"chat_completion", key, api_base, enable, ... }]
 *   provider:         [{ id:"<source_id>/<model>", provider_source_id, model, modalities, enable, ... }]
 *
 * 用法：
 *   node astrbot-onboard.mjs --key sk-xxx             # 注册（默认只装免费的 SCNet-Max）
 *   node astrbot-onboard.mjs --key-from-sclaw         # 从本机 SCNet 客户端凭据自动读
 *   node astrbot-onboard.mjs --dry-run                # 预览
 *   node astrbot-onboard.mjs --update                 # 已存在时强制刷新
 *   node astrbot-onboard.mjs --all-models             # 同时装按量计费模型
 *   node astrbot-onboard.mjs --remove                 # 摘除
 *
 * 默认 AstrBot 数据目录探测顺序：--astrbot-home → %USERPROFILE%\.astrbot\data → F:\AstrBot\data
 * 写入后需要重启 AstrBot（桌面端重启，或在 WebUI 里应用配置）才生效。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const DRY = has('--dry-run');
const UPDATE = has('--update');
const REMOVE = has('--remove');
const ALL_MODELS = has('--all-models');
const SOURCE_ID = 'scnet';

const CATALOG = [
  { id: 'SCNet-Max', ctx: 1048576, out: 131072, input: ['text', 'image'], free: true },
  { id: 'DeepSeek-V4.1-Flash-1017', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'GLM-5.3-Flash', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'Qwen3.8-Flash', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'Kimi-K3.1-Pro', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'MiniMax-M3.1-Flash', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'Qwen3.8-Max', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'GLM-5.3', ctx: 1048576, out: 131072, input: ['text'] },
  { id: 'DeepSeek-V4-Flash-0731', ctx: 1048576, out: 131072, input: ['text'] },
];
const picked = ALL_MODELS ? CATALOG : CATALOG.filter((m) => m.free);

const log = (m) => console.log(`[astrbot-onboard] ${m}`);

function findDataDir() {
  const explicit = argOf('--astrbot-home');
  const candidates = explicit
    ? [explicit]
    : [path.join(os.homedir(), '.astrbot', 'data'), 'F:\\AstrBot\\data'];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'cmd_config.json'))) return c;
  }
  throw new Error('没找到 AstrBot 数据目录（cmd_config.json）。用 --astrbot-home 指定。');
}

function keyFromSclaw() {
  const dir = path.join(os.homedir(), '.sclaw', 'agent', 'scnet-credentials');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const k = d?.scnet?.key;
      if (typeof k === 'string' && k.startsWith('sk-')) return k;
    }
  } catch { /* 无客户端 */ }
  return undefined;
}

const dataDir = findDataDir();
const cfgPath = path.join(dataDir, 'cmd_config.json');
const raw = fs.readFileSync(cfgPath, 'utf8');
const hadBom = raw.charCodeAt(0) === 0xfeff;
const cfg = JSON.parse(hadBom ? raw.slice(1) : raw);

if (REMOVE) {
  const before = JSON.stringify(cfg);
  cfg.provider_sources = (cfg.provider_sources || []).filter((s) => s.id !== SOURCE_ID);
  cfg.provider = (cfg.provider || []).filter((p) => p.provider_source_id !== SOURCE_ID);
  if (JSON.stringify(cfg) === before) { log('scnet 不存在，无需摘除'); process.exit(0); }
  if (!DRY) {
    fs.copyFileSync(cfgPath, cfgPath + '.bak-scnet-remove');
    fs.writeFileSync(cfgPath, (hadBom ? '\ufeff' : '') + JSON.stringify(cfg, null, 4), 'utf8');
    log('已摘除 scnet source 与实例（已备份）。重启 AstrBot 生效。');
  } else log('[dry] 将摘除 scnet source 与实例');
  process.exit(0);
}

// ── 密钥 ──────────────────────────────────────────────────────────────
let key = argOf('--key');
let via = '命令行 --key';
if (!key && has('--key-from-sclaw')) {
  key = keyFromSclaw();
  via = '本机 SCNet 客户端凭据库（自动读取）';
  if (!key) throw new Error('本机没找到客户端凭据。请先安装登录 SCNet 客户端，或用 --key 粘贴。');
}
if (!key) {
  console.log(`未提供密钥。获取：https://www.scnet.cn → 控制台 → 模型服务 → API Keys → 创建
然后重跑：node astrbot-onboard.mjs --key <你的密钥>
或本机装了 SCNet 客户端并登录后：node astrbot-onboard.mjs --key-from-sclaw`);
  process.exit(1);
}
log(`密钥来源：${via}（不回显）`);

// 版本守卫：本脚本面向「provider_sources 数组」的新版结构（桌面版）。
// 老 AstrBot（pip 版/旧配置）的 provider 是内联 type/api_base/key 的数组，
// 没有 provider_sources 段——往那种结构里塞 source 会把配置写坏，必须拦下并给人工路径。
if (!Array.isArray(cfg.provider_sources)) {
  console.log(`这个 AstrBot 的配置是旧结构（没有 provider_sources 段），本脚本不适用。
请改走人工路径（一样快）：
  WebUI → 服务提供商 → 新增 → 类型选 openai_chat_completion
  名称 scnet | API Base https://api.scnet.cn/api/llm/v1 | Key <你的 SCNet 密钥>
  模型 SCNet-Max → 保存 → 对话模型设为它。
（${'密钥'}来源：${'官网 API Keys 页创建'}，或 --key 参数传入后此处只提示不写文件。）`);
  process.exit(1);
}
const srcExists = (cfg.provider_sources || []).some((s) => s.id === SOURCE_ID);
if (srcExists && !UPDATE && !DRY) {
  log('scnet source 已存在（--update 可刷新）。本次未改动。');
  process.exit(0);
}

const source = {
  id: SOURCE_ID,
  provider: SOURCE_ID,
  type: 'openai_chat_completion',
  provider_type: 'chat_completion',
  key,
  timeout: 120,
  api_base: 'https://api.scnet.cn/api/llm/v1',
  proxy: '',
  custom_headers: {},
  enable: true,
};
const instances = picked.map((m) => ({
  id: `${SOURCE_ID}/${m.id}`,
  enable: true,
  provider_source_id: SOURCE_ID,
  model: m.id,
  modalities: [...new Set([...(m.input || ['text']), 'tool_use'])],
  custom_extra_body: {},
  max_context_tokens: 0,
}));

log(`模型实例：${instances.map((i) => i.model).join(', ')}${ALL_MODELS ? '' : '（仅免费档，--all-models 装全部）'}`);

if (DRY) {
  console.log('--- 将写入 provider_sources ---');
  const s = { ...source, key: '<隐藏>' };
  console.log(JSON.stringify(s, null, 1));
  console.log('--- 将写入 provider 实例 ---');
  console.log(JSON.stringify(instances, null, 1));
  process.exit(0);
}

fs.copyFileSync(cfgPath, cfgPath + '.bak-scnet-onboard');
log(`备份：${path.basename(cfgPath)}.bak-scnet-onboard`);

cfg.provider_sources = cfg.provider_sources || [];
const si = cfg.provider_sources.findIndex((s) => s.id === SOURCE_ID);
if (si >= 0) cfg.provider_sources[si] = source; else cfg.provider_sources.push(source);
cfg.provider = cfg.provider || [];
for (let i = cfg.provider.length - 1; i >= 0; i -= 1) {
  if (cfg.provider[i].provider_source_id === SOURCE_ID) cfg.provider.splice(i, 1);
}
cfg.provider.push(...instances);

fs.writeFileSync(cfgPath, (hadBom ? '\ufeff' : '') + JSON.stringify(cfg, null, 4), 'utf8');
log('cmd_config.json 已写入。');
log('生效方式：重启 AstrBot（桌面端关闭重开，或 WebUI 里应用配置）。');
log('然后：WebUI → 服务提供商 里把 scnet/SCNet-Max 设为对话模型，或在人格/会话里指定。');
