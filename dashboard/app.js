
const PROXY = '';  // same-origin: served by Express itself
const POLL_MS = 800;
const AGENTS = ['generator', 'executor', 'analyst'];

const SUGGESTION_TEXTS = {
  balance: 'Test ETH wallet balance retrieval on Ethereum Sepolia testnet for a crypto payment gateway. Generate 3 diverse scenarios including happy path, failure cases, and edge cases.',
  gas: 'Test gas estimation reliability on Ethereum Sepolia for a crypto payment gateway. Cover normal sends, contract calls, and intentionally underfunded scenarios. Generate 3 scenarios.',
  address: 'Test wallet address validation logic for a crypto payment gateway on Sepolia. Cover valid EOA addresses, contract addresses, and malformed inputs. Generate 3 scenarios.',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const tabs = $$('.tab');
const panels = $$('.panel');
const intentInput = $('#intent');
const runBtn = $('#runBtn');
const proxyStatus = $('#proxyStatus');
const runAgainBtn = $('#runAgainBtn');
const timelineFill = $('#timelineFill');
const timelineElapsed = $('#timelineElapsed');
const timelineStage = $('#timelineStage');

async function checkProxy() {
  try {
    const r = await fetch(`${PROXY}/api/health`);
    if (!r.ok) throw new Error(r.status);
    proxyStatus.dataset.state = 'ok';
    proxyStatus.querySelector('.meta-text').textContent = 'PROXY // LIVE';
  } catch (err) {
    proxyStatus.dataset.state = 'bad';
    proxyStatus.querySelector('.meta-text').textContent = 'PROXY // OFFLINE';
  }
}
checkProxy();
setInterval(checkProxy, 8000);

function setActiveTab(name) {
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}
function unlockTab(name) {
  const tab = [...tabs].find((t) => t.dataset.tab === name);
  if (tab) tab.disabled = false;
}
function markTabComplete(name) {
  const tab = [...tabs].find((t) => t.dataset.tab === name);
  if (tab) tab.classList.add('complete');
}
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.disabled) return;
    setActiveTab(tab.dataset.tab);
  });
});

$$('.suggestion').forEach((btn) => {
  btn.addEventListener('click', () => {
    intentInput.value = SUGGESTION_TEXTS[btn.dataset.sug] || '';
    intentInput.focus();
  });
});

function resetAgents() {
  AGENTS.forEach((a) => {
    const card = document.querySelector(`.agent-card[data-agent="${a}"]`);
    card.classList.remove('active', 'complete');
    card.querySelector('.agent-status').textContent = '— idle';
  });
}
function setAgentState(name, state) {
  const card = document.querySelector(`.agent-card[data-agent="${name}"]`);
  if (!card) return;
  card.classList.remove('active', 'complete');
  card.classList.add(state);
  const status = card.querySelector('.agent-status');
  if (state === 'active') status.textContent = 'working…';
  else if (state === 'complete') status.textContent = 'done';
  else status.textContent = '— idle';
}
const stageReachedAt = {};
function advanceAgentsTo(stage) {
  const now = Date.now();
  if (!stageReachedAt[stage]) stageReachedAt[stage] = now;
  const order = ['generator', 'executor', 'analyst'];
  const idx = order.indexOf(stage);
  if (idx === -1) return;
  for (let i = 0; i < idx; i++) setAgentState(order[i], 'complete');
  setAgentState(order[idx], 'active');
}

const TIMELINE_BUDGET_MS = 18000;
function updateTimeline(elapsedMs, stageLabel) {
  const pct = Math.min(100, (elapsedMs / TIMELINE_BUDGET_MS) * 100);
  timelineFill.style.width = `${pct}%`;
  timelineElapsed.textContent = `${(elapsedMs / 1000).toFixed(1)}s`;
  timelineStage.textContent = stageLabel || '';
}

let resultsChart = null;
function renderResults(result) {
  const total = result.total_scenarios || result.results.length;
  const passes = result.results.filter((r) => r.status === 'PASSED').length;
  const fails = result.results.filter((r) => r.status === 'FAILED').length;
  $('#statTotal').textContent = total;
  $('#statPass').textContent = passes;
  $('#statFail').textContent = fails;
  const ctx = document.getElementById('resultsChart').getContext('2d');
  if (resultsChart) resultsChart.destroy();
  resultsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Passed', 'Failed'],
      datasets: [{
        data: [passes, fails],
        backgroundColor: ['#00ffd0', '#ff006e'],
        borderColor: '#110d22',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: { labels: { color: '#8a82b3', font: { family: 'JetBrains Mono', size: 11 }, boxWidth: 10, padding: 16 } },
        tooltip: { backgroundColor: '#07050d', borderColor: '#1f1a36', borderWidth: 1, titleFont: { family: 'JetBrains Mono', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 12 } },
      },
    },
  });
  const list = $('#resultsList');
  list.innerHTML = '';
  result.results.forEach((r) => {
    const card = document.createElement('div');
    card.className = `result-card ${r.status === 'PASSED' ? 'pass' : 'fail'}`;
    const balance = r.balance_hex
      ? `<div class="result-balance">${r.balance_hex.slice(0, 20)}${r.balance_hex.length > 20 ? '…' : ''}</div>`
      : `<div class="result-balance error">no balance</div>`;
    card.innerHTML = `<div class="result-badge ${r.status === 'PASSED' ? 'pass' : 'fail'}">${r.status}</div><div><div class="result-scenario">${escapeHtml(r.scenario)}</div><div class="result-wallet">${escapeHtml(r.wallet_tested)}</div></div>${balance}`;
    list.appendChild(card);
  });
}

