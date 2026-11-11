#!/usr/bin/env node
/**
 * scnet-doctor.mjs — SCNet 通道体检 + 工具 schema 审计。
 *
 * 用法：
 *   node scnet-doctor.mjs                     # 全量体检
 *   node scnet-doctor.mjs --audit             # 只做工具 schema 裸属性表扫描（10013 预防）
 *   node scnet-doctor.mjs --dsh-home D:\DSH --profile desktop
 *
 * 检查项：
 *   1. provider 注册（cordis.patch.yml 里 scnet 段 + apiKeyEnv 引用）
 *   2. 凭据引用（.credentials.yaml refs 里 SCNET_API_KEY 是否存在）
 *   3. 密钥活性（用 SCNet-Max 发一条最小请求；200/401/402/10013 各有对应结论）
 *   4. 模型目录（平台当前提供的模型列表）
 *   5. 工具 schema 审计（--audit）：扫描本机 DSH 插件源码里的「裸属性表」参数定义——
 *      这是 SCNet 10013 Invalid request parameters 的最常见根因（宽松上游不校验，SCNet 会拒）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const DSH_HOME = argOf('--dsh-home') || process.env.DSH_HOME || path.join(os.homedir(), 'DSH');
const PROFILE = argOf('--profile') || 'desktop';
const PATCH = path.join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml');
const CRED = path.join(DSH_HOME, '.credentials.yaml');
const AUDIT_ONLY = has('--audit');

const log = (m) => console.log(m);
const section = (t) => log(`\n── ${t} ──────────────────────────`);

// ── 1/2 配置层 ────────────────────────────────────────────────────────
let refKey;
if (!AUDIT_ONLY) {
  section('① provider 注册');
  const patch = fs.existsSync(PATCH) ? fs.readFileSync(PATCH, 'utf8') : '';
  const i = patch.split('\n').findIndex((l) => l.trim() === 'scnet:');
  log(i >= 0 ? '✅ scnet provider 已注册（cordis.patch.yml）' : '❌ 未注册：node scnet-onboard.mjs --key sk-xxx');
  if (i >= 0) {
    const seg = patch.split('\n').slice(i).join('\n');
    const env = seg.match(/apiKeyEnv:\s*(\S+)/);
    log(`   引用名：${env ? env[1] : '（未设置 apiKeyEnv！）'}`);
  }
  section('② 凭据引用');
  const cred = fs.existsSync(CRED) ? fs.readFileSync(CRED, 'utf8') : '';
  const m = cred.match(/^  SCNET_API_KEY: (\S+)$/m);
  refKey = m ? m[1] : undefined;
  log(refKey ? `✅ SCNET_API_KEY 存在（${refKey.slice(0, 8)}…，不回显全文）` : '❌ refs 里没有 SCNET_API_KEY');
}

// ── 3 密钥活性 ────────────────────────────────────────────────────────
if (!AUDIT_ONLY) {
  section('③ 密钥活性（SCNet-Max 最小调用）');
  if (!refKey) {
    log('⏭ 无密钥可测');
  } else {
    const body = JSON.stringify({
      model: 'SCNet-Max', stream: false, max_tokens: 8,
      messages: [{ role: 'user', content: '回复一个字：好' }],
    });
    try {
      const { default: https } = await import('node:https');
      const res = await new Promise((resolve, reject) => {
        const req = https.request('https://api.scnet.cn/api/llm/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${refKey}`, 'Content-Type': 'application/json' },
          timeout: 60000,
        }, (r) => {
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => resolve({ status: r.statusCode, body: d }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('超时')));
        req.write(body); req.end();
      });
      if (res.status === 200) {
        log('✅ SCNet-Max 调用成功——通道可用');
      } else {
        const b = res.body.slice(0, 200);
        if (res.status === 401) log(`❌ 401：密钥失效或错误（上游返回：${b}）。去客户端/控制台重新取 key。`);
        else if (res.status === 402) log(`⚠️ 402：余额不足。若调的是 SCNet-Max，说明免费窗口（11-30）已过或平台收紧；其余模型本就按量计费。`);
        else if (/10013/.test(res.body)) log(`⚠️ 10013：请求参数被拒（doctor 的小请求不该触发，出现即异常）。`);
        else log(`⚠️ HTTP ${res.status}：${b}`);
      }
    } catch (e) {
      log(`❌ 调用失败：${e.message}`);
    }
  }
}

// ── 4 模型目录 ────────────────────────────────────────────────────────
if (!AUDIT_ONLY) {
  section('④ 模型目录（GET /models）');
  try {
    const { default: https } = await import('node:https');
    const res = await new Promise((resolve, reject) => {
      const req = https.request('https://api.scnet.cn/api/llm/v1/models', {
        method: 'GET', headers: refKey ? { Authorization: `Bearer ${refKey}` } : {}, timeout: 30000,
      }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
      req.on('error', reject); req.end();
    });
    if (res.status === 200) {
      try {
        const ids = (JSON.parse(res.body).data || []).map((m) => m.id);
        log(`✅ 平台模型 ${ids.length} 个：${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ' …' : ''}`);
      } catch { log(`✅ 200（返回非标准 JSON，原文前 200 字：${res.body.slice(0, 200)}）`); }
    } else log(`⚠️ HTTP ${res.status}：${res.body.slice(0, 150)}`);
  } catch (e) { log(`❌ ${e.message}`); }
}

// ── 5 工具 schema 裸属性表扫描 ────────────────────────────────────────
section('⑤ 工具 schema 审计（10013 预防）');
const SCHEMA_KEYWORDS = /^(type|properties|required|items|enum|format|description|title|default|anyOf|oneOf|allOf|additionalProperties|\$schema|\$defs|definitions|minLength|maxLength|minimum|maximum|pattern)\b/;
const dirs = [path.join(DSH_HOME, 'plugins')];
if (argOf('--plugins-dir')) dirs.push(argOf('--plugins-dir'));
const suspects = new Map();
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'node_modules' && f.name !== '.git') walk(p); continue; }
      if (!/\.(js|mjs|cjs)$/.test(f.name)) continue;
      let src; try { src = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const lines = src.split('\n');
      for (let i = 0; i < lines.length - 1; i += 1) {
        const m = lines[i].match(/^\s*parameters:\s*\{\s*$/);
        if (!m) continue;
        const next = lines[i + 1]?.trim() ?? '';
        if (!next || SCHEMA_KEYWORDS.test(next)) continue;
        // 裸属性表：下一行是「字段名: { type: … }」这类属性定义
        if (/^[A-Za-z_$][\w$]*:\s*\{/.test(next)) {
          const rel = path.relative(dir, p);
          const plugin = rel.split(path.sep)[0];
          if (!suspects.has(plugin)) suspects.set(plugin, []);
          suspects.get(plugin).push(`${rel}:${i + 1} → ${next.slice(0, 60)}`);
        }
      }
    }
  };
  walk(dir);
}
if (suspects.size === 0) {
  log('✅ 未发现裸属性表参数——各插件工具 schema 规范，SCNet 等严格校验的上游可正常接受。');
} else {
  log(`⚠️ 发现 ${[...suspects.keys()].length} 个插件存在裸属性表参数（上游严格校验时会 400 10013）：`);
  for (const [plugin, hits] of suspects) {
    log(`  [${plugin}]`);
    for (const h of hits.slice(0, 5)) log(`    ${h}`);
    if (hits.length > 5) log(`    … 共 ${hits.length} 处`);
    log(`    修法：在该插件注册工具的入口处，把 parameters 为「裸属性表」的包成 { type:'object', properties: 原表 }（参考 dsh-bili-toy-bot / dsh-independent-input 的修法）。`);
  }
}

log('\n体检结束。');
