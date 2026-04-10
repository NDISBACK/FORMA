const API_BASE =
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:8000'
    : 'https://forma-dtzd.onrender.com';

let _currentJobId = null;
let _chatHistory = [];
let _etaInterval = null;

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function formatSourceLabel(source) {
  const key = (source || 'community').toLowerCase();
  const labels = {
    reddit: 'Reddit',
    twitter: 'X',
    hackernews: 'Hacker News',
    producthunt: 'Product Hunt',
    github: 'GitHub',
    community: 'Community'
  };
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function populateList(ulId, items) {
  const ul = document.getElementById(ulId);
  if (!ul) return;
  ul.innerHTML = (items || []).map((t) => `<li>${esc(t)}</li>`).join('');
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function progressToStep(progress) {
  if (progress < 25) return 0;
  if (progress < 50) return 1;
  if (progress < 75) return 2;
  return 3;
}

function updateRing(pct) {
  const ring = document.getElementById('ring-fill');
  if (!ring) return;
  const radius = Number(ring.getAttribute('r')) || 68;
  const circumference = 2 * Math.PI * radius;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference * (1 - Math.min(100, Math.max(0, pct)) / 100)}`;
}

function updateProgress(pct, startTime) {
  const bar = document.getElementById('progress-fill');
  const pctEl = document.getElementById('progress-pct');
  const etaEl = document.getElementById('progress-eta');
  const elapEl = document.getElementById('progress-elapsed');

  const clamped = Math.min(100, Math.max(0, pct));
  if (bar) bar.style.width = `${clamped}%`;
  if (pctEl) pctEl.textContent = `${Math.round(clamped)}%`;
  updateRing(clamped);

  if (startTime) {
    const elapsed = Date.now() - startTime;
    if (elapEl) elapEl.textContent = `${fmtDuration(elapsed)} elapsed`;
    if (etaEl) {
      if (clamped > 5 && clamped < 100) {
        const totalEstimate = elapsed / (clamped / 100);
        const remaining = totalEstimate - elapsed;
        etaEl.textContent = `~${fmtDuration(Math.max(0, remaining))} left`;
      } else if (clamped >= 100) {
        etaEl.textContent = 'done';
      } else {
        etaEl.textContent = 'estimating…';
      }
    }
  }

  if (bar) {
    if (clamped > 0 && clamped < 100) bar.classList.add('shimmer');
    else bar.classList.remove('shimmer');
  }
}

function resetProgress() {
  updateProgress(0);
  const etaEl = document.getElementById('progress-eta');
  const elapEl = document.getElementById('progress-elapsed');
  if (etaEl) etaEl.textContent = 'estimating…';
  if (elapEl) elapEl.textContent = '0s elapsed';
}

function deriveIdeaScoresFromConfidence(a) {
  const cs = typeof a.confidence_score === 'number' ? a.confidence_score : 0.5;
  const base = Math.max(1, Math.min(10, Math.round(cs * 10)));
  return {
    market_size: base,
    competition: base,
    feasibility: base,
    timing: base,
    revenue_potential: base,
    founder_fit: base
  };
}

function clampScore100(v, fallback = 50) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeVCSubscores(a) {
  const base = clampScore100(a?.would_i_fund_score, clampScore100((a?.confidence_score || 0.5) * 100, 50));
  const raw = a?.would_i_fund_subscores || {};
  return {
    team_execution: clampScore100(raw.team_execution, base),
    market_size_quality: clampScore100(raw.market_size_quality, base),
    moat_defensibility: clampScore100(raw.moat_defensibility, base),
    traction_signals: clampScore100(raw.traction_signals, base),
    risk_profile: clampScore100(raw.risk_profile, base)
  };
}

function renderCompetitorDeepDive(compIntel) {
  const section = document.getElementById('competitor-deepdive-section');
  const listEl = document.getElementById('competitor-deepdive-list');
  if (!section || !listEl) return;

  const rows = (compIntel?.comparison_matrix || []).slice(0, 3);
  if (!rows.length) {
    section.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  section.style.display = '';
  listEl.innerHTML = rows.map((c) => {
    const threat = (c.threat_level || 'medium').toLowerCase();
    const failureModes = (c.failure_modes || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const whyFail = (c.why_they_fail || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const signals = (c.warning_signals || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const mistakes = (c.strategic_mistakes || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const evidence = (c.evidence || []).map((x) => `<li>${esc(x)}</li>`).join('');
    return `<div class="comp-detail-card">
      <div class="comp-detail-head">
        <p class="comp-detail-name">${esc(c.name || 'Unknown competitor')}</p>
        <span class="comp-detail-threat ${threat}">${esc(threat)} threat</span>
      </div>
      <div class="comp-detail-grid">
        <div><p class="comp-detail-label">How they fail</p><ul>${failureModes || '<li>No explicit failure mode identified</li>'}</ul></div>
        <div><p class="comp-detail-label">Why they fail</p><ul>${whyFail || '<li>No root-cause detail available</li>'}</ul></div>
        <div><p class="comp-detail-label">Warning signals</p><ul>${signals || '<li>No warning signals surfaced</li>'}</ul></div>
        <div><p class="comp-detail-label">Strategic mistakes</p><ul>${mistakes || '<li>No strategic mistakes listed</li>'}</ul></div>
      </div>
      <div class="comp-detail-evidence">
        <p class="comp-detail-label">Evidence</p>
        <ul>${evidence || '<li>No evidence links were returned</li>'}</ul>
      </div>
    </div>`;
  }).join('');
}

function renderVCPanel(a) {
  const panel = document.getElementById('vc-section');
  if (!panel) return;

  const score = clampScore100(a?.would_i_fund_score, clampScore100((a?.confidence_score || 0.5) * 100, 50));
  const subs = normalizeVCSubscores(a);
  const decisionRaw = String(a?.would_i_fund || '').toLowerCase();
  const decision = ['yes', 'no', 'maybe'].includes(decisionRaw)
    ? decisionRaw
    : (score >= 70 ? 'yes' : score <= 44 ? 'no' : 'maybe');
  const rationale = a?.would_i_fund_rationale || {};

  const fill = document.getElementById('vc-score-fill');
  const scoreVal = document.getElementById('vc-score-val');
  const badge = document.getElementById('vc-decision-badge');
  const overall = document.getElementById('vc-overall-rationale');
  const subsEl = document.getElementById('vc-subscores');
  const blockersEl = document.getElementById('vc-blockers');

  if (fill) fill.style.width = `${score}%`;
  if (scoreVal) scoreVal.textContent = `${score}/100`;
  if (badge) {
    badge.textContent = decision;
    badge.className = `vc-decision-badge ${decision}`;
  }
  if (overall) overall.textContent = rationale.overall || 'No VC rationale returned.';

  const subLabels = {
    team_execution: 'Team execution',
    market_size_quality: 'Market quality',
    moat_defensibility: 'Moat defensibility',
    traction_signals: 'Traction signals',
    risk_profile: 'Risk profile'
  };
  if (subsEl) {
    subsEl.innerHTML = Object.entries(subLabels).map(([key, label]) => {
      const val = subs[key];
      const reason = rationale[key] || 'No detailed rationale returned.';
      return `<div class="vc-sub-card">
        <div class="vc-sub-head"><span>${label}</span><strong>${val}</strong></div>
        <div class="vc-sub-track"><div class="vc-sub-fill" style="width:${val}%"></div></div>
        <p class="vc-sub-reason">${esc(reason)}</p>
      </div>`;
    }).join('');
  }

  const blockers = Array.isArray(rationale.why_not_fundable) ? rationale.why_not_fundable : [];
  if (blockersEl) {
    if (blockers.length) {
      blockersEl.innerHTML = `<p class="vc-blockers-label">Why not fully fundable yet</p><ul>${blockers.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    } else {
      blockersEl.innerHTML = '';
    }
  }
}

