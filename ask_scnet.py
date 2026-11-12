# -*- coding: utf-8 -*-
"""
SCNet 共享调用器 —— 阿爪与大肥鱼共用一个账号的命令行入口（带免费包保险）。
用法:
  python ask_scnet.py "问题"                     # 默认 SCNet-Max（窗口内不扣免费包，随便用）
  python ask_scnet.py --file 路径 "针对这份文件: ..."   # 把文件内容一并送入
  python ask_scnet.py --out 结果.md "问题"        # 答案存盘
  python ask_scnet.py --model GLM-5.3-Flash "问题"   # 扣 1.2 亿免费包（12/11 到期）
可选: --max-tokens N（默认 4096）、--system "系统提示"、--force（无视保险强行调 GLM）

【保险机制（主人 12:10 指示）】
  GLM 调用受本地保险管控：累计用量达到免费包上限（默认 1.19 亿，留 1% 余量）
  或服务端返回 402（包尽/余额不足）时，自动熔断——之后 GLM 调用直接拒绝，
  不再打请求，杜绝「包扣完静默转现金扣费」。SCNet-Max 不受保险影响。
  状态文件: 同目录 scnet-glm-guard.json（可用 --force 临时越过，改 false 复位）。
"""
import argparse, json, sys, os, urllib.request

目录 = os.path.dirname(os.path.abspath(__file__))
配置路径 = os.path.join(目录, 'scnet-key.json')
保险路径 = os.path.join(目录, 'scnet-glm-guard.json')
GLM_包上限 = 119_000_000          # 1.2 亿包留 1% 余量，接近就熔断

def 读配置():
    with open(配置路径, encoding='utf-8') as f:
        return json.load(f)

def 读保险():
    默认 = {'glm_used': 0, 'glm_disabled': False, '原因': ''}
    try:
        with open(保险路径, encoding='utf-8') as f:
            return {**默认, **json.load(f)}
    except Exception:
        return dict(默认)

def 写保险(状态):
    with open(保险路径, 'w', encoding='utf-8') as f:
        json.dump(状态, f, ensure_ascii=False, indent=2)

def 记账并自检(状态, 用量):
    用了 = (用量.get('prompt_tokens') or 0) + (用量.get('completion_tokens') or 0)
    状态['glm_used'] += 用了
    if 状态['glm_used'] >= GLM_包上限:
        状态['glm_disabled'] = True
        状态['原因'] = '本地记账已达免费包上限（%d），熔断' % GLM_包上限
    写保险(状态)
    return 用了

def 调用(问题, 文件内容=None, 模型=None, max_tokens=4096, system=None, force=False):
    c = 读配置()
    模型 = 模型 or c.get('默认模型', 'SCNet-Max')
    状态 = 读保险()
    扣包 = 'glm' in 模型.lower()
    if 扣包 and not force:
        if 状态.get('glm_disabled'):
            raise SystemExit('【保险熔断】%s\n免费包已尽，拒绝调用 GLM（不烧现金）。'
                             '要强行调用加 --force；要复位保险把 scnet-glm-guard.json 里 glm_disabled 改 false。'
                             % 状态.get('原因', '免费包已达上限'))
        剩 = GLM_包上限 - 状态.get('glm_used', 0)
        if max_tokens > 剩:
            max_tokens = max(50, 剩)
    消息 = [{'role': 'system', 'content': system or (
        '你是助手，回答简洁准确；涉及 SCNet 活动数字时只引用已核实口径，不编造。')}]
    if 文件内容:
        消息.append({'role': 'user', 'content': '以下是参考文件内容：\n\n' + 文件内容[:120000]})
    消息.append({'role': 'user', 'content': 问题})
    体 = json.dumps({'model': 模型, 'messages': 消息, 'max_tokens': max_tokens}).encode()
    req = urllib.request.Request(
        c['接口地址'], data=体,
        headers={'Authorization': 'Bearer ' + c['apiKey'], 'content-type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=180)
        d = json.loads(r.read().decode())
        用量 = (d.get('usage') or {})
        if 扣包:
            记账并自检(状态, 用量)
        return d['choices'][0]['message']['content'], 用量, 扣包
    except urllib.error.HTTPError as e:
        详情 = ''
        try: 详情 = e.read().decode()[:300]
        except: pass
        if 扣包 and e.code == 402:
            状态['glm_disabled'] = True
            状态['原因'] = '服务端返回 402（免费包尽或余额不足）'
            写保险(状态)
            raise SystemExit('【保险熔断】服务端 402：%s\n已自动停用 GLM 调用，不再打请求（不烧现金）。' % 详情)
        raise SystemExit('调用失败 HTTP %s：%s' % (e.code, 详情))

def main():
    p = argparse.ArgumentParser()
    p.add_argument('问题')
    p.add_argument('--file', help='参考文件路径（文本类）')
    p.add_argument('--out', help='答案写入该文件')
    p.add_argument('--model')
    p.add_argument('--max-tokens', type=int, default=4096)
    p.add_argument('--system')
    p.add_argument('--force', action='store_true', help='无视 GLM 保险强行调用')
    a = p.parse_args()
    文件内容 = None
    if a.file:
        with open(a.file, encoding='utf-8', errors='ignore') as f:
            文件内容 = f.read()
    答案, 用量, 扣包 = 调用(a.问题, 文件内容, a.model, a.max_tokens, a.system, a.force)
    print(答案)
    状态 = 读保险()
    提示 = '本地累计扣包 %s / 上限 %s' % (状态.get('glm_used'), GLM_包上限) if 扣包 else 'SCNet-Max 不扣包'
    print('\n--- 用量: 输入 %s / 输出 %s | %s ---'
          % (用量.get('prompt_tokens'), 用量.get('completion_tokens'), 提示), file=sys.stderr)
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            f.write(答案)
        print('已写入', a.out, file=sys.stderr)

if __name__ == '__main__':
    main()
