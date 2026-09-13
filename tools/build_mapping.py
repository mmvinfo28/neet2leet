#!/usr/bin/env python3
"""Rebuild data/mapping.json: NeetCode problem slug -> LeetCode problem (+ signature fixes).

Sources (all public, no login needed):
  1. https://neetcode.io/api/getProblemListFunctionHttp      -> every NeetCode problem slug
  2. https://neetcode.io/api/getProblemMetadataFunctionHttp  -> per problem: LeetCode-style title, video id, starter code
  3. https://leetcode.com/api/problems/all/                  -> LeetCode title / slug / question_id / premium
  4. https://www.youtube.com/oembed                          -> video title "... - Leetcode 217 - ..." (fallback)
  5. https://leetcode.com/graphql                            -> LeetCode code snippets per language

Match order: exact title, normalised title (letters+digits only), then the LeetCode number
parsed from the YouTube title.

Signature fixes (`f` field): NeetCode's starter code is compared with LeetCode's snippet for every
language; differing class/method names become rename pairs, and JavaScript/TypeScript solutions
written as `class Solution` get top-level function shims (LeetCode calls plain functions there).
Problems whose starter is hidden for anonymous users (NeetCode Pro) or whose LeetCode snippet is
premium-only get no `f` entry; the extension computes those live when needed.

Usage:
  python tools/build_mapping.py                 # writes data/mapping.json
  python tools/build_mapping.py --curl          # use the curl binary instead of urllib (corporate proxies)
  python tools/build_mapping.py --workers 8
"""
import argparse
import concurrent.futures as cf
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

NC_LIST = 'https://neetcode.io/api/getProblemListFunctionHttp'
NC_META = 'https://neetcode.io/api/getProblemMetadataFunctionHttp'
LC_ALL = 'https://leetcode.com/api/problems/all/'
LC_GQL = 'https://leetcode.com/graphql'
YT_OEMBED = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json'
UA = 'Mozilla/5.0 (neet2leet mapping builder)'

NC2LC = {'python': 'python3', 'java': 'java', 'cpp': 'cpp', 'javascript': 'javascript', 'typescript': 'typescript',
         'csharp': 'csharp', 'go': 'golang', 'kotlin': 'kotlin', 'swift': 'swift', 'rust': 'rust', 'c': 'c',
         'ruby': 'ruby', 'scala': 'scala', 'dart': 'dart'}

KEYWORDS = set('''if for while switch return new delete sizeof typeof instanceof throw catch try else do case default
function class def self this super init constructor len range print push_back main
List Optional Dict Set Tuple Deque vector string map unordered_map unordered_set set pair queue deque stack priority_queue
int long double float bool char void auto var let const fn pub impl struct type func mut Vec String Option Box HashMap
Integer Boolean Character Array ArrayList HashSet LinkedList Math Object Number Any Int Bool Double Unit
override public private protected static final abstract readonly export import require operator
ListNode TreeNode Node GraphNode NestedInteger Interval Point Employee TreeNodeWithNext'''.split())

USE_CURL = False


# ----------------------------------------------------------------------------- http

def http(url, body=None, headers=None):
    headers = headers or {}
    if USE_CURL:
        cmd = ['curl', '-s', '--max-time', '60', '-A', UA, url]
        for k, v in headers.items():
            cmd += ['-H', f'{k}: {v}']
        if body is not None:
            cmd += ['-X', 'POST', '-H', 'content-type: application/json', '-d', json.dumps(body)]
        out = subprocess.run(cmd, capture_output=True).stdout
        return json.loads(out.decode('utf-8', 'replace'))
    req = urllib.request.Request(url, headers={'User-Agent': UA, **headers})
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header('content-type', 'application/json')
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def unwrap(j):
    if isinstance(j, dict):
        if 'data' in j:
            return j['data']
        if 'result' in j:
            return j['result']
    return j


def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def nc_meta(slug):
    for _ in range(3):
        try:
            d = unwrap(http(NC_META, {'data': {'problemId': slug}})) or {}
            if d.get('name'):
                vid = re.search(r'embed/([\w-]+)', d.get('video') or '')
                return slug, {'name': d['name'].strip(), 'video': vid.group(1) if vid else None,
                              'starter': d.get('starterCode') if isinstance(d.get('starterCode'), dict) else None}
        except Exception:
            pass
    return slug, {'name': None, 'video': None, 'starter': None}


