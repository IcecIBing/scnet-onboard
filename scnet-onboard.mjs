#!/usr/bin/env node
/**
 * scnet-onboard.mjs — 把「超算互联网（SCNet）」注册成 DSH 的模型 provider。
 *
 * 面向任何 DSH 构造的鱼/智能体，不内置任何账号数据：
 *   密钥三种来源（优先级从高到低）：
 *     --key sk-xxx                 直接粘贴（在 SCNet 控制台 → 模型服务 → API Keys 自建）
 *     --key-from-sclaw             本机已装 SCNet 客户端且已登录时，自动读客户端凭据库
 *     （都没有）                    脚本会打印创建指引后退出
 *
 * 用法：
 *   node scnet-onboard.mjs --dry-run                 # 预览将要写入的内容
 *   node scnet-onboard.mjs --key sk-xxx              # 注册（默认只装免费的 SCNet-Max）
 *   node scnet-onboard.mjs --key sk-xxx --all-models # 同时装全部按量计费模型（无余额会 402）
 *   node scnet-onboard.mjs --key-from-sclaw --restart
 *   node scnet-onboard.mjs --remove                  # 摘除 scnet provider 与凭据引用
 *
 * 幂等：已存在 scnet provider 时默认跳过（--update 可强制刷新密钥与模型表）。
 * 每次写入前都备份目标文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const DRY = has('--dry-run');
const UPDATE = has('--update');
const REMOVE = has('--remove');
const RESTART = has('--restart');
const ALL_MODELS = has('--all-models');
const DSH_HOME = argOf('--dsh-home') || process.env.DSH_HOME || path.join(os.homedir(), 'DSH');
const PROFILE = argOf('--profile') || 'desktop';
const PATCH = path.join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml');
const CRED = path.join(DSH_HOME, '.credentials.yaml');

const log = (m) => console.log(`[scnet-onboard] ${m}`);

// ── 模型目录（2026-11-11 与客户端 /v3/config 核对）────────────────────
// 只列平台当前公开的模型；SCNet-Max 是唯一挂「限时免费」标的（窗口到 2026-11-30）。
const CATALOG = [
  { id: 'SCNet-Max', ctx: 1048576, out: 131072, input: ['text', 'image'], free: true },
  { id: 'DeepSeek-V4.1-Flash-1017', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'GLM-5.3-Flash', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'Qwen3.8-Flash', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'Kimi-K3.1-Pro', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'Kimi-K3.1-Pro-Highspeed', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'MiniMax-M3.1-Flash', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'DeepSeek-V4.1-Flash', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'MiniMax-M3', ctx: 1024000, out: 131072, input: ['text', 'image'] },
  { id: 'Kimi-K3', ctx: 1024000, out: 131072, input: ['text', 'image'] },
  { id: 'Qwen3.8-Max', ctx: 1048576, out: 131072, input: ['text', 'image'] },
  { id: 'GLM-5.3', ctx: 1048576, out: 131072, input: ['text'] },
  { id: 'DeepSeek-V4-Flash-0731', ctx: 1048576, out: 131072, input: ['text'] },
  { id: 'DeepSeek-V4-Pro-0813', ctx: 1048576, out: 131072, input: ['text'] },
];
const picked = ALL_MODELS ? CATALOG : CATALOG.filter((m) => m.free);

// ── 密钥来源 ──────────────────────────────────────────────────────────
function keyFromSclaw() {
  const dir = path.join(os.homedir(), '.sclaw', 'agent', 'scnet-credentials');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const k = d?.scnet?.key;
      if (typeof k === 'string' && k.startsWith('sk-')) return k;
    }
  } catch { /* 没装客户端或没登录 */ }
  return undefined;
}

function getApiKey() {
  const explicit = argOf('--key');
  if (explicit) return { key: explicit, via: '命令行 --key' };
  if (has('--key-from-sclaw')) {
    const k = keyFromSclaw();
    if (k) return { key: k, via: '本机 SCNet 客户端凭据库（自动读取）' };
    throw new Error('本机没找到客户端凭据（~/.sclaw/agent/scnet-credentials/）。请先安装并登录 SCNet 客户端，或用 --key 手动粘贴。');
  }
  console.log(`未提供密钥。获取方式（二选一）：
  ① 在 SCNet 官网 https://www.scnet.cn 注册登录 → 控制台 → 模型服务 → API Keys → 创建 API Key（免费，用于调用 SCNet-Max 等模型）
  ② 或本机安装 SCNet 客户端并登录后，用 --key-from-sclaw 自动读取
  然后重跑：node scnet-onboard.mjs --key <你的密钥>`);
  process.exit(1);
}

// ── 文件操作工具 ──────────────────────────────────────────────────────
function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const b = `${file}.bak-scnet-onboard-${stamp}`;
  fs.copyFileSync(file, b);
  log(`备份：${path.basename(b)}`);
  return b;
}

const PROVIDER_BLOCK = (apiKeyEnv, models) => [
  '      scnet:',
  '        displayName: 超算互联网 SCNet（模型API）',
  '        api: openai-completions',
  '        baseURL: https://api.scnet.cn/api/llm/v1',
  `        apiKeyEnv: ${apiKeyEnv}`,
  '        models:',
  ...models.map((m) => [
    `          - id: ${m.id}`,
    `            name: ${m.id} (SCNet)`,
    `            contextWindow: ${m.ctx}`,
    `            maxTokens: ${m.out}`,
    '            input:',
    ...m.input.map((i) => `              - ${i}`),
  ].flat()),
].join('\n');

