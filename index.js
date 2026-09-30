'use strict';

/**
 * crawl-check-action — GitHub Action
 * Check AI crawler access in robots.txt, post step summary, optionally fail CI.
 *
 * No external dependencies — uses only Node.js built-ins.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const { URL } = require('url');

// ── GitHub Actions wire protocol (inline — no @actions/core dep) ─────────────
const getInput = (name) =>
  (process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '').trim();
const setOutput = (k, v) => {
  const f = process.env.GITHUB_OUTPUT;
  if (f) fs.appendFileSync(f, `${k}=${v}\n`);
  else process.stdout.write(`::set-output name=${k}::${v}\n`);
};
const appendSummary = (md) => {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) fs.appendFileSync(f, md + '\n');
  else process.stdout.write(md + '\n');
};
const logInfo    = (m) => console.log(m);
const logWarning = (m) => process.stdout.write(`::warning::${m}\n`);
const logError   = (m) => process.stdout.write(`::error::${m}\n`);
const setFailed  = (m) => { logError(m); process.exit(1); };

// ── Default crawler list ─────────────────────────────────────────────────────
const DEFAULT_CRAWLERS = [
  { name: 'GPTBot',             company: 'OpenAI' },
  { name: 'ClaudeBot',          company: 'Anthropic' },
  { name: 'anthropic-ai',       company: 'Anthropic' },
  { name: 'meta-externalagent', company: 'Meta' },
  { name: 'Bytespider',         company: 'ByteDance' },
  { name: 'PerplexityBot',      company: 'Perplexity' },
  { name: 'CCBot',              company: 'Common Crawl' },
  { name: 'Google-Extended',    company: 'Google' },
];

// ── HTTP fetch with redirect follow ─────────────────────────────────────────
function fetchUrl(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent':
            'crawl-check-action/1.0 (+https://github.com/lior-seats/crawl-check-action)',
        },
        timeout: 10000,
      },
      (res) => {
        const loc = res.headers.location;
        if (
          [301, 302, 307, 308].includes(res.statusCode) &&
          loc &&
          redirectsLeft > 0
        ) {
          return resolve(fetchUrl(new URL(loc, url).href, redirectsLeft - 1));
        }
        if (res.statusCode === 404) return resolve({ status: 404, body: '' });
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: 200, body }));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 10s'));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── robots.txt parser ────────────────────────────────────────────────────────
function isBlocked(content, botName) {
  if (!content || !content.trim()) return false;

  const bot = botName.toLowerCase();
  const lines = content
    .split('\n')
    .map((l) => l.split('#')[0].trim())
    .filter(Boolean);

  let currentAgents = [];
  let currentDisallowAll = false;
  let blocked = false;

  const commit = () => {
    const matches = currentAgents.some((a) => a === bot || a === '*');
    if (matches && currentDisallowAll) blocked = true;
    currentAgents = [];
    currentDisallowAll = false;
  };

  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (currentAgents.length) commit();
      currentAgents.push(value.toLowerCase());
    } else if (field === 'disallow') {
      if (value === '/' || value === '/*') currentDisallowAll = true;
    }
  }
  if (currentAgents.length) commit();

  return blocked;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  let rawUrl = getInput('url');
  const failOnAllowed = getInput('fail-on-allowed') === 'true';
  const crawlerOverride = getInput('crawlers');

  if (!rawUrl) return setFailed('Input "url" is required.');
  if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;

  let hostname;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return setFailed(`Invalid URL: ${rawUrl}`);
  }

  // ── Crawler list ───────────────────────────────────────────────────────────
  let crawlers = DEFAULT_CRAWLERS;
  if (crawlerOverride) {
    const names = crawlerOverride
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    crawlers = names.map((n) => ({
      name: n,
      company: DEFAULT_CRAWLERS.find(
        (c) => c.name.toLowerCase() === n.toLowerCase()
      )?.company || '',
    }));
  }

  const robotsUrl = rawUrl.replace(/\/$/, '') + '/robots.txt';
  logInfo(`\n🔍 Checking AI crawler access for ${hostname}`);
  logInfo(`   Fetching: ${robotsUrl}\n`);

  // ── Fetch robots.txt ───────────────────────────────────────────────────────
  let content = '';
  let fetchStatus = 200;
  try {
    const res = await fetchUrl(robotsUrl);
    content = res.body;
    fetchStatus = res.status;
    if (fetchStatus === 404) {
      logWarning(
        `No robots.txt found at ${hostname} (404) — all AI crawlers are implicitly allowed`
      );
    }
  } catch (err) {
    return setFailed(`Could not fetch robots.txt: ${err.message}`);
  }

  // ── Evaluate each crawler ──────────────────────────────────────────────────
  const results = crawlers.map((crawler) => ({
    ...crawler,
    blocked: isBlocked(content, crawler.name),
  }));

  const blocked = results.filter((r) => r.blocked);
  const allowed = results.filter((r) => !r.blocked);

  setOutput('blocked-count', String(blocked.length));
  setOutput('allowed-count', String(allowed.length));
  setOutput(
    'summary',
    JSON.stringify(
      results.map((r) => ({ name: r.name, company: r.company, blocked: r.blocked }))
    )
  );

  // ── Console table ──────────────────────────────────────────────────────────
  const PAD = 24;
  logInfo('Crawler'.padEnd(PAD) + 'Company'.padEnd(18) + 'Status');
  logInfo('─'.repeat(60));
  for (const r of results) {
    const status = r.blocked ? '✅ BLOCKED' : '⚠️  ALLOWED';
    logInfo(r.name.padEnd(PAD) + (r.company || '').padEnd(18) + status);
  }
  logInfo('');
  logInfo(
    `Result: ${blocked.length}/${results.length} blocked  |  ${allowed.length}/${results.length} have unrestricted access`
  );
  logInfo('');
  logInfo('🔍 Web tool:  https://lior-seats.github.io/crawl-check/');
  logInfo('📊 Monitoring: https://lior-seats.github.io/crawlguard-waitlist/');
  logInfo('');

  // ── Step summary (markdown) ────────────────────────────────────────────────
  const badge =
    blocked.length === results.length
      ? `🟢 All ${results.length} major AI crawlers are blocked`
      : blocked.length === 0
      ? `🔴 No AI crawlers are blocked`
      : `🟡 ${blocked.length}/${results.length} AI crawlers are blocked`;

  const rows = results
    .map((r) => {
      const icon = r.blocked ? '✅ Blocked' : '⚠️ Allowed';
      return `| \`${r.name}\` | ${r.company || ''} | ${icon} |`;
    })
    .join('\n');

  appendSummary(`## 🤖 AI Crawler Check — ${hostname}

${badge}

| Crawler | Company | Status |
|---|---|---|
${rows}

---
🔍 **Check your site:** [crawl-check](https://lior-seats.github.io/crawl-check/) &nbsp;·&nbsp; 📊 **Automated monitoring:** [CrawlGuard](https://lior-seats.github.io/crawlguard-waitlist/)
`);

  // ── Pass / fail ────────────────────────────────────────────────────────────
  if (allowed.length > 0) {
    const names = allowed.map((r) => r.name).join(', ');
    const msg = `AI crawlers with unrestricted access: ${names}. Add \`Disallow: /\` rules to robots.txt.`;
    if (failOnAllowed) {
      setFailed(msg);
    } else {
      logWarning(msg);
    }
  }
}

run().catch((err) => setFailed(`Unexpected error: ${err.message}`));
