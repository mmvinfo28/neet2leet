# neetbridge

Two-way sync between [NeetCode](https://neetcode.io) and [LeetCode](https://leetcode.com), as a Chrome extension:

- **NeetCode → LeetCode** — get a problem *Accepted* on NeetCode and the same solution is submitted to the matching LeetCode problem; the LeetCode verdict shows up on the NeetCode page.
- **LeetCode → NeetCode** — get a problem *Accepted* on LeetCode and it is ticked in your NeetCode roadmap (NeetCode 150 / 250 / Blind 75); optionally the code is also submitted to NeetCode's judge so it appears in your NeetCode submission history.
- **Backfill** in both directions for everything you already solved.

No GitHub, no API keys, no copying cookies. The extension runs inside your browser and uses the sessions you are already logged in with on both sites.

```
NeetCode (Accepted) ──► neetbridge ──► LeetCode submit ──► verdict toast on NeetCode
LeetCode (Accepted) ──► neetbridge ──► NeetCode tick (+ judge) ──► toast on LeetCode
```

## Install (unpacked)

1. Download / clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, pick the folder.
3. Log in on **leetcode.com** and **neetcode.io** in the same browser profile.
4. Solve something on NeetCode. When NeetCode says *Accepted*, a toast appears in the corner with the LeetCode verdict a few seconds later.

Works on Chrome, Edge, Brave and other Chromium browsers (Manifest V3, Chrome 116+).

## Directions and settings

| Control | Effect |
|---|---|
| **NeetCode → LeetCode** | `off` · `submit accepted code` (default). |
| **LeetCode → NeetCode** | `off` · `tick the roadmap` (default) · `tick + submit code`. |
| Submit to LeetCode Premium problems | 161 of the 588 mapped problems are Premium on LeetCode; off by default. |
| Desktop notification | Windows/macOS notification with every verdict; click it to open the submission. |
| Gap between submissions | Minimum seconds between two submissions (any direction); 30 by default, 10 minimum. |

Identical code is never sent twice, and backfills skip whatever is already accepted / ticked on the target site.

## Backfill (bulk sync)

Click the extension icon. Leave **dry run** ticked the first time: it collects everything and lists in *Recent* what *would* happen, without touching either site. Untick it and run again for real.

- **Sync all →** (NeetCode → LeetCode) — reads your completed problems on NeetCode, takes the latest accepted submission of each and queues them for LeetCode (problems already accepted on LeetCode are skipped).
- **← Sync all** (LeetCode → NeetCode) — every problem accepted on LeetCode that exists on NeetCode and is not ticked there yet gets ticked; with the `tick + submit code` level the latest accepted LeetCode submission is fetched and run through NeetCode's judge as well.

Submissions are spaced out (30 s by default) to stay well within both sites' rate limits, so 150 problems take roughly 75 minutes; keep the browser open. Ticks alone are quick.

## How it works

| Step | Where | What |
|---|---|---|
| Detect | `src/neetcode-hook.js`, `src/leetcode-hook.js` (page world) | Wrap `XMLHttpRequest`/`fetch` on each site and watch the site's own submit call (`/api/executeCodeFunctionHttp` on NeetCode, `/problems/<slug>/submit/` + `/submissions/detail/<id>/check/` on LeetCode). Grab problem, language, code and verdict. Only page-initiated requests are seen, so the two directions cannot trigger each other. |
| Relay | `src/neetcode-content.js`, `src/leetcode-content.js` | Forward accepted submissions to the service worker, show toasts; the NeetCode one also executes the reverse direction (judge call, roadmap tick) and the bulk collection with your NeetCode session. |
| Map | `data/mapping.json` | NeetCode slug → LeetCode slug / number / internal `question_id` / premium flag / NeetCode topic. 588 problems, verified against NeetCode's own problem table. Unknown slugs are resolved live (NeetCode title → LeetCode title, YouTube video title as fallback) and cached. |
| Adapt | `src/sigfix.js` | Rewrites the few names that differ between the sites (`hasDuplicate` ↔ `containsDuplicate`, `PrefixTree` ↔ `Trie`, ...) and, for JavaScript/TypeScript, bridges the shapes: LeetCode calls plain functions, NeetCode calls methods on `class Solution`, so shims/wrappers are appended in whichever direction is needed. Fixes are precomputed for every problem/language pair in the mapping and computed live (NeetCode starter vs LeetCode snippet) for the rest. |
| Submit | `src/background.js` | Keeps one persistent queue for both directions. NeetCode → LeetCode runs the submit + verdict polling inside a background `leetcode.com` tab (requests carry your LeetCode cookies and a `leetcode.com` origin). LeetCode → NeetCode asks the NeetCode content script to call the judge / tick the roadmap with your Firebase session. |

Nothing leaves your browser except the requests to neetcode.io, leetcode.com and (for unknown problems) youtube.com's oEmbed endpoint.

### Why a mapping is needed

NeetCode renames many problems (`two-integer-sum` → `two-sum`, `duplicate-integer` → `contains-duplicate`, `islands-and-treasure` → `walls-and-gates`, …). The mapping was built from NeetCode's public metadata (which carries the LeetCode title) cross-checked against the LeetCode problem list and the "Leetcode NNN" in NeetCode's video titles. Rebuild it with:

```bash
python tools/build_mapping.py          # add --curl behind corporate proxies
```

## Limitations

- **Only the 588 problems that exist on NeetCode** can be synced in either direction; LeetCode → NeetCode silently ignores the other ~3500 LeetCode problems.
- **LeetCode Premium problems** (161 of the 588) are skipped unless you enable them in settings and have Premium. NeetCode Pro-only problems may reject judge submissions without Pro; the roadmap tick still works.
- **LeetCode → NeetCode judge submissions** don't trigger NeetCode's own GitHub auto-commit (that runs in NeetCode's UI); use NeetCode's *bulk sync* on its GitHub page afterwards if you want them there.
- **Python 2, C, Ruby, Scala, Dart** solutions from LeetCode can only tick the roadmap; NeetCode's judge has no such languages.
- **Different signatures** are patched automatically (renamed methods/classes, JS/TS function shims). When the two starters cannot be aligned the code is sent unchanged and LeetCode's verdict (*Compile Error* / *Runtime Error*) shows up in the log with the reason.
- **Dates.** Backfilled submissions carry today's date on LeetCode; there is no way to backdate.
- **Languages.** Python, Java, C++, JavaScript, TypeScript, C#, Go, Kotlin, Swift, Rust, C, Ruby, Scala, Dart. SQL problems are not supported.
- **Sessions expire.** If LeetCode logs you out the queue pauses; log in again and press *Resume*.
- The bulk collection depends on NeetCode's private `getCompletedProblems` response shape. If NeetCode changes it, tick *scan all problems* (slower: one request per problem).

Unofficial. Not affiliated with NeetCode or LeetCode. Both sites' internal endpoints can change without notice.

## Development

Plain JavaScript, no build step. Load the folder as an unpacked extension and reload it after edits. `npm test` runs the queue-logic harness (live submit, bulk dedupe, login pause/resume, mapping fallback, signature fixes) against a fake `chrome` API plus the signature-fix unit tests. Service-worker logs: `chrome://extensions` → neetbridge → *service worker*. Page-side logs are prefixed with `[neetbridge]` in the neetcode.io console.

## Publishing to the Chrome Web Store

1. One-time developer registration at the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (USD 5).
2. Build the upload: `powershell -ExecutionPolicy Bypass -File tools/pack.ps1` -> `neetbridge-<version>.zip` (manifest at the archive root, no tests/tools).
3. New item -> upload the zip -> fill in the listing: description, 128 px icon (`icons/icon128.png`), at least one 1280x800 screenshot, category *Developer Tools*, single-purpose description, a justification for each permission (`storage`, `scripting`, `alarms`, `notifications` and the three host permissions), the data-usage form (no data collected), and a privacy policy URL - point it at [PRIVACY.md](PRIVACY.md) in this repository.
4. Submit for review. Reviews usually take a few days; broad host permissions can take longer.

The blue *Verified* badge next to the publisher name comes from verifying a website you own in the dashboard (Search Console). *Featured* is picked by Google's reviewers, not applied for. Until the listing is live, users install the folder as an unpacked extension in Developer mode.

## License

MIT — see [LICENSE](LICENSE).
