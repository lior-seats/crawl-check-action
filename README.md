# Check AI Crawler Access

> GitHub Action — Check if your site's `robots.txt` blocks major AI crawlers. Posts a step summary and optionally fails CI.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Check%20AI%20Crawler%20Access-blue?logo=github)](https://github.com/marketplace/actions/check-ai-crawler-access)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

AI crawlers (GPTBot, ClaudeBot, Bytespider, and more) scrape your site for training data. This Action catches `robots.txt` misconfigurations before they reach production — and posts a clear summary directly to your workflow run.

---

## Usage

```yaml
- name: Check AI crawler access
  uses: lior-seats/crawl-check-action@v1
  with:
    url: 'https://yoursite.com'
```

### Fail CI if crawlers aren't blocked

```yaml
- name: Require AI crawlers to be blocked
  uses: lior-seats/crawl-check-action@v1
  with:
    url: 'https://yoursite.com'
    fail-on-allowed: 'true'
```

### Full workflow — check on every robots.txt change

```yaml
name: Check AI Crawler Access

on:
  push:
    branches: [main]
  pull_request:
    paths:
      - '**/robots.txt'
      - 'public/robots.txt'

jobs:
  crawl-check:
    runs-on: ubuntu-latest
    steps:
      - name: Check AI crawler access
        uses: lior-seats/crawl-check-action@v1
        with:
          url: ${{ vars.PRODUCTION_URL }}
          fail-on-allowed: 'true'
```

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `url` | ✅ | — | Site URL to check (`https://example.com` or `example.com`) |
| `fail-on-allowed` | ❌ | `false` | Fail the step if any AI crawlers have unrestricted access |
| `crawlers` | ❌ | All 8 defaults | Comma-separated crawler names to check |

## Outputs

| Output | Description |
|---|---|
| `blocked-count` | Number of crawlers that are blocked |
| `allowed-count` | Number of crawlers with unrestricted access |
| `summary` | JSON array of per-crawler results |

---

## Crawlers checked (defaults)

| Crawler | Company |
|---|---|
| GPTBot | OpenAI |
| ClaudeBot | Anthropic |
| anthropic-ai | Anthropic |
| meta-externalagent | Meta |
| Bytespider | ByteDance |
| PerplexityBot | Perplexity |
| CCBot | Common Crawl |
| Google-Extended | Google |

---

## Step Summary

The Action posts a markdown table directly to your workflow run's step summary:

| Crawler | Company | Status |
|---|---|---|
| `GPTBot` | OpenAI | ✅ Blocked |
| `ClaudeBot` | Anthropic | ⚠️ Allowed |
| `Bytespider` | ByteDance | ✅ Blocked |

---

## Use the outputs

```yaml
- name: Check AI crawler access
  id: crawl-check
  uses: lior-seats/crawl-check-action@v1
  with:
    url: 'https://yoursite.com'

- name: Report
  run: |
    echo "Blocked: ${{ steps.crawl-check.outputs.blocked-count }}"
    echo "Allowed: ${{ steps.crawl-check.outputs.allowed-count }}"
```

---

## Custom crawler list

```yaml
- name: Check specific crawlers only
  uses: lior-seats/crawl-check-action@v1
  with:
    url: 'https://yoursite.com'
    crawlers: 'GPTBot,ClaudeBot,PerplexityBot'
    fail-on-allowed: 'true'
```

---

## Related

- **[ai-crawler-check](https://www.npmjs.com/package/ai-crawler-check)** — the companion npm package / CLI
- **[crawl-check web tool](https://lior-seats.github.io/crawl-check/)** — check any site instantly in your browser

---

## Want real-time monitoring?

This Action checks robots.txt at deploy time. **[CrawlGuard](https://lior-seats.github.io/crawlguard-waitlist/)** monitors continuously and alerts you whenever AI crawlers gain access.

→ **[Join the CrawlGuard waitlist](https://lior-seats.github.io/crawlguard-waitlist/)**

---

## License

MIT © lior-seats
