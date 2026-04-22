/* ═══════════════════════════════════════════════════════
   PaperMind — app.js
   Concept extraction + force-directed concept map
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────
const state = {
  nodes: [],
  edges: [],
  filtered: [],
  analysis: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: null,
  dragOffX: 0,
  dragOffY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartPanX: 0,
  panStartPanY: 0,
  hoveredNode: null,
  animFrame: null,
};

// ── View switching ─────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  const buttons = { upload: 0, map: 1, summary: 2 };
  document.querySelectorAll('.pill')[buttons[id]].classList.add('active');
  if (id === 'map') renderMap();
}

// ── Demo paper ─────────────────────────────────────────
function loadDemo() {
  document.getElementById('pasteText').value = `Title: Attention Is All You Need

Abstract:
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU. On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs, a small fraction of the training costs of the best models from the literature. We show the Transformer generalizes well to other tasks by applying it successfully to English constituency parsing with both large and limited training data.

1. Introduction
Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation. Numerous efforts have since continued to push the boundaries of recurrent language models and encoder-decoder architectures.

2. Model Architecture
The Transformer follows an encoder-decoder structure using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder. The encoder maps an input sequence of symbol representations to a sequence of continuous representations. Given z, the decoder then generates an output sequence of symbols one element at a time. Multi-Head Attention allows the model to jointly attend to information from different representation subspaces at different positions. Scaled Dot-Product Attention computes the dot products of the query with all keys, divide each by sqrt(d_k), and apply a softmax function to obtain the weights on the values.

3. Results
On the WMT 2014 English-to-German translation task, the big transformer model outperforms the best previously reported models including ensembles by more than 2.0 BLEU, establishing a new state-of-the-art BLEU score of 28.4. The big transformer model achieves 41.0 BLEU on the WMT 2014 English-to-French translation task.`;
}

// ── Analyze ────────────────────────────────────────────
function analyze() {
  const text = document.getElementById('pasteText').value.trim();
  if (!text) { alert('Please paste some paper text or load the demo.'); return; }

  showLoading();
  simulateProgress(() => {
    const analysis = extractConcepts(text);
    state.analysis = analysis;
    buildGraph(analysis);
    populateSummary(analysis);
    hideLoading();
    enableMapButtons();
    showView('map');
  });
}

// ── Loading simulation ─────────────────────────────────
const loadingMessages = [
  'Extracting concepts…',
  'Building knowledge graph…',
  'Identifying relationships…',
  'Computing layout…',
  'Rendering concept map…',
];

function showLoading() {
  document.getElementById('loadingOverlay').classList.remove('hidden');
  let step = 0;
  const fill = document.getElementById('progressFill');
  const status = document.getElementById('loadingStatus');

  state.loadingInterval = setInterval(() => {
    step++;
    status.textContent = loadingMessages[Math.min(step, loadingMessages.length - 1)];
    fill.style.width = Math.min(step * 22, 95) + '%';
  }, 450);
}

function hideLoading() {
  clearInterval(state.loadingInterval);
  document.getElementById('progressFill').style.width = '100%';
  setTimeout(() => {
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('progressFill').style.width = '0%';
  }, 400);
}

// ── Concept Extraction (NLP-lite, no API) ──────────────
function extractConcepts(text) {
  const title = extractTitle(text);
  const sentences = text.split(/[.!?]\s+/);

  // Stop words
  const STOP = new Set(['the','a','an','and','or','but','in','on','at','to','for',
    'of','with','by','from','as','is','was','are','were','be','been','being',
    'have','has','had','do','does','did','will','would','could','should','may',
    'might','shall','can','not','no','nor','so','yet','both','either','each',
    'few','more','most','other','into','through','during','before','after',
    'above','below','between','out','off','over','under','again','then','once',
    'their','they','them','these','those','this','that','its','our','we','us',
    'it','i','you','he','she','his','her','our','your','my','which','who','show',
    'show','also','using','such','two','one','three','all','both','while','when',
    'where','how','what','there','here','than','about','well','new','different',
    'based','include','including','model','models','task','tasks','paper']);

  // Extract noun phrases (2-3 word combos that recur + single important nouns)
  const wordMap = {};
  const phraseMap = {};
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 3 || STOP.has(w)) continue;
    wordMap[w] = (wordMap[w] || 0) + 1;

    if (i + 1 < words.length) {
      const w2 = words[i + 1];
      if (!STOP.has(w2) && w2.length > 2) {
        const phrase = w + ' ' + w2;
        phraseMap[phrase] = (phraseMap[phrase] || 0) + 1;
      }
    }
    if (i + 2 < words.length) {
      const w2 = words[i + 1], w3 = words[i + 2];
      if (!STOP.has(w2) && !STOP.has(w3) && w2.length > 2 && w3.length > 2) {
        const phrase = w + ' ' + w2 + ' ' + w3;
        phraseMap[phrase] = (phraseMap[phrase] || 0) + 1;
      }
    }
  }

  // Pick top phrases + single words
  const topPhrases = Object.entries(phraseMap)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);

  const topWords = Object.entries(wordMap)
    .filter(([k, c]) => c >= 2 && !topPhrases.some(p => p.includes(k)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([k]) => k);

  // Category assignment heuristics
  const METHOD_KW = ['attention','layer','encoder','decoder','network','algorithm','method','approach','architecture','mechanism','learning','training','model','transformer','recurrence','convolution','softmax','embedding','feedforward','gradient','dropout','normalization'];
  const RESULT_KW = ['bleu','accuracy','performance','score','outperform','state-of-the-art','improvement','benchmark','results','achieve','surpass','superior','best','new','less','faster'];
  const ENTITY_KW = ['wmt','gpu','english','german','french','byte','token','vocabulary','dataset','corpus'];

  function categorize(term) {
    const t = term.toLowerCase();
    if (ENTITY_KW.some(k => t.includes(k))) return 'entity';
    if (RESULT_KW.some(k => t.includes(k)))  return 'result';
    if (METHOD_KW.some(k => t.includes(k)))  return 'method';
    return 'concept';
  }

  // Build concept list
  const allTerms = [...topPhrases, ...topWords].slice(0, 20);
  const concepts = allTerms.map((term, i) => ({
    id: i,
    label: capitalizePhrase(term),
    category: categorize(term),
    frequency: (phraseMap[term] || wordMap[term] || 1),
    description: findBestSentence(term, sentences),
  }));

  // Edge extraction: co-occurrence within same sentence
  const edges = [];
  sentences.forEach(sent => {
    const low = sent.toLowerCase();
    const present = concepts.filter(c => low.includes(c.label.toLowerCase()));
    for (let a = 0; a < present.length; a++) {
      for (let b = a + 1; b < present.length; b++) {
        const existing = edges.find(e =>
          (e.source === present[a].id && e.target === present[b].id) ||
          (e.source === present[b].id && e.target === present[a].id)
        );
        if (existing) { existing.weight++; }
        else { edges.push({ source: present[a].id, target: present[b].id, weight: 1, label: inferRelation(present[a], present[b]) }); }
      }
    }
  });

  // Key terms for summary
  const keyTerms = [...topWords.slice(0, 8), ...topPhrases.slice(0, 6)];

  // Build methodology & result highlights
  const methods = sentences.filter(s => METHOD_KW.some(k => s.toLowerCase().includes(k))).slice(0, 4).map(s => s.trim().slice(0, 120) + '…');
  const results = sentences.filter(s => RESULT_KW.some(k => s.toLowerCase().includes(k))).slice(0, 4).map(s => s.trim().slice(0, 120) + '…');

  // Core contribution (longest abstract-like sentence)
  const core = sentences.sort((a, b) => b.length - a.length)[0]?.trim().slice(0, 220) + '…' || 'See the full paper.';

  return { title, concepts, edges, keyTerms, methods, results, core };
}

function extractTitle(text) {
  const m = text.match(/title:\s*(.+)/i) || text.match(/^(.{10,100})\n/);
  return m ? m[1].trim() : 'Research Paper Analysis';
}

function capitalizePhrase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function findBestSentence(term, sentences) {
  const match = sentences.find(s => s.toLowerCase().includes(term.toLowerCase()));
  return match ? match.trim().slice(0, 160) + (match.length > 160 ? '…' : '') : 'Key concept identified in the paper.';
}

function inferRelation(a, b) {
  const labels = ['relates to', 'enables', 'uses', 'improves', 'builds on', 'competes with', 'integrates with', 'extends'];
  return labels[(a.id + b.id) % labels.length];
}

// ── Graph Building ─────────────────────────────────────
function buildGraph(analysis) {
  const canvas = document.getElementById('conceptCanvas');
  const W = canvas.parentElement.clientWidth;
  const H = canvas.parentElement.clientHeight;

  // Place nodes in circle initially
  state.nodes = analysis.concepts.map((c, i) => {
    const angle = (2 * Math.PI * i) / analysis.concepts.length;
    const r = Math.min(W, H) * 0.32;
    return {
      ...c,
      x: W / 2 + r * Math.cos(angle),
      y: H / 2 + r * Math.sin(angle),
      vx: 0, vy: 0,
      radius: 18 + Math.min(c.frequency * 3, 20),
      visible: true,
    };
  });
  state.edges = analysis.edges;
  state.filtered = [...state.nodes];
  state.zoom = 1; state.panX = 0; state.panY = 0;

  document.getElementById('nodeCount').textContent = `${state.nodes.length} nodes · ${state.edges.length} links`;
  runSimulation();
}

// ── Force-directed simulation ──────────────────────────
function runSimulation() {
  let alpha = 1;

  function tick() {
    if (alpha < 0.005) { renderMap(); return; }
    alpha *= 0.97;

    const nodes = state.nodes;
    const canvas = document.getElementById('conceptCanvas');
    const W = canvas.parentElement.clientWidth;
    const H = canvas.parentElement.clientHeight;

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (3000 / (dist * dist)) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }

    // Attraction along edges
    state.edges.forEach(e => {
      const s = nodes[e.source]; const t = nodes[e.target];
      if (!s || !t) return;
      const dx = t.x - s.x; const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = 180;
      const force = (dist - ideal) * 0.04 * alpha;
      const fx = (dx / dist) * force; const fy = (dy / dist) * force;
      s.vx += fx; s.vy += fy;
      t.vx -= fx; t.vy -= fy;
    });

    // Center gravity
    nodes.forEach(n => {
      n.vx += (W / 2 - n.x) * 0.008 * alpha;
      n.vy += (H / 2 - n.y) * 0.008 * alpha;
    });

    // Apply & dampen
    nodes.forEach(n => {
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(n.radius + 10, Math.min(W - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(H - n.radius - 10, n.y));
    });

    renderMap();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ── Canvas rendering ───────────────────────────────────
const COLORS = {
  concept: { fill: '#1a2d5a', stroke: '#4f8ef7', glow: '#4f8ef7' },
  method:  { fill: '#2d1a5a', stroke: '#a78bfa', glow: '#a78bfa' },
  result:  { fill: '#0f3028', stroke: '#34d399', glow: '#34d399' },
  entity:  { fill: '#3a2200', stroke: '#f59e0b', glow: '#f59e0b' },
};

function renderMap() {
  const canvas = document.getElementById('conceptCanvas');
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width  = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  const visNodes = state.nodes.filter(n => n.visible);

  // Draw edges
  state.edges.forEach(e => {
    const s = state.nodes[e.source]; const t = state.nodes[e.target];
    if (!s || !t || !s.visible || !t.visible) return;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = `rgba(79,142,247,${Math.min(e.weight * 0.12 + 0.08, 0.35)})`;
    ctx.lineWidth = Math.min(e.weight * 0.8 + 0.5, 3);
    ctx.stroke();

    // Midpoint label
    if (e.weight > 1) {
      const mx = (s.x + t.x) / 2; const my = (s.y + t.y) / 2;
      ctx.font = '9px Inter';
      ctx.fillStyle = 'rgba(100,116,139,0.7)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.label, mx, my);
    }
  });

  // Draw nodes
  visNodes.forEach(n => {
    const c = COLORS[n.category] || COLORS.concept;
    const isHovered = n === state.hoveredNode;

    // Glow
    if (isHovered) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.restore();
    }

    // Circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius + (isHovered ? 4 : 0), 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    ctx.stroke();

    // Label
    const maxLen = 14;
    const label = n.label.length > maxLen ? n.label.slice(0, maxLen) + '…' : n.label;
    ctx.font = `${isHovered ? 600 : 500} ${Math.max(9, Math.min(n.radius * 0.55, 13))}px Inter`;
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, n.x, n.y);
  });

  ctx.restore();
}

// ── Canvas interactions ────────────────────────────────
function initCanvasEvents() {
  const canvas = document.getElementById('conceptCanvas');

  // Mouse move — hover + drag
  canvas.addEventListener('mousemove', e => {
    const pos = canvasPos(e);
    if (state.dragging) {
      state.dragging.x = pos.x + state.dragOffX;
      state.dragging.y = pos.y + state.dragOffY;
      renderMap(); return;
    }
    if (state.isPanning) {
      state.panX = state.panStartPanX + (e.clientX - state.panStartX);
      state.panY = state.panStartPanY + (e.clientY - state.panStartY);
      renderMap(); return;
    }

    const hit = hitTest(pos);
    state.hoveredNode = hit || null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    showTooltip(hit, e);
    renderMap();
  });

  canvas.addEventListener('mousedown', e => {
    const pos = canvasPos(e);
    const hit = hitTest(pos);
    if (hit) {
      state.dragging = hit;
      state.dragOffX = hit.x - pos.x;
      state.dragOffY = hit.y - pos.y;
      canvas.style.cursor = 'grabbing';
    } else {
      state.isPanning = true;
      state.panStartX = e.clientX; state.panStartY = e.clientY;
      state.panStartPanX = state.panX; state.panStartPanY = state.panY;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mouseup', () => {
    state.dragging = null; state.isPanning = false;
    canvas.style.cursor = state.hoveredNode ? 'pointer' : 'grab';
  });

  canvas.addEventListener('mouseleave', () => {
    state.dragging = null; state.isPanning = false;
    hideTooltip();
    state.hoveredNode = null;
    renderMap();
  });

  // Wheel zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    state.zoom = Math.max(0.3, Math.min(3, state.zoom * factor));
    renderMap();
  }, { passive: false });
}

function canvasPos(e) {
  const canvas = document.getElementById('conceptCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - state.panX) / state.zoom,
    y: (e.clientY - rect.top  - state.panY) / state.zoom,
  };
}

function hitTest(pos) {
  return state.nodes.find(n => n.visible && Math.hypot(n.x - pos.x, n.y - pos.y) <= n.radius + 4) || null;
}

// ── Tooltip ────────────────────────────────────────────
function showTooltip(node, e) {
  const tt = document.getElementById('nodeTooltip');
  if (!node) { tt.classList.add('hidden'); return; }
  const catLabels = { concept: 'Core Concept', method: 'Method', result: 'Result', entity: 'Entity' };
  const catColors = { concept: '#4f8ef7', method: '#a78bfa', result: '#34d399', entity: '#f59e0b' };
  tt.innerHTML = `
    <div class="tt-cat" style="color:${catColors[node.category]}">${catLabels[node.category]}</div>
    <h4>${node.label}</h4>
    <p>${node.description}</p>`;
  const container = document.getElementById('view-map');
  const cr = container.getBoundingClientRect();
  let left = e.clientX - cr.left + 14;
  let top  = e.clientY - cr.top  + 14;
  tt.classList.remove('hidden');
  if (left + 270 > cr.width)  left = left - 280 - 28;
  if (top  + 150 > cr.height) top  = top  - 160;
  tt.style.left = left + 'px';
  tt.style.top  = top  + 'px';
}

function hideTooltip() {
  document.getElementById('nodeTooltip').classList.add('hidden');
}

// ── Toolbar controls ───────────────────────────────────
function zoomIn()     { state.zoom = Math.min(3, state.zoom * 1.2);    renderMap(); }
function zoomOut()    { state.zoom = Math.max(0.3, state.zoom * 0.82); renderMap(); }
function resetZoom()  { state.zoom = 1; state.panX = 0; state.panY = 0; renderMap(); }

function filterByCategory() {
  const val = document.getElementById('filterSelect').value;
  state.nodes.forEach(n => { n.visible = val === 'all' || n.category === val; });
  const vis = state.nodes.filter(n => n.visible);
  document.getElementById('nodeCount').textContent = `${vis.length} nodes · ${state.edges.length} links`;
  renderMap();
}

function searchNodes() {
  const q = document.getElementById('searchNode').value.trim().toLowerCase();
  state.nodes.forEach(n => {
    n.visible = !q || n.label.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);
  });
  renderMap();
}

// ── Export ─────────────────────────────────────────────
function exportMap() {
  const canvas = document.getElementById('conceptCanvas');
  const link = document.createElement('a');
  link.download = 'concept-map.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Populate Summary ───────────────────────────────────
function populateSummary(analysis) {
  document.getElementById('paperTitle').textContent = analysis.title;

  // Meta tags
  const cats = {};
  analysis.concepts.forEach(c => { cats[c.category] = (cats[c.category] || 0) + 1; });
  document.getElementById('summaryMeta').innerHTML =
    Object.entries(cats).map(([k, v]) => `<span class="meta-tag">${v} ${k}s</span>`).join('');

  document.getElementById('coreContrib').textContent = analysis.core;

  document.getElementById('methodList').innerHTML =
    (analysis.methods.length ? analysis.methods : ['No explicit methodology section detected.']).map(m => `<li>${m}</li>`).join('');

  document.getElementById('resultList').innerHTML =
    (analysis.results.length ? analysis.results : ['No explicit results section detected.']).map(r => `<li>${r}</li>`).join('');

  document.getElementById('termTags').innerHTML =
    analysis.keyTerms.map(t => `<span class="tag">${capitalizePhrase(t)}</span>`).join('');

  const topEdges = [...analysis.edges].sort((a, b) => b.weight - a.weight).slice(0, 10);
  document.getElementById('relationshipList').innerHTML =
    topEdges.map(e => {
      const s = analysis.concepts[e.source]?.label || '–';
      const t = analysis.concepts[e.target]?.label || '–';
      return `<div class="relation-item">
        <span class="rel-source">${s}</span>
        <span class="rel-arrow">──</span>
        <span class="rel-label">${e.label}</span>
        <span class="rel-arrow">──▶</span>
        <span class="rel-target">${t}</span>
      </div>`;
    }).join('');
}

function capitalizePhrase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Enable nav buttons ─────────────────────────────────
function enableMapButtons() {
  document.getElementById('mapBtn').disabled = false;
  document.getElementById('summaryBtn').disabled = false;
}

// ── File upload ────────────────────────────────────────
function initFileUpload() {
  const area = document.getElementById('uploadArea');
  const input = document.getElementById('fileInput');

  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });

  input.addEventListener('change', () => { if (input.files[0]) readFile(input.files[0]); });
  area.addEventListener('click', () => input.click());
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    document.getElementById('pasteText').value = evt.target.result.slice(0, 8000);
    analyze();
  };
  if (file.type === 'application/pdf') {
    // Can't parse PDF natively; show prompt
    alert('PDF parsing requires a library. For now, paste the paper text directly. (PDF support coming soon!)');
  } else {
    reader.readAsText(file);
  }
}

// ── Simulate progress delay  ───────────────────────────
function simulateProgress(cb) { setTimeout(cb, 2400); }

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFileUpload();
  initCanvasEvents();

  // Resize
  window.addEventListener('resize', () => { if (state.nodes.length) renderMap(); });
});