function renderInsights(analysis) {
  if (!analysis) { $('#executiveSummary').textContent = 'No analysis returned.'; return; }
  const healthEl = $('#overallHealth');
  const riskEl = $('#riskAssessment');
  healthEl.textContent = (analysis.overall_health || '—').toUpperCase();
  healthEl.className = `verdict-value ${(analysis.overall_health || '').toLowerCase()}`;
  riskEl.textContent = (analysis.risk_assessment || '—').toUpperCase();
  riskEl.className = `verdict-value ${(analysis.risk_assessment || '').toLowerCase()}`;
  $('#executiveSummary').textContent = analysis.executive_summary || '—';
  $('#passRateSummary').textContent = analysis.pass_rate_summary || '—';
  const findingsUl = $('#criticalFindings');
  findingsUl.innerHTML = '';
  (analysis.critical_findings || []).forEach((f) => { const li = document.createElement('li'); li.textContent = f; findingsUl.appendChild(li); });
  const recsUl = $('#recommendations');
  recsUl.innerHTML = '';
  (analysis.recommendations || []).forEach((r) => { const li = document.createElement('li'); li.textContent = r; recsUl.appendChild(li); });
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function runValidation() {
  const intent = intentInput.value.trim();
  if (!intent) { intentInput.focus(); return; }
  resetAgents();
  updateTimeline(0, 'connecting…');
  unlockTab('run');
  setActiveTab('run');
  runBtn.disabled = true;
  runBtn.querySelector('.run-btn-label').textContent = 'RUNNING…';
  Object.keys(stageReachedAt).forEach((k) => delete stageReachedAt[k]);

  let jobId;
  try {
    const r = await fetch(`${PROXY}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    });
    if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.error || `Proxy returned ${r.status}`); }
    const data = await r.json();
    jobId = data.jobId;
  } catch (err) { showError(`Failed to start job: ${err.message}`); resetRunButton(); return; }

  const poll = async () => {
    try {
      const r = await fetch(`${PROXY}/api/status/${jobId}`);
      if (!r.ok) throw new Error(`Status ${r.status}`);
      const data = await r.json();
      updateTimeline(data.elapsedMs || 0, data.label || data.stage);
      const localStage = pickLocalStage(data.stage, data.elapsedMs || 0);
      advanceAgentsTo(localStage);
      if (data.stage === 'complete') {
        AGENTS.forEach((a) => setAgentState(a, 'complete'));
        markTabComplete('run');
        unlockTab('results');
        unlockTab('insights');
        renderResults(data.result);
        renderInsights(data.result && data.result.ai_analysis);
        setTimeout(() => { setActiveTab('results'); markTabComplete('results'); }, 900);
        resetRunButton();
        return;
      }
      if (data.stage === 'failed') { showError(`Workflow failed: ${data.error || 'unknown'}`); resetRunButton(); return; }
      setTimeout(poll, POLL_MS);
    } catch (err) { showError(`Polling error: ${err.message}`); resetRunButton(); }
  };
  setTimeout(poll, POLL_MS);
}

function pickLocalStage(serverStage, elapsedMs) {
  if (serverStage === 'complete' || serverStage === 'failed') return serverStage;
  const order = ['generator', 'executor', 'analyst'];
  const serverIdx = order.indexOf(serverStage);
  let localIdx = 0;
  if (elapsedMs >= 3000) localIdx = 1;
  if (elapsedMs >= 6000) localIdx = 2;
  const idx = Math.max(serverIdx, localIdx);
  return order[Math.max(0, idx)];
}

function showError(msg) { console.error(msg); timelineStage.textContent = msg; timelineStage.style.color = 'var(--magenta)'; }
function resetRunButton() { runBtn.disabled = false; runBtn.querySelector('.run-btn-label').textContent = 'EXECUTE VALIDATION'; }

runBtn.addEventListener('click', runValidation);
runAgainBtn.addEventListener('click', () => {
  setActiveTab('setup');
  tabs.forEach((t) => { if (['run', 'results', 'insights'].includes(t.dataset.tab)) { t.disabled = true; t.classList.remove('complete'); } });
  resetAgents();
  updateTimeline(0, 'awaiting…');
  timelineStage.style.color = '';
});
intentInput.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runBtn.click(); } });
