const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const SETTING_IDS = ['enabled', 'allowPremium', 'bulkSkipAcceptedOnLeetCode', 'resubmitIdentical', 'delaySec'];

// green = accepted, gold = skipped (premium), orange = needs attention, red = any failed verdict/error
function statusClass(status) {
  if (!status) return '';
  if (status === 'Accepted') return 'ok';
  if (status === 'Dry run') return 'info';
  if (/^Skipped/.test(status)) return 'gold';
  if (/^(Retry|Paused|Unmapped)/.test(status)) return 'warn';
  return 'err';
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function renderLog(log) {
  const ul = $('log');
  ul.textContent = '';
  if (!log.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Nothing synced yet. Solve a problem on neetcode.io and get it Accepted.';
    ul.append(li);
    return;
  }
  for (const e of log) {
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = e.num ? `#${e.num} ${e.title}` : (e.problemId || e.status || '');
    t.title = `${fmtTime(e.at)} · ${e.source || ''} · ${e.lang || ''}`;
    const s = document.createElement('span');
    s.className = `s ${statusClass(e.status)}`;
    s.textContent = e.status || '';
    li.append(t, s);
    if (e.detail || e.url) {
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = e.detail || '';
      if (e.url) {
        const a = document.createElement('a');
        a.href = e.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'view on LeetCode';
        d.append(e.detail ? ' · ' : '', a);
      }
      li.append(d);
    }
    ul.append(li);
  }
}

function renderBulk(bulk) {
  const running = !!(bulk && bulk.running);
  $('bulk').disabled = running;
  $('abortBulk').hidden = !running;
  const el = $('bulkText');
  if (!bulk) { el.textContent = 'Backfill: sends the latest accepted solution of every problem you solved on NeetCode.'; return; }
  const parts = [];
  if (bulk.phase === 'starting') parts.push('Starting…');
  if (bulk.phase === 'listing') parts.push('Reading your completed problems on NeetCode…');
  if (bulk.phase === 'collecting') parts.push(`Collecting ${bulk.done}/${bulk.total} (found ${bulk.found} accepted)`);
  if (bulk.phase === 'done') parts.push(`Collected ${bulk.found} accepted solutions from ${bulk.done} problems.`);
  if (bulk.phase === 'aborted') parts.push('Stopped.');
  if (bulk.phase === 'error') parts.push(`Error: ${bulk.error}`);
  if (bulk.queued) parts.push(bulk.dryRun ? `${bulk.queued} would be submitted (dry run, see Recent).` : `${bulk.queued} queued for LeetCode.`);
  el.textContent = parts.join(' ');
}

async function refresh() {
  const st = await send({ type: 'getState' });
  if (!st || st.error) return;
  for (const id of SETTING_IDS) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!st.settings[id];
    else el.value = st.settings[id];
  }
  $('pausedRow').hidden = !st.paused;
  $('pausedText').textContent = st.paused || '';
  const q = st.queueCount;
  $('queueText').textContent = q
    ? `${q} in queue` + (st.queueHead[0] ? ` · next: #${st.queueHead[0].num} ${st.queueHead[0].title}` : '')
    : 'Queue empty';
  $('queueDot').className = `dot ${q ? (st.paused ? 'warn' : 'busy') : 'idle'}`;
  $('clearQueue').hidden = !q;
  renderLog(st.log || []);
  renderBulk(st.bulk);
}

async function checkLeetCode() {
  const r = await send({ type: 'checkLeetCode' });
  const dot = $('lcDot');
  if (r && r.loggedIn) {
    dot.className = 'dot ok';
    $('lcStatus').textContent = `LeetCode: ${r.userName} (${r.numSolved} solved)`;
  } else {
    dot.className = 'dot err';
    $('lcStatus').textContent = r && r.error ? `LeetCode: ${r.error}` : 'LeetCode: not logged in';
  }
}

for (const id of SETTING_IDS) {
  $(id).addEventListener('change', async () => {
    const el = $(id);
    await send({ type: 'setSettings', settings: { [id]: el.type === 'checkbox' ? el.checked : Number(el.value) } });
    refresh();
  });
}

$('openLc').addEventListener('click', () => chrome.tabs.create({ url: 'https://leetcode.com/' }));
$('resume').addEventListener('click', async () => { await send({ type: 'resume' }); refresh(); checkLeetCode(); });
$('clearQueue').addEventListener('click', async () => { await send({ type: 'clearQueue' }); refresh(); });
$('clearLog').addEventListener('click', async () => { await send({ type: 'clearLog' }); refresh(); });
$('bulk').addEventListener('click', async () => {
  $('bulk').disabled = true;
  await send({ type: 'startBulk', options: { scanAll: $('scanAll').checked, dryRun: $('dryRun').checked } });
  refresh();
});
$('abortBulk').addEventListener('click', async () => { await send({ type: 'abortBulk' }); refresh(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.queue || changes.log || changes.bulk || changes.paused)) refresh();
});

refresh();
checkLeetCode();