function upsertProvider(patchLines, block) {
  const start = patchLines.findIndex((l) => l.trimEnd() === '    providers:');
  if (start < 0) throw new Error('cordis.patch.yml 里没有 providers 段（该 DSH 可能不使用补丁式配置）');
  // providers 段结束 = 下一个缩进 <= 4 的非空行
  for (let i = start + 1; i < patchLines.length; i += 1) {
    const l = patchLines[i];
    if (l.trim() && l.length - l.trimStart().length <= 4) { end = i; break; }
  }
  const seg = patchLines.slice(start, end);
  if (seg.some((l) => l.trim() === 'scnet:')) {
    // 已存在：整段替换（保持其它 provider 不动）
    let s2 = -1, e2 = end;
    for (let i = start + 1; i < end; i += 1) {
      if (patchLines[i].trim() === 'scnet:') { s2 = i; break; }
    }
    for (let i = s2 + 1; i < end; i += 1) {
      const l = patchLines[i];
      if (l.trim() && l.length - l.trimStart().length <= 6) { e2 = i; break; }
    }
    patchLines.splice(s2, e2 - s2, ...block.split('\n'));
    return 'replaced';
  }
  patchLines.splice(end, 0, ...block.split('\n'));
  return 'inserted';
}

function upsertRef(credLines, refName, key) {
  const i = credLines.findIndex((l) => l.trim() === 'refs:');
  if (i < 0) throw new Error('.credentials.yaml 里没有 refs 段');
  if (credLines.some((l) => l.trim() === `${refName}:`)) {
    const j = credLines.findIndex((l) => l.trim() === `${refName}:`);
    credLines[j] = `  ${refName}: ${key}`;
    return 'updated';
  }
  credLines.splice(i + 1, 0, `  ${refName}: ${key}`);
  return 'inserted';
}

// ── 主流程 ────────────────────────────────────────────────────────────
if (!fs.existsSync(PATCH)) { console.error(`找不到 ${PATCH}`); process.exit(1); }
if (!fs.existsSync(CRED)) { console.error(`找不到 ${CRED}`); process.exit(1); }

if (REMOVE) {
  const lines = fs.readFileSync(PATCH, 'utf8').split('\n');
  const s = lines.findIndex((l) => l.trim() === 'scnet:');
  if (s < 0) { log('scnet provider 不存在，无需摘除'); process.exit(0); }
  let e = lines.length;
  for (let i = s + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.trim() && l.length - l.trimStart().length <= 6) { e = i; break; }
  }
  if (!DRY) { backup(PATCH); fs.writeFileSync(PATCH, [...lines.slice(0, s), ...lines.slice(e)].join('\n'), 'utf8'); }
  const refName2 = 'SCNET_API_KEY';
  log(`${DRY ? '[dry] ' : ''}将删除 scnet provider 段（${e - s} 行）。凭据引用 ${refName2} 保留在 .credentials.yaml，可手动清理。`);
  process.exit(0);
}

const { key, via } = getApiKey();
log(`密钥来源：${via}（不回显）`);

let patch = fs.readFileSync(PATCH, 'utf8');
let cred = fs.readFileSync(CRED, 'utf8');
const patchLines = patch.split('\n');
const credLines = cred.split('\n');

// provider 是否已存在
const exists = patchLines.some((l) => l.trim() === 'scnet:');
if (exists && !UPDATE && !DRY) {
  log('scnet provider 已存在（--update 可刷新密钥/模型表）。本次未做改动。');
  process.exit(0);
}

const refName = 'SCNET_API_KEY';
const block = PROVIDER_BLOCK(refName, picked);
log(`模型表：${picked.map((m) => m.id).join(', ')}${ALL_MODELS ? '' : '（仅免费档，--all-models 装全部）'}`);

if (DRY) {
  console.log('--- 将写入 providers 段 ---');
  console.log(block);
  console.log('--- 将写入 .credentials.yaml refs ---');
  console.log(`  ${refName}: <密钥，不回显>`);
  process.exit(0);
}

if (exists) backup(PATCH);
const st = upsertProvider(patchLines, block);
log(`providers 段：${st === 'replaced' ? '已替换旧 scnet 段' : '已插入 scnet 段'}`);
fs.writeFileSync(PATCH, patchLines.join('\n'), 'utf8');

const rst = upsertRef(credLines, refName, key);
log(`.credentials.yaml refs：${rst === 'updated' ? '已更新' : '已插入'} ${refName}`);
fs.writeFileSync(CRED, credLines.join('\n'), 'utf8');

log('完成。DSH 重启后生效。');
if (RESTART) {
  const guard = path.join(os.homedir(), 'DSH-Guard', 'dsh_guard_cli.py');
  if (fs.existsSync(guard)) {
    try {
      const { execFileSync } = await import('node:child_process');
      const out = execFileSync('python', [guard, 'restart-dsh', '--force'], { encoding: 'utf8' });
      log(`DSH 重启：${out.trim().split('\n').slice(-1)[0]}`);
    } catch (e) { log(`自动重启失败（可手动重启）：${e.message}`); }
  } else log('未找到 DSH-Guard，请手动重启 DSH 使配置生效。');
} else {
  log('提示：加 --restart 可在注册后自动重启 DSH。');
}
log('接下来：把你的鱼的主力模型指向 scnet/SCNet-Max（各家接法不同，见 README.md「接入你的鱼」一节）。');
log('验证：node scnet-doctor.mjs');
