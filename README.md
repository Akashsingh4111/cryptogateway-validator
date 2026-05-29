cat > README.md << 'README_EOF'
# CryptoGateway Validator

**AI-powered agentic testing for Web3 fintech payment flows.**

Type a testing intent in plain English. Two AI agents and a UiPath automation layer turn it into executable tests against the real Ethereum Sepolia testnet, then review the results and produce executive-level insights — end to end in under 20 seconds, with zero test scripts written by hand.

Built for the UiPath Test-a-Thon.

---

## Why this exists

Crypto payment gateways move billions, but QA teams have no purpose-built tooling. Existing tools (Hardhat, Foundry, Tenderly) test *smart contracts* for *developers* — none test *payment gateways* for *QA teams*. CryptoGateway Validator fills that gap with a natural-language, agent-driven approach.

## How it works

\`\`\`
English intent
   │
   ▼
┌─────────────────────────────────────────────────────────┐
│  UiPath Orchestrator (API Trigger, serverless runtime)   │
│                                                           │
│   Agent 1: GENERATOR   →  drafts test scenarios (LLM)     │
│   Executor (For Each)  →  runs each vs. live Sepolia RPC   │
│   Agent 2: ANALYST     →  reviews results, scores risk    │
└─────────────────────────────────────────────────────────┘
   │
   ▼
JSON: results + AI analysis
   │
   ▼
Node proxy  →  Dashboard (live stage animation, charts, insights)
\`\`\`

Two distinct LLM agents with separate roles coordinate through a UiPath automation layer. The Generator authors tests; the Analyst independently reviews them — and routinely catches flawed assumptions the Generator made (e.g. labeling a wallet "funded" when it holds zero balance on-chain). That author/reviewer split is the core of the system.

## Tech stack

- **UiPath Studio Web** — API Workflow, serverless runtime
- **Gemini 2.5 Flash** — both agents (Generator temp 0.7, Analyst temp 0.3)
- **Ethereum Sepolia** — live testnet via public RPC (\`eth_getBalance\`)
- **Node.js + Express** — local proxy bridging browser ↔ Orchestrator
- **Vanilla JS + Chart.js** — dashboard, no build step

## Running locally

### Prerequisites
- Node.js 18+
- A UiPath Cloud account with an API Workflow published and an API Trigger created
- A UiPath Personal Access Token (Orchestrator API Access scope)

### Setup

\`\`\`bash
npm install
cp .env.example .env
# edit .env with your trigger URL, PAT, folder ID
node server.js
\`\`\`

Open **http://localhost:3000** — the Express server serves the dashboard and proxies the API.

### Smoke test (no browser)

\`\`\`bash
./smoke-test.sh
\`\`\`

Runs health check → starts a job → polls until complete, printing each stage.

## Project structure

\`\`\`
.
├── server.js          # Express proxy: /api/run, /api/status/:id, /api/health
├── smoke-test.sh      # CLI end-to-end test
├── .env.example       # config template (no secrets)
├── dashboard/
│   ├── index.html     # 4-tab UI: Setup / Run / Results / Insights
│   ├── styles.css     # custom hacker aesthetic, no framework
│   └── app.js         # polls proxy, drives stage animation + rendering
└── README.md
\`\`\`

## Architecture notes

- **Stage progress is inferred from elapsed time**, not from UiPath telemetry — Orchestrator reports job completion as a single event, so the dashboard derives Generator/Executor/Analyst transitions from observed durations.
- The proxy holds the PAT server-side; it is never exposed to the browser.
- \`.env\` is gitignored; secrets stay local.

## Roadmap

- Orchestrator queues for parallel test execution at scale
- Multi-chain support (Polygon, BNB Chain, Arbitrum) via config
- CI/CD integration via webhooks
- Multi-tenant platform with RBAC + audit dashboards
README_EOF