require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const {
  UIPATH_PAT,
  UIPATH_TRIGGER_URL,
  UIPATH_JOBS_BASE,
  UIPATH_FOLDER_ID,
  PORT = 3000,
} = process.env;

for (const [k, v] of Object.entries({
  UIPATH_PAT, UIPATH_TRIGGER_URL, UIPATH_JOBS_BASE, UIPATH_FOLDER_ID,
})) {
  if (!v || v.startsWith('PASTE_')) {
    console.error(`[fatal] env var ${k} is not set. Edit your .env file.`);
    process.exit(1);
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('dashboard'));

const jobs = {};

const STAGES = [
  { name: 'generator', label: 'Generator: drafting test scenarios',   until: 6000  },
  { name: 'executor',  label: 'Executor: calling Sepolia blockchain', until: 8000  },
  { name: 'analyst',   label: 'Analyst: reviewing results',           until: 18000 },
];

function inferStage(elapsedMs) {
  for (const s of STAGES) {
    if (elapsedMs < s.until) return s;
  }
  return STAGES[STAGES.length - 1];
}

app.post('/api/run', async (req, res) => {
  const intent = (req.body && req.body.intent) || '';
  if (!intent.trim()) {
    return res.status(400).json({ error: 'intent is required' });
  }
  console.log(`[run] starting job, intent="${intent.slice(0, 60)}..."`);
  try {
    const upstream = await fetch(UIPATH_TRIGGER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UIPATH_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ intent, scenarios: [] }),
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(`[run] UiPath ${upstream.status}: ${text}`);
      return res.status(upstream.status).json({ error: 'UiPath rejected the request', detail: text });
    }
    const data = await upstream.json();
    jobs[data.id] = {
      uipathJobId: data.id,
      uipathJobKey: data.key,
      startTime: Date.now(),
      status: 'running',
      result: null,
      error: null,
    };
    console.log(`[run] queued, jobId=${data.id} key=${data.key}`);
    return res.json({ jobId: data.id });
  } catch (err) {
    console.error('[run] error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/status/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs[jobId];
  if (!job) return res.status(404).json({ error: 'unknown jobId' });
  const elapsedMs = Date.now() - job.startTime;
  if (job.status === 'complete') {
    return res.json({ stage: 'complete', elapsedMs, result: job.result });
  }
  if (job.status === 'failed') {
    return res.json({ stage: 'failed', elapsedMs, error: job.error });
  }
  if (elapsedMs >= 12000) {
    try {
      const upstream = await fetch(`${UIPATH_JOBS_BASE}(${job.uipathJobId})`, {
        headers: {
          'Authorization': `Bearer ${UIPATH_PAT}`,
          'X-UIPATH-OrganizationUnitId': UIPATH_FOLDER_ID,
        },
      });
      if (upstream.ok) {
        const data = await upstream.json();
        if (data.State === 'Successful') {
          let parsed;
          try { parsed = JSON.parse(data.OutputArguments); }
          catch (e) { parsed = { raw: data.OutputArguments, parseError: e.message }; }
          job.status = 'complete';
          job.result = parsed;
          console.log(`[status] jobId=${jobId} -> complete in ${elapsedMs}ms`);
          return res.json({ stage: 'complete', elapsedMs, result: parsed });
        }
        if (data.State === 'Faulted' || data.State === 'Stopped') {
          job.status = 'failed';
          job.error = data.Info || `Job ${data.State}`;
          console.log(`[status] jobId=${jobId} -> failed (${data.State})`);
          return res.json({ stage: 'failed', elapsedMs, error: job.error });
        }
      } else {
        console.warn(`[status] poll returned ${upstream.status}`);
      }
    } catch (err) {
      console.warn(`[status] poll error: ${err.message}`);
    }
  }
  const stage = inferStage(elapsedMs);
  return res.json({ stage: stage.name, label: stage.label, elapsedMs });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, jobsTracked: Object.keys(jobs).length, uptimeSec: Math.round(process.uptime()) });
});

app.listen(PORT, () => {
  console.log(`[ready] CryptoGateway proxy on http://localhost:${PORT}`);
  console.log(`[ready] health: http://localhost:${PORT}/api/health`);
});