# neet2leet

Solve a problem on [NeetCode](https://neetcode.io), get it **Accepted**, and the same solution is submitted to the matching problem on [LeetCode](https://leetcode.com) automatically. Also backfills everything you already solved on NeetCode.

No GitHub, no API keys, no copying cookies. The extension runs inside your browser and uses the sessions you are already logged in with on both sites.

```
NeetCode (Accepted) ──► neet2leet ──► LeetCode submit ──► verdict shown on the NeetCode page
```

## Install (unpacked)

1. Download / clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, pick the folder.
3. Log in on **leetcode.com** and **neetcode.io** in the same browser profile.
4. Solve something on NeetCode. When NeetCode says *Accepted*, a toast appears in the corner with the LeetCode verdict a few seconds later.

Works on Chrome, Edge, Brave and other Chromium browsers (Manifest V3, Chrome 116+).

## Backfill (bulk sync)

Click the extension icon → **Sync all accepted from NeetCode**. Leave **dry run** ticked the first time: it collects everything and lists in *Recent* what *would* be submitted, without touching LeetCode. Untick it and run again to submit for real.

The extension reads your completed problems on NeetCode, takes the latest accepted submission of each one and queues them for LeetCode. By default problems that are already accepted on LeetCode are skipped. Submissions are spaced out (30 s by default) to stay well within LeetCode's rate limits, so 150 problems take roughly 75 minutes; keep the browser open.

## How it works

| Step | Where | What |
|---|---|---|
| Detect | `src/neetcode-hook.js` (page world) | Wraps `XMLHttpRequest`/`fetch` on neetcode.io and watches NeetCode's own submit call (`/api/executeCodeFunctionHttp`). Grabs `problemId`, `lang`, `rawCode` and the verdict. |
| Relay | `src/neetcode-content.js` | Forwards accepted submissions to the service worker, shows toasts, runs the bulk collection using your NeetCode session. |
| Map | `data/mapping.json` | NeetCode slug → LeetCode slug / number / internal `question_id` / premium flag. 588 problems. Unknown slugs are resolved live (NeetCode title → LeetCode title, YouTube video title as fallback) and cached. |
| Adapt | `src/sigfix.js` | Rewrites the few names that differ between the sites (`hasDuplicate` -> `containsDuplicate`, `PrefixTree` -> `Trie`, ...) and, for JavaScript/TypeScript, appends top-level function shims because LeetCode calls plain functions while NeetCode uses `class Solution`. Fixes are precomputed for every problem/language pair in the mapping and computed live (NeetCode starter vs LeetCode snippet) for the rest. |
| Submit | `src/background.js` | Keeps a persistent queue, opens (or reuses) a background `leetcode.com` tab and runs the submit + verdict polling *inside that tab*, so requests carry your LeetCode cookies and a `leetcode.com` origin. |

Nothing leaves your browser except the requests to neetcode.io, leetcode.com and (for unknown problems) youtube.com's oEmbed endpoint.

### Why a mapping is needed

NeetCode renames many problems (`two-integer-sum` → `two-sum`, `duplicate-integer` → `contains-duplicate`, `islands-and-treasure` → `walls-and-gates`, …). The mapping was built from NeetCode's public metadata (which carries the LeetCode title) cross-checked against the LeetCode problem list and the "Leetcode NNN" in NeetCode's video titles. Rebuild it with:

```bash
python tools/build_mapping.py          # add --curl behind corporate proxies
```

## Limitations

- **LeetCode Premium problems** (161 of the 588) are skipped unless you enable them in settings and have Premium.
- **Different signatures** are patched automatically (renamed methods/classes, JS/TS function shims). When the two starters cannot be aligned the code is sent unchanged and LeetCode's verdict (*Compile Error* / *Runtime Error*) shows up in the log with the reason.
- **Dates.** Backfilled submissions carry today's date on LeetCode; there is no way to backdate.
- **Languages.** Python, Java, C++, JavaScript, TypeScript, C#, Go, Kotlin, Swift, Rust, C, Ruby, Scala, Dart. SQL problems are not supported.
- **Sessions expire.** If LeetCode logs you out the queue pauses; log in again and press *Resume*.
- The bulk collection depends on NeetCode's private `getCompletedProblems` response shape. If NeetCode changes it, tick *scan all problems* (slower: one request per problem).

Unofficial. Not affiliated with NeetCode or LeetCode. Both sites' internal endpoints can change without notice.

## Development

Plain JavaScript, no build step. Load the folder as an unpacked extension and reload it after edits. `npm test` runs the queue-logic harness (live submit, bulk dedupe, login pause/resume, mapping fallback, signature fixes) against a fake `chrome` API plus the signature-fix unit tests. Service-worker logs: `chrome://extensions` → neet2leet → *service worker*. Page-side logs are prefixed with `[neet2leet]` in the neetcode.io console.

## License

MIT — see [LICENSE](LICENSE).