function renderImprovementSuggestions(a) {
  const panel = document.getElementById('improve-panel');
  const listEl = document.getElementById('improve-list');
  if (!panel || !listEl) return;

  const raw = Array.isArray(a?.improvement_suggestions) ? a.improvement_suggestions : [];
  if (!raw.length) {
    panel.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  panel.style.display = '';
  const effortRank = { low: 1, medium: 2, high: 3 };
  const items = raw
    .map((item, idx) => ({
      priority: Math.max(1, Math.min(5, Number(item?.priority) || (idx + 1))),
      area: String(item?.area || 'operations').toLowerCase(),
      what_to_improve: item?.what_to_improve || 'Define a concrete improvement action.',
      why_it_matters: item?.why_it_matters || 'This improves competitiveness and execution quality.',
      how_to_do_it: item?.how_to_do_it || 'Break this into milestones and validate quickly.',
      expected_impact: item?.expected_impact || 'Should improve fundability and market outcomes.',
      effort: ['low', 'medium', 'high'].includes(String(item?.effort || '').toLowerCase())
        ? String(item.effort).toLowerCase()
        : 'medium'
    }))
    .sort((a1, a2) => (a1.priority - a2.priority) || (effortRank[a1.effort] - effortRank[a2.effort]));

  listEl.innerHTML = items.map((item) => `
    <div class="improve-card">
      <div class="improve-head">
        <span class="improve-priority">Priority ${item.priority}</span>
        <span class="improve-meta">${esc(item.area)} • ${esc(item.effort)} effort</span>
      </div>
      <p class="improve-title">${esc(item.what_to_improve)}</p>
      <p class="improve-line"><strong>Why it matters:</strong> ${esc(item.why_it_matters)}</p>
      <p class="improve-line"><strong>How to do it:</strong> ${esc(item.how_to_do_it)}</p>
      <p class="improve-line"><strong>Expected impact:</strong> ${esc(item.expected_impact)}</p>
    </div>
  `).join('');
}

function sentimentLabelToScore(label) {
  const v = (label || 'neutral').toLowerCase();
  if (v === 'positive') return 0.78;
  if (v === 'negative') return 0.24;
  if (v === 'unknown') return null;
  return 0.52;
}

function renderSourceCoverage(coverage) {
  const el = document.getElementById('source-coverage');
  if (!el) return;
  if (!coverage || !coverage.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = coverage.map((item) => {
    const source = (item.source || 'community').toLowerCase();
    const label = item.label || formatSourceLabel(source);
    const count = Number(item.count || 0);
    return `<span class="source-pill ${source}">${esc(label)} <strong>${count}</strong></span>`;
  }).join('');
}

function renderSentimentPanel(sent) {
  if (!sent || !Object.keys(sent).length) {
    const panel = document.getElementById('sentiment-section');
    if (panel) panel.style.display = 'none';
    return;
  }

  const panel = document.getElementById('sentiment-section');
  if (panel) panel.style.display = '';

  setText('sentiment-summary', sent.summary);

  let score = sent.overall_sentiment_score;
  if (score != null && score !== '') {
    score = Number(score);
    if (Number.isNaN(score)) score = null;
    else if (score > 1) score = score / 100;
  } else {
    score = null;
  }
  if (score == null) {
    const r = sentimentLabelToScore(sent.reddit_sentiment);
    const t = sentimentLabelToScore(sent.twitter_sentiment);
    const parts = [r, t].filter((x) => x !== null);
    if (parts.length) score = parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  const gaugeFill = document.getElementById('sentiment-gauge-fill');
  const gaugeVal = document.getElementById('sentiment-gauge-val');
  if (gaugeFill && gaugeVal) {
    if (score == null) {
      gaugeFill.style.width = '0%';
      gaugeVal.textContent = 'N/A';
      gaugeVal.style.color = 'var(--muted)';
    } else {
      const pct = Math.round(score * 100);
      gaugeFill.style.width = `${pct}%`;
      gaugeVal.textContent = `${pct}/100`;
      gaugeVal.style.color = score > 0.62 ? '#4ade80' : score > 0.38 ? '#fbbf24' : '#f87171';
    }
  }

  function sentBadge(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = (val || 'unknown').toLowerCase();
    el.textContent = v;
    el.className = `platform-badge ${v}`;
  }
  sentBadge('reddit-sentiment', sent.reddit_sentiment);
  sentBadge('twitter-sentiment', sent.twitter_sentiment);
  renderSourceCoverage(sent.source_coverage || []);
  populateList('sent-positives', sent.key_positives);
  populateList('sent-concerns', sent.key_concerns);

  const commentsEl = document.getElementById('notable-comments');
  if (commentsEl && sent.notable_comments && sent.notable_comments.length) {
    commentsEl.innerHTML = '<p class="nc-title">Notable comments</p>' +
      sent.notable_comments.map((c) => {
        const src = (c.source || '').toLowerCase();
        const dot = (c.sentiment || 'neutral').toLowerCase();
        return `<div class="nc-card">
          <span class="nc-source ${src || 'community'}">${esc(formatSourceLabel(c.source || 'community'))}</span>
          <span class="nc-text">"${esc(c.text)}"</span>
          <span class="nc-dot ${dot}"></span>
        </div>`;
      }).join('');
  } else if (commentsEl) {
    commentsEl.innerHTML = '';
  }
}

function drawRadar(scores) {
  const card = document.getElementById('radar-card');
  if (card) card.style.display = '';
  const canvas = document.getElementById('radar-canvas');
  if (!canvas) return;
  scores = scores || {};
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = 300;
  const H = 300;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const keys = ['market_size', 'competition', 'feasibility', 'timing', 'revenue_potential', 'founder_fit'];
  const labels = ['Market Size', 'Competition', 'Feasibility', 'Timing', 'Revenue', 'Founder Fit'];
  const colors = ['#5B8CFF', '#FF4D4D', '#22FF88', '#FFD166', '#b07cd8', '#d89c4c'];
  const cx = W / 2;
  const cy = H / 2;
  const R = 110;
  const n = keys.length;

  function angleFor(i) { return (Math.PI * 2 * i) / n - Math.PI / 2; }

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 5; ring++) {
    const r = (ring / 5) * R;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angleFor(i % n);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < n; i++) {
    const a = angleFor(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }

  const vals = keys.map((k) => Math.min(10, Math.max(0, Number(scores[k]) || 0)) / 10);
  ctx.beginPath();
  vals.forEach((v, i) => {
    const a = angleFor(i);
    const x = cx + Math.cos(a) * R * v;
    const y = cy + Math.sin(a) * R * v;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(91,140,255,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(91,140,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  vals.forEach((v, i) => {
    const a = angleFor(i);
    const x = cx + Math.cos(a) * R * v;
    const y = cy + Math.sin(a) * R * v;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();

    const lx = cx + Math.cos(a) * (R + 18);
    const ly = cy + Math.sin(a) * (R + 18);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly);
  });

  const legendEl = document.getElementById('radar-legend');
  if (legendEl) {
    legendEl.innerHTML = keys.map((k, i) =>
      `<span class="radar-legend-item"><span class="radar-legend-dot" style="background:${colors[i]}"></span>${labels[i]}: <span class="radar-legend-val">${scores[k] ?? '—'}</span>/10</span>`
    ).join('');
  }
}

if (typeof mermaid !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#2a2a28',
      primaryTextColor: '#E8EAFF',
      lineColor: '#5B8CFF',
      secondaryColor: '#0A0A0F'
    }
  });
}

function renderFlowchart(mermaidCode) {
  const container = document.getElementById('flowchart-container');
  if (!container || !mermaidCode) return;

  if (typeof mermaid === 'undefined') {
    container.innerHTML = `<pre style="color:rgba(255,255,255,0.5);font-size:12px;white-space:pre-wrap">${esc(mermaidCode)}</pre>`;
    return;
  }

  const id = `fc-${Date.now()}`;
  mermaid.render(id, mermaidCode).then(({ svg }) => {
    container.innerHTML = svg;
  }).catch(() => {
    container.innerHTML = `<pre style="color:rgba(255,255,255,0.5);font-size:12px;white-space:pre-wrap">${esc(mermaidCode)}</pre>`;
  });
}

function setSlider(id, val) {
  const el = document.getElementById(id);
  if (el && val != null) {
    el.value = val;
    const disp = document.getElementById(`${id}-val`);
    if (disp) {
      if (id.includes('price')) disp.textContent = `$${val}`;
      else if (id.includes('growth') || id.includes('churn')) disp.textContent = `${val}%`;
      else disp.textContent = val;
    }
  }
}

function fmtCurrency(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function fmtNum(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function recalcSimulation() {
  const price = Number(document.getElementById('slider-price')?.value || 10);
  const users = Number(document.getElementById('slider-users')?.value || 100);
  const growth = Number(document.getElementById('slider-growth')?.value || 10) / 100;
  const churn = Number(document.getElementById('slider-churn')?.value || 5) / 100;

  function simulate(gMul, cMul, months) {
    let u = users;
    for (let m = 0; m < months; m++) {
      u = u * (1 + growth * gMul) * (1 - churn * cMul);
    }
    const mrr = Math.round(u * price);
    const bep = mrr > 5000 ? (months < 12 ? `${months} mo` : '12+ mo') : 'N/A';
    return { users: Math.round(u), mrr, bep };
  }

  const pess = simulate(0.5, 1.5, 12);
  const base = simulate(1, 1, 12);
  const opti = simulate(1.5, 0.5, 12);

  setText('pess-mrr', fmtCurrency(pess.mrr)); setText('pess-users', fmtNum(pess.users)); setText('pess-bep', pess.bep);
  setText('base-mrr', fmtCurrency(base.mrr)); setText('base-users', fmtNum(base.users)); setText('base-bep', base.bep);
  setText('opti-mrr', fmtCurrency(opti.mrr)); setText('opti-users', fmtNum(opti.users)); setText('opti-bep', opti.bep);
}

function populateReport(idea, data) {
  const a = data.analysis || data;
  const sent = data.sentiment || {};

  setText('report-title', idea);
  setText('loading-idea-title', idea);

  const score = Math.round((a.confidence_score || 0.5) * 10);
  setText('score-num', score);

  const badge = document.getElementById('verdict-badge');
  if (badge) {
    badge.textContent = a.verdict || 'N/A';
    badge.className = `verdict-badge ${(a.verdict || '').toLowerCase()}`;
  }

  const ideaScores = a.idea_scores || deriveIdeaScoresFromConfidence(a);
  drawRadar(ideaScores);

  setText('exec-summary', a.executive_summary);
  setText('market-summary', a.market_size);
  setText('target-audience', a.target_audience);
  setText('opportunity', a.go_to_market || '');
  setText('risk', (a.risk_factors || []).join(' '));

  populateList('swot-strengths', a.swot?.strengths);
  populateList('swot-weaknesses', a.swot?.weaknesses);
  populateList('swot-opportunities', a.swot?.opportunities);
  populateList('swot-threats', a.swot?.threats);

  const compEl = document.getElementById('comp-list');
  if (compEl) {
    compEl.innerHTML = (a.competitors || []).map((c) => {
      const lvl = (c.threat_level || 'medium').toLowerCase();
      return `<span class="comp-badge ${lvl}" title="${esc(c.description || '')}">${esc(c.name)}</span>`;
    }).join('');
  }

  renderCompetitorDeepDive(data.competitor_intel || {});
  renderVCPanel(a);
  renderImprovementSuggestions(a);
  renderSentimentPanel(sent);

  setText('revenue-model', a.revenue_model);
  setText('go-to-market', a.go_to_market);
  populateList('recommendations', a.recommendations);

  const investorSection = document.getElementById('investor-section');
  if (investorSection) {
    const inv = data.investor_intel;
    if (inv && Object.keys(inv).length > 0) {
      investorSection.style.display = '';
      setText('funding-landscape', inv.funding_landscape || inv.summary || '');
      const listEl = document.getElementById('investor-list');
      if (listEl) {
        let html = '';
        if (inv.similar_funded) {
          inv.similar_funded.forEach((s) => {
            html += `<div class="investor-card"><p class="investor-name">${esc(s.name || '')}</p><p class="investor-firm">${esc(s.detail || s.description || '')}</p></div>`;
          });
        }
        if (inv.active_investors) {
          inv.active_investors.forEach((i) => {
            const name = typeof i === 'string' ? i : (i.name || '');
            html += `<div class="investor-card"><p class="investor-name">${esc(name)}</p></div>`;
          });
        }
        listEl.innerHTML = html;
      }
    } else {
      investorSection.style.display = 'none';
    }
  }

  const failSection = document.getElementById('failure-section');
  if (failSection) {
    const fc = data.failure_cases;
    if (fc && Object.keys(fc).length > 0) {
      failSection.style.display = '';
      const listEl = document.getElementById('failure-list');
      if (listEl) {
        let html = '';
        const cases = fc.cases || fc.failures || [];
        cases.forEach((c) => {
          html += `<div class="failure-card"><p class="failure-name">${esc(c.name || c.company || '')}</p><p class="failure-reason">${esc(c.reason || c.description || c.lesson || '')}</p></div>`;
        });
        if (fc.summary) html += `<p style="font-size:12px;color:var(--muted);margin-top:10px">${esc(fc.summary)}</p>`;
        listEl.innerHTML = html;
      }
    } else {
      failSection.style.display = 'none';
    }
  }

  const rs = data.revenue_simulation;
  if (rs && rs.rationale) setText('rev-sim-rationale', rs.rationale);
  if (rs && rs.defaults) {
    const d = rs.defaults;
    setSlider('slider-price', d.price_per_month);
    setSlider('slider-users', d.initial_users);
    setSlider('slider-growth', d.monthly_growth_pct);
    setSlider('slider-churn', d.monthly_churn_pct);
  }
  recalcSimulation();

  if (data.flowchart_mermaid) renderFlowchart(data.flowchart_mermaid);
}

function showReportView() {
  const loading = document.getElementById('report-loading');
  const shell = document.getElementById('report-shell');
  if (loading) loading.classList.remove('visible');
  if (shell) shell.classList.add('visible');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fallbackReport() {
  return {
    analysis: {
      confidence_score: 0.67,
      verdict: 'Promising',
      executive_summary: 'The concept addresses a visible market need and has strong potential with focused distribution.',
      market_size: 'The target niche appears meaningful with room to scale into adjacent segments.',
      target_audience: 'Early-adopter professionals and mobile-first users in underserved regions.',
      swot: {
        strengths: ['Clear problem-solution fit', 'Fast MVP potential'],
        weaknesses: ['Early trust barrier', 'Unproven acquisition channel'],
        opportunities: ['Underserved user cohort', 'Strong referral potential'],
        threats: ['Incumbent feature replication', 'Rising paid CAC']
      },
      competitors: [
        { name: 'Incumbent suites', description: 'Broad products with slower UX', threat_level: 'high' },
        { name: 'Niche startups', description: 'Focused but fragmented offerings', threat_level: 'medium' },
        { name: 'Manual alternatives', description: 'Low-cost status quo options', threat_level: 'low' }
      ],
      revenue_model: 'Subscription tiers with usage-based add-ons.',
      go_to_market: 'Start with one niche segment, then expand through proof-based positioning.',
      risk_factors: ['Acquisition efficiency is uncertain in the first 3-6 months.'],
      recommendations: ['Validate pricing with 20 interviews', 'Launch with one wedge use-case', 'Instrument activation end-to-end'],
      idea_scores: { market_size: 7, competition: 6, feasibility: 8, timing: 8, revenue_potential: 7, founder_fit: 7 }
    },
    sentiment: {
      summary: 'Sentiment signals are generally positive with concerns about differentiation.',
      reddit_sentiment: 'positive',
      twitter_sentiment: 'neutral',
      overall_sentiment_score: 0.7,
      key_positives: ['Users value faster workflow', 'Strong willingness to try'],
      key_concerns: ['Crowded alternatives', 'Price sensitivity at launch']
    },
    flowchart_mermaid: 'flowchart TD\n  idea["Business Idea"] --> validate["Validate assumptions"]\n  validate --> build["Build focused MVP"]\n  build --> launch["Targeted launch"]\n  launch --> feedback["Feedback loop"]\n  feedback --> iterate["Iterate"]\n  iterate --> scale["Scale channels"]'
  };
}

async function pollJob(jobId, idea) {
  resetProgress();
  const statusMsg = document.getElementById('status-msg');
  const stepIds = ['step-1', 'step-2', 'step-3', 'step-4'];
  const startTime = Date.now();
  let lastStep = -1;

  _etaInterval = setInterval(() => {
    const bar = document.getElementById('progress-fill');
    if (bar) {
      const current = parseFloat(bar.style.width) || 0;
      updateProgress(current, startTime);
    }
  }, 1000);

  while (true) {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`);
      const job = await res.json();
      const pct = Number(job.progress || 0);
      updateProgress(pct, startTime);
      if (job.label && statusMsg) statusMsg.textContent = job.label;

      const step = progressToStep(pct);
      if (step !== lastStep) {
        stepIds.forEach((id, idx) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.classList.toggle('active', idx === step);
          el.classList.toggle('done', idx < step);
        });
        lastStep = step;
      }

      if (job.status === 'complete') {
        clearInterval(_etaInterval);
        updateProgress(100, startTime);
        let result = job.result;
        if (typeof result === 'string') {
          try { result = JSON.parse(result); } catch (e) { /* no-op */ }
        }
        populateReport(idea, result || fallbackReport());
        showReportView();
        return;
      }

      if (job.status === 'failed' || job.status === 'error') {
        clearInterval(_etaInterval);
        populateReport(idea, fallbackReport());
        if (statusMsg) statusMsg.textContent = 'Analysis service had an issue. Showing fallback report.';
        showReportView();
        return;
      }
    } catch (err) {
      clearInterval(_etaInterval);
      console.error('Polling error:', err);
      populateReport(idea, fallbackReport());
      if (statusMsg) statusMsg.textContent = 'Network issue. Showing fallback report.';
      showReportView();
      return;
    }
    await delay(2000);
  }
}

function initSliders() {
  const sliderMap = {
    'slider-price': 'slider-price-val',
    'slider-users': 'slider-users-val',
    'slider-growth': 'slider-growth-val',
    'slider-churn': 'slider-churn-val'
  };
  Object.entries(sliderMap).forEach(([sid, did]) => {
    const slider = document.getElementById(sid);
    if (!slider) return;
    slider.addEventListener('input', () => {
      const disp = document.getElementById(did);
      if (disp) {
        if (sid.includes('price')) disp.textContent = `$${slider.value}`;
        else if (sid.includes('growth') || sid.includes('churn')) disp.textContent = `${slider.value}%`;
        else disp.textContent = slider.value;
      }
      recalcSimulation();
    });
  });
}

function initFlowchartModal() {
  const panel = document.getElementById('flowchart-panel');
  const modal = document.getElementById('fc-modal');
  const backdrop = document.getElementById('fc-modal-backdrop');
  const closeBtn = document.getElementById('fc-close-btn');
  const zoomIn = document.getElementById('fc-zoom-in');
  const zoomOut = document.getElementById('fc-zoom-out');
  const zoomReset = document.getElementById('fc-zoom-reset');
  const content = document.getElementById('fc-modal-content');
  if (!panel || !modal) return;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;

  function applyTransform() {
    const svg = content?.querySelector('svg');
    if (svg) svg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function openModal() {
    const src = document.getElementById('flowchart-container');
    if (!src || !content) return;
    const svg = src.querySelector('svg');
    content.innerHTML = '';
    if (svg) {
      const clone = svg.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.transformOrigin = '0 0';
      content.appendChild(clone);
    } else {
      content.innerHTML = src.innerHTML;
    }
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  panel.addEventListener('click', (e) => {
    if (e.target.closest('.fc-expand-btn') || e.target === panel || e.target.closest('.flowchart-header') || e.target.closest('.flowchart-container')) {
      openModal();
    }
  });
  if (backdrop) backdrop.addEventListener('click', closeModal);
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });

  if (content) {
    content.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      content.classList.add('fc-dragging');
    });
    content.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    });
    content.addEventListener('mouseup', () => { dragging = false; content.classList.remove('fc-dragging'); });
    content.addEventListener('mouseleave', () => { dragging = false; content.classList.remove('fc-dragging'); });
    content.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.min(5, Math.max(0.2, scale * delta));
      applyTransform();
    }, { passive: false });
  }

  if (zoomIn) zoomIn.addEventListener('click', (e) => { e.stopPropagation(); scale = Math.min(5, scale * 1.25); applyTransform(); });
  if (zoomOut) zoomOut.addEventListener('click', (e) => { e.stopPropagation(); scale = Math.max(0.2, scale / 1.25); applyTransform(); });
  if (zoomReset) zoomReset.addEventListener('click', (e) => { e.stopPropagation(); scale = 1; panX = 0; panY = 0; applyTransform(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
}

function scrollChatIntoView() {
  const section = document.getElementById('report-chat-section');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');
  if (!input || !messages) return;

  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = text;
  messages.appendChild(userBubble);
  scrollChatIntoView();

  _chatHistory.push({ role: 'user', content: text });

  const typingBubble = document.createElement('div');
  typingBubble.className = 'chat-bubble assistant typing';
  typingBubble.textContent = '';
  messages.appendChild(typingBubble);
  scrollChatIntoView();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: _currentJobId,
        message: text,
        history: _chatHistory
      })
    });
    const data = await res.json();
    const reply = data.reply || data.response || 'No response.';
    const typingEl = messages.querySelector('.typing');
    if (typingEl) typingEl.remove();

    _chatHistory.push({ role: 'assistant', content: reply });
    const replyBubble = document.createElement('div');
    replyBubble.className = 'chat-bubble assistant';
    replyBubble.textContent = reply;
    messages.appendChild(replyBubble);
    scrollChatIntoView();
  } catch (err) {
    const typingEl = messages.querySelector('.typing');
    if (typingEl) typingEl.remove();

    const errBubble = document.createElement('div');
    errBubble.className = 'chat-bubble assistant';
    errBubble.textContent = 'Failed to get a response. Please try again.';
    messages.appendChild(errBubble);
    scrollChatIntoView();
  }
}

function exportPDF() {
  if (!_currentJobId) return;
  window.open(`${API_BASE}/export/${_currentJobId}/pdf`, '_blank');
}

function resetToHome() {
  window.location.href = 'index.html#analyse';
}

function initDotCanvas() {
  const canvas = document.getElementById('dot-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let raf;
  const dots = [];
  const dotCount = 120;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedDots() {
    dots.length = 0;
    for (let i = 0; i < dotCount; i++) {
      dots.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: Math.random() * 1.7 + 0.3
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    dots.forEach((d) => {
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < -5) d.x = window.innerWidth + 5;
      if (d.x > window.innerWidth + 5) d.x = -5;
      if (d.y < -5) d.y = window.innerHeight + 5;
      if (d.y > window.innerHeight + 5) d.y = -5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(91,140,255,0.25)';
      ctx.fill();
    });
    raf = requestAnimationFrame(frame);
  }

  resize();
  seedDots();
  frame();
  window.addEventListener('resize', () => {
    resize();
    seedDots();
  });
  window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));
}

function initAuroraCanvas() {
  const canvas = document.getElementById('report-aurora-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let raf;
  let t = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    t += 0.004;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const gradA = ctx.createRadialGradient(
      window.innerWidth * (0.2 + Math.sin(t) * 0.05),
      window.innerHeight * (0.25 + Math.cos(t * 1.3) * 0.05),
      20,
      window.innerWidth * 0.2,
      window.innerHeight * 0.25,
      window.innerWidth * 0.65
    );
    gradA.addColorStop(0, 'rgba(91,140,255,0.24)');
    gradA.addColorStop(1, 'rgba(91,140,255,0)');
    ctx.fillStyle = gradA;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const gradB = ctx.createRadialGradient(
      window.innerWidth * (0.78 + Math.sin(t * 0.8) * 0.04),
      window.innerHeight * (0.15 + Math.cos(t * 1.1) * 0.03),
      20,
      window.innerWidth * 0.78,
      window.innerHeight * 0.15,
      window.innerWidth * 0.55
    );
    gradB.addColorStop(0, 'rgba(99,102,241,0.18)');
    gradB.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = gradB;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    raf = requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', resize);
  window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));
}

function setupChatEnterKey() {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput) return;
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
}


function setupReportTabs() {
  const links = Array.from(document.querySelectorAll('.report-tabs a[href^="#"]'));
  if (!links.length) return;
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('href');
      const target = id ? document.querySelector(id) : null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

async function bootstrap() {
  initDotCanvas();
  initAuroraCanvas();
  initSliders();
  setupChatEnterKey();
  initFlowchartModal();
  setupReportTabs();
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('job_id');
  const idea = params.get('idea');

  if (!jobId) {
    window.location.href = 'index.html#analyse';
    return;
  }

  _currentJobId = jobId;
  setText('loading-idea-title', idea || 'Analysing your idea');
  await pollJob(jobId, idea || 'Your idea');
}

window.sendChat = sendChat;
window.exportPDF = exportPDF;
window.resetToHome = resetToHome;

document.addEventListener('DOMContentLoaded', bootstrap);