def lc_snippets(slug):
    q = {'query': 'query q($s:String!){question(titleSlug:$s){codeSnippets{langSlug code}}}', 'variables': {'s': slug}}
    for _ in range(3):
        try:
            d = http(LC_GQL, q, {'referer': f'https://leetcode.com/problems/{slug}/'})
            snippets = (d.get('data') or {}).get('question') or {}
            snippets = snippets.get('codeSnippets') or []
            return slug, {c['langSlug']: c['code'] for c in snippets}
        except Exception:
            pass
    return slug, {}


def yt_title(vid):
    try:
        return http(YT_OEMBED.format(vid=vid)).get('title')
    except Exception:
        return None


# ----------------------------------------------------------------------------- signature fixes
# Mirror of src/sigfix.js (extractIdents / computeFix). Keep the two in sync.

def strip_comments(code, lang):
    if lang == 'python3':
        return re.sub(r'#.*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.S)
    return re.sub(r'//.*', '', code)


def extract_idents(code, lang):
    code = strip_comments(code or '', lang)
    names = []
    if lang == 'python3':
        names += [('class', m) for m in re.findall(r'^class\s+(\w+)', code, re.M)]
        names += [('fn', m) for m in re.findall(r'^\s*def\s+(\w+)\s*\(', code, re.M) if m != '__init__']
    elif lang == 'golang':
        names += [('class', m) for m in re.findall(r'^type\s+(\w+)\s+struct', code, re.M)]
        names += [('fn', m) for m in re.findall(r'^func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(', code, re.M) if m != 'Constructor']
    elif lang == 'rust':
        names += [('class', m) for m in re.findall(r'^(?:impl|struct)\s+(\w+)', code, re.M)]
        names += [('fn', m) for m in re.findall(r'^\s*(?:pub\s+)?fn\s+(\w+)\s*\(', code, re.M) if m != 'new']
    elif lang in ('javascript', 'typescript'):
        names += [('class', m) for m in re.findall(r'\bclass\s+(\w+)', code)]
        for m in re.findall(r'(?:var|let|const)\s+(\w+)\s*=\s*(?:function|\(|async)', code):
            names.append(('class', m) if m[0].isupper() else ('fn', m))
        names += [('fn', m) for m in re.findall(r'\bfunction\s+(\w+)\s*\(', code)]
        names += [('fn', m) for m in re.findall(r'\w+\.prototype\.(\w+)\s*=', code)]
        for m in re.findall(r'^\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{', code, re.M):
            if m not in ('constructor', 'if', 'for', 'while', 'switch', 'catch') and m not in KEYWORDS:
                names.append(('fn', m))
    else:
        names += [('class', m) for m in re.findall(r'\bclass\s+(\w+)', code)]
        for m in re.findall(r'(\w+)\s*\([^()]*\)\s*(?:const\s*)?(?::\s*\w+\s*)?\{', code):
            if m not in KEYWORDS and not m.startswith('__'):
                names.append(('fn', m))
    out, seen = [], set()
    for k, n in names:
        if (k, n) not in seen:
            seen.add((k, n))
            out.append((k, n))
    return out


def compute_fix(nc_code, lc_code, lang):
    """Returns a fix dict, {} when nothing differs, None when the shapes cannot be aligned."""
    if not nc_code or not lc_code:
        return None
    a = extract_idents(nc_code, lang)
    b = extract_idents(lc_code, lang)
    a_cls = [n for k, n in a if k == 'class']
    b_cls = [n for k, n in b if k == 'class']
    a_fn = [n for k, n in a if k == 'fn']
    b_fn = [n for k, n in b if k == 'fn']
    wrap_class = None
    if lang in ('javascript', 'typescript') and len(a_cls) == 1 and not b_cls:
        wrap_class, a_cls = a_cls[0], []
    a_fn = [n for n in a_fn if n not in a_cls]
    b_fn = [n for n in b_fn if n not in b_cls]
    if len(a_cls) != len(b_cls) or len(a_fn) != len(b_fn):
        return None
    r = [[x, y] for x, y in zip(a_cls + a_fn, b_cls + b_fn) if x != y]
    fix = {}
    if r:
        fix['r'] = r
    if wrap_class:
        fix['w'] = b_fn
        if wrap_class != 'Solution':
            fix['c'] = wrap_class
    return fix


# ----------------------------------------------------------------------------- main

def main():
    global USE_CURL
    ap = argparse.ArgumentParser()
    ap.add_argument('--curl', action='store_true', help='fetch with the curl binary instead of urllib')
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--out', default=str(Path(__file__).resolve().parent.parent / 'data' / 'mapping.json'))
    args = ap.parse_args()
    USE_CURL = args.curl

    print('fetching NeetCode problem list ...')
    nc_list = unwrap(http(NC_LIST, {'data': {}})) or {}
    slugs = sorted(k for k, v in nc_list.items() if isinstance(v, dict) and v.get('tag') == 'NeetCode150')
    print(f'  {len(slugs)} LeetCode-style problems on NeetCode')

    print('fetching LeetCode problem list ...')
    lc = http(LC_ALL)['stat_status_pairs']
    by_norm, by_num = {}, {}
    for x in lc:
        s = x['stat']
        e = {'s': s['question__title_slug'], 'n': s['frontend_question_id'], 'q': s['question_id'],
             'p': 1 if x['paid_only'] else 0, 't': s['question__title']}
        by_norm[norm(e['t'])] = e
        by_num[e['n']] = e
    print(f'  {len(lc)} problems on LeetCode')

    print('fetching NeetCode metadata (title, video, starter code) ...')
    with cf.ThreadPoolExecutor(args.workers) as ex:
        meta = dict(ex.map(nc_meta, slugs))

    mapping, need_yt = {}, []
    for slug in slugs:
        hit = by_norm.get(norm(meta[slug]['name']))
        if hit:
            mapping[slug] = dict(hit)
        else:
            need_yt.append(slug)
    print(f'  matched by title: {len(mapping)}, trying YouTube for {len(need_yt)}')

    with cf.ThreadPoolExecutor(args.workers) as ex:
        titles = dict(zip(need_yt, ex.map(lambda s: yt_title(meta[s]['video']) if meta[s]['video'] else None, need_yt)))
    unmapped = []
    for slug in need_yt:
        m = re.search(r'leetcode\s*#?\s*(\d+)', titles.get(slug) or '', re.I)
        hit = by_num.get(int(m.group(1))) if m else None
        if hit:
            mapping[slug] = dict(hit)
        else:
            unmapped.append((slug, meta[slug]['name']))

    print('fetching LeetCode code snippets ...')
    with cf.ThreadPoolExecutor(args.workers) as ex:
        snippets = dict(ex.map(lc_snippets, [v['s'] for v in mapping.values()]))

    fixed_problems = 0
    unaligned = []
    for slug, entry in mapping.items():
        starter = meta[slug]['starter']
        lcsn = snippets.get(entry['s']) or {}
        if not starter or not lcsn:
            continue
        fixes = {}
        for nclang, code in starter.items():
            lclang = NC2LC.get(nclang)
            if not lclang or lclang not in lcsn:
                continue
            fix = compute_fix(code, lcsn[lclang], lclang)
            if fix is None:
                unaligned.append((slug, lclang))
            elif fix:
                fixes[lclang] = fix
        if fixes:
            entry['f'] = fixes
            fixed_problems += 1

    ordered = dict(sorted(mapping.items(), key=lambda kv: kv[1]['n']))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as f:
        f.write('{\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}'
                                    for k, v in ordered.items()) + '\n}\n')
    print(f'wrote {out}: {len(ordered)} entries, {sum(v["p"] for v in ordered.values())} LeetCode premium, '
          f'{fixed_problems} with signature fixes')
    if unaligned:
        print(f'{len(unaligned)} problem/language pairs could not be aligned (extension falls back to a heuristic):')
        for slug, lang in unaligned[:30]:
            print(f'  {slug} [{lang}]')
    if unmapped:
        print('UNMAPPED:')
        for slug, name in unmapped:
            print(f'  {slug}  ({name})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
