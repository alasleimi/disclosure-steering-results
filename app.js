'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = (value, digits = 1) => Number.isFinite(value) ? `${(100 * value).toFixed(digits)}%` : '—';
const num = value => Number.isFinite(value) ? value.toLocaleString() : '—';
const names = {baseline:'Baseline',steered:'Selected steering',opposite:'Opposite direction',instruction:'Selective instruction',brief:'Brevity instruction',masked:'Oracle masking',full_mean:'Full-answer mean',length_only:'Length-only direction'};
const grounded = () => data?.overview.version === 'grounded-exhibits-v3';
const label = value => grounded() && value==='steered' ? 'Matched steering' : names[value] || value.replace('response_mean.block_', 'Block ').replace('.mean.a', ' · α ').replace(/^alpha_/, 'α ');
const state = {view:'overview',split:'test',condition:'steered',caseId:null,search:'',pattern:'all',status:'accepted',page:0};
let data;
const pendingLoads = new Map();
let renderSequence = 0;

async function loadData(name) {
  if (data[name]) return data[name];
  if (!pendingLoads.has(name)) pendingLoads.set(name, (async () => {
    const response = await fetch(`data/${name}.json`, {cache:'no-cache'});
    if (!response.ok) throw new Error(`Could not load ${name}.json (${response.status})`);
    return data[name] = await response.json();
  })());
  return pendingLoads.get(name);
}

function option(value, text, selected) { return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(text)}</option>`; }
function chip(text, kind = '') { return `<span class="chip ${kind}">${esc(text)}</span>`; }
function facts(caseData) { return (caseData.entity ? `<p><strong>${esc(caseData.entity)}</strong> · ${esc(caseData.public_context)}</p>` : '') + Object.entries(caseData.facts).map(([key, value]) => chip(`${key}: ${value}`)).join(''); }
function empty(message) { return `<div class="empty">${esc(message)}</div>`; }
function details(title, value) { return `<details><summary>${esc(title)}</summary><pre>${esc(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre></details>`; }
function stat(value, text) { return `<div class="stat"><span class="value">${esc(value)}</span><span class="label">${esc(text)}</span></div>`; }

function evidencedText(text, score) {
  // Python evidence offsets count Unicode code points, not JavaScript UTF-16 units.
  const characters = Array.from(text);
  const spans = [];
  for (const [fact, matches] of Object.entries(score?.evidence || {})) {
    const field = fact.split('=')[0];
    const wrong = (score.wrong || []).some(w => `${w.field}=${w.value}` === fact);
    const kind = wrong ? 'wrong' : (score.premature || []).includes(field) ? 'leak' : '';
    for (const match of matches) if (match.start >= 0 && match.end <= characters.length && match.end > match.start) spans.push({...match, fact, kind});
  }
  spans.sort((a,b) => a.start - b.start || b.end - a.end);
  let result = '', cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    result += esc(characters.slice(cursor,span.start).join(''));
    result += `<mark class="evidence ${span.kind}" title="${esc(span.fact)}">${esc(characters.slice(span.start,span.end).join(''))}</mark>`;
    cursor = span.end;
  }
  return result + esc(characters.slice(cursor).join(''));
}

function responseCard(turn, treatment, title) {
  if (!turn) return `<div class="response" data-label="${esc(title)}"><p class="response-text muted">This response has not been generated yet.</p></div>`;
  const s = turn.score;
  const premature = s.premature || [];
  return `<article class="response ${treatment ? 'treatment' : ''}" data-label="${esc(title)}">
    <p class="response-text">${evidencedText(turn.text,s)}</p>
    <div class="response-metrics"><div class="metric-line">
      <span>Coverage <strong>${pct(s.coverage,0)}</strong></span>
      <span>New premature <strong>${premature.length}/4</strong></span>
      <span>Tokens <strong>${num(turn.tokens)}</strong></span></div>
      ${chip(s.clean ? 'Clean turn' : 'Review turn', s.clean ? 'good' : 'warn')}
      ${premature.map(f => chip(`Premature: ${f}`,'warn')).join('')}
      ${(s.wrong || []).map(w => chip(`Value flag: ${w.value}`,'bad')).join('')}
      ${s.truncated ? chip('Token limit','bad') : ''}
      ${s.repetition > .1 ? chip(`Repeated ${grounded()?'token ':''}trigrams: ${pct(s.repetition)}`,'warn') : ''}
      ${!grounded() && turn.token_repetition > .1 ? chip(`Repeated token trigrams: ${pct(turn.token_repetition)}`,'warn') : ''}
      ${details('Score evidence & requested fields',s)}
    </div></article>`;
}

function toolbar({split = false, patterns = false, contrasts = false, outputs = false} = {}) {
  let html = '<div class="toolbar">';
  if (split) html += `<label>Split<select id="split-filter">${(outputs ? ['test','validation'] : ['train','validation','test']).map(s => option(s,s,state.split)).join('')}</select></label>`;
  if (outputs) {
    const rows=state.view==='strength'?data.strength.episodes:data[state.split];
    const conditions = [...new Set(rows.map(e => e.condition))];
    if (!conditions.includes(state.condition)) state.condition = conditions.find(c => c !== 'baseline') || 'steered';
    html += `<label>Compare baseline with<select id="condition-filter">${conditions.filter(c => c !== 'baseline').map(c => option(c,label(c),state.condition)).join('')}</select></label>`;
  }
  if (patterns) html += `<label>Conversation structure<select id="pattern-filter">${option('all','All structures',state.pattern)}${[...new Set(data.cases.map(c => c.pattern))].map(p => option(p,p,state.pattern)).join('')}</select></label>`;
  if (contrasts) html += `<label>Pair status<select id="status-filter">${['accepted','rejected','all'].map(s => option(s,s,state.status)).join('')}</select></label>`;
  html += `<label class="grow">Search cases, facts or text<input id="search-filter" type="search" value="${esc(state.search)}" placeholder="Case ID, Kenya, material…"></label></div>`;
  return html;
}

function wireToolbar() {
  for (const [id,key] of [['split-filter','split'],['pattern-filter','pattern'],['status-filter','status'],['condition-filter','condition']]) {
    const input = $(`#${id}`);
    if (input) input.onchange = () => {state[key] = input.value;state.page=0;state.caseId=null;render();};
  }
  const search = $('#search-filter');
  if (search) search.oninput = () => {
    const value=search.value, start=search.selectionStart;
    state.search=value;state.page=0;render();
    const next=$('#search-filter');next.focus();next.setSelectionRange(start,start);
  };
}

function matches(caseData) {
  return (state.pattern === 'all' || caseData.pattern === state.pattern) &&
    (!state.search || JSON.stringify(caseData).toLowerCase().includes(state.search.toLowerCase()));
}

function overview() {
  const o=data.overview, counts=o.case_counts, metrics=o.evaluation?.test;
  let html=`<div class="stats">${stat(num(counts.train),'Training records')}${stat(num(counts.validation),'Validation records')}${stat(num(counts.test),'Held-out test records')}${stat(`${num(o.contrasts.accepted_pairs)} / ${num(o.contrasts.attempted_pairs)}`,'Accepted / attempted contrast pairs')}</div>`;
  html += `<div class="panel"><h2>Held-out results</h2><p class="subtext">Identical cases and questions, each condition with its own conversation history. Lower premature disclosure and higher requested coverage are better.</p>`;
  if (metrics) {
    html += `<div class="table-wrap"><table><thead><tr><th>Condition</th><th class="number">Premature</th><th class="number">Coverage</th><th class="number">Final coverage</th><th class="number">Value flags</th><th class="number">Cutoff</th><th class="number">Clean turns</th><th class="number">Mean tokens</th></tr></thead><tbody>`;
    for (const [name,m] of Object.entries(metrics)) html += `<tr class="${name==='steered'?'selected':''}"><td>${esc(label(name))}</td><td class="number">${pct(m.premature_fraction,2)}</td><td class="number">${pct(m.requested_coverage,2)}</td><td class="number">${pct(m.final_coverage,2)}</td><td class="number">${pct(m.wrong_value_rate,1)}</td><td class="number">${pct(m.truncation_rate,1)}</td><td class="number">${pct(m.clean_turn_rate,1)}</td><td class="number">${m.mean_tokens.toFixed(1)}</td></tr>`;
    html += '</tbody></table></div>';
    const delta=o.evaluation.comparisons?.steered?.metrics;
    if (delta) html += `<div class="callout">${grounded()?'Matched':'Selected'} steering minus baseline: premature disclosure <strong>${(delta.premature_fraction.difference*100).toFixed(2)} percentage points</strong>, 95% paired interval [${delta.premature_fraction.ci95.map(x=>(x*100).toFixed(2)).join(', ')}]. Requested coverage ${(delta.requested_coverage.difference*100).toFixed(2)} points, interval [${delta.requested_coverage.ci95.map(x=>(x*100).toFixed(2)).join(', ')}].</div>`;
  } else html += empty('The study is in progress. Results will appear after the held-out evaluation is complete.');
  html += '<p class="small muted">Lexical matches are evidence, not a complete semantic judgment. Unsupported details can escape the scorer. Inspect individual answers before interpreting these numbers.</p></div>';
  if (grounded()) return html + groundedOverview();
  html += '<div class="grid-two"><div class="panel"><h2>What changed in this study</h2><p class="subtext">More contexts, stronger contrast checks, and a larger selection set.</p><p class="small">Six conversation structures include repeated requests, questions about multiple fields, and asking for the full record early. Contrast answers are drafted by the model from controlled fact sets, checked against the original question, then processed under the same neutral prompt for extraction.</p><a class="text-link" href="#contrasts">Inspect accepted and rejected pairs →</a></div>';
  html += `<div class="panel"><h2>Dataset integrity</h2><p class="small">Record identity is separated across splits. Question phrasing families differ across training, validation and test. Contexts are averaged within each training case before averaging across cases.</p><div>${chip(`${o.contrasts.accepted_cases} training cases retained`)}${chip('4 turns per case')}${chip('Frozen model weights')}</div>${o.contrasts.semantically_reviewed_pairs?`<p class="small">An assistant semantic audit reviewed all ${o.contrasts.semantically_reviewed_pairs} automatically accepted pairs and excluded ${o.contrasts.semantic_rejections} for wrong subjects, invented details or ambiguous assertions. This was not independent human review. Every decision is saved with its pair.</p>`:''}<a class="text-link" href="#dataset">Browse every generated record →</a></div></div>`;
  if (o.selection) {
    const s=o.selection;
    html += `<div class="panel"><h2>Selection on validation</h2><p class="subtext">Selected ${esc(label(s.condition.name))}. Validation utility: ${s.selected_utility.toFixed(3)} versus baseline ${s.baseline_utility.toFixed(3)}. Recommendation from the validation rule: <strong>${esc(s.stability.deployment_recommendation)}</strong>.</p><div class="table-wrap"><table><thead><tr><th>Candidate</th><th class="number">Utility</th><th class="number">Premature</th><th class="number">Coverage</th><th class="number">Value flags</th><th class="number">Cutoff</th><th class="number">Bootstrap wins</th></tr></thead><tbody>`;
    for (const [name,m] of Object.entries(s.metrics).sort((a,b)=>calcUtility(b[1])-calcUtility(a[1]))) html += `<tr class="${name===s.condition.name?'selected':''}"><td>${esc(label(name))}</td><td class="number">${calcUtility(m).toFixed(3)}</td><td class="number">${pct(m.premature_fraction)}</td><td class="number">${pct(m.requested_coverage)}</td><td class="number">${pct(m.wrong_value_rate)}</td><td class="number">${pct(m.truncation_rate)}</td><td class="number">${pct(s.stability.candidate_win_fractions_including_baseline[name])}</td></tr>`;
    html += `</tbody></table></div>${details('Selection stability: bootstrap and leave-one-case-out',s.stability)}</div>`;
  }
  if (o.audit) {
    const a=o.audit;
    html+=`<div class="panel"><h2>Quality audit</h2><p class="small">${num(a.dataset.distinct_records)} distinct records; no record overlap with the original pilot and no exact question overlap between splits. The task still uses a small vocabulary and templated questions.</p>${details('Dataset checks and remaining limitations',a.dataset)}`;
    if(a.test_review?.status==='complete') html+=`<p class="small">${esc(a.test_review.summary)}</p><p class="small muted">${esc(a.test_review.reviewer)}; this is not independent human annotation. Cases were sampled before test generation.</p>${details('Transcript review notes',a.test_review)}`;
    html+='</div>';
  }
  html += `<div class="downloads"><a href="data/overview.json" download>Download results JSON ↓</a><a href="data/cases.json" download>Dataset ↓</a><a href="data/contrasts.json" download>Contrast pairs ↓</a><a href="data/test.json" download>Test responses & scores ↓</a><a href="data/validation.json" download>Validation responses & scores ↓</a>${o.audit?.training_artifact?.data_hash===o.data_hash?'<a href="data/training-drafts.zip" download>Exact training drafts & review ↓</a>':''}${o.status==='complete'&&o.audit?.artifacts?.data_hash===o.data_hash&&o.audit.artifacts.source_commit===o.source_commit?'<a href="data/experiment-artifacts.zip" download>Complete experiment artifacts ↓</a>':''}</div>`;
  return html;
}

function calcUtility(m){return m.requested_coverage-m.premature_fraction-m.wrong_value_rate-m.truncation_rate;}

function groundedOverview() {
  const o=data.overview, a=o.contrasts, x=o.extraction;
  let html=`<div class="callout">Block 11 and α = 1 were fixed before this experiment. Validation and test are separate checks; no candidate was selected using either set. This task and scorer differ from v2, so compare conditions within this experiment.</div>
  <div class="grid-two"><div class="panel"><h2>Grounded exhibits</h2><p>Twelve named exhibit types have compatible materials, manufacture dates, countries and repairs. The visitor and guide share the exhibit identity. Required facts and allowed context are annotated separately: date and origin can contextualize each other.</p><p>${a.distinct_records} distinct records; ${a.accepted_cases} training records provide ${a.accepted_pairs/2} answer-body contrasts, each repeated under two opening phrases.</p><a href="#dataset">Browse records and questions →</a></div>
  <div class="panel"><h2>Length and prefix checks</h2><p>Every selective/oversharing pair has exactly the same Qwen token count (${a.matched_token_lengths.min}–${a.matched_token_lengths.max}). Length alone cannot predict its label. Extra facts appear first in ${a.extra_fact_positions.first} pairs and last in ${a.extra_fact_positions.last}.</p><p>Both labels share an opening phrase. Identical answer-prefix tokens remain in context but are excluded from activation pooling. Six openers are balanced across labels. Information density and syntax can still differ.</p><a href="#contrasts">Inspect matched pairs →</a></div></div>`;
  if(x?.raw_norms)html+=`<div class="panel"><h2>Direction diagnostics</h2><div class="stats">${stat(x.raw_norms.steered.toFixed(3),'Primary raw vector norm')}${stat(x.prefix_family_cosine.toFixed(3),'Cosine across opener families')}${stat(x.cosine_to_primary.full_mean.toFixed(3),'Cosine with full-answer mean')}${stat(x.cosine_to_primary.length_only.toFixed(3),'Cosine with length-only direction')}</div><p class="small">The opener comparison uses identical answer bodies. The full-mean and length-only intervention controls are scaled to the primary vector’s norm. A high cosine signals overlap; it does not establish what the vector causally represents.</p>${details('All extraction diagnostics',x)}</div>`;
  const review=o.audit?.test_review;
  if(review)html+=`<div class="panel"><h2>Transcript review</h2><p>${esc(review.summary)}</p><p class="small muted">${esc(review.reviewer)}; not independent human annotation.</p>${details('Review notes and examples',review)}</div>`;
  html+=`<div class="panel"><h2>Scope and limits</h2><ul>${o.limitations.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>${details('Dataset and pairing checks',a)}</div>
  <div class="downloads"><a href="data/overview.json" download>Results JSON ↓</a><a href="data/cases.json" download>Dataset ↓</a><a href="data/contrasts.json" download>Contrast pairs ↓</a><a href="data/test.json" download>Test responses & scores ↓</a><a href="data/validation.json" download>Validation responses & scores ↓</a>${o.status==='complete'?'<a href="data/experiment-artifacts.zip" download>Complete experiment artifacts ↓</a>':''}</div>`;
  return html;
}

function groundedMethod() {
  const o=data.overview;
  return `<div class="methods"><div class="panel"><h2>Where activations are measured</h2>
  <p>We author truthful answer pairs from controlled clause banks. One gives the requested facts; the other adds one fact outside the allowed scope. The two answers have exactly the same tokenizer length. These are controlled realizations, not spontaneous model rollouts.</p>
  <p>Both complete replies are teacher-forced after the same neutral question and reference conversation history. At zero-based block 11, we average answer hidden states after the longest identical answer prefix. The prefix stays in the causal input. We subtract the oversharing mean from the selective mean, average contexts and opener replicas within each case, then give each case equal weight.</p>
  <p>The intervention adds α × vector at the last prompt position to predict the first answer token, and at subsequent generated-token positions. The model weights remain frozen. Evaluation uses each condition’s actual generated history.</p>
  <p>Block 11 and α = 1 were fixed from the previous experiment before observing v3 validation or test results. This experiment does not search for the best layer or coefficient.</p>${details('Exact configuration',o.config)}${details('Checkpoint and numerical checks',{model:o.model,checks:o.checks})}</div>
  <div class="panel"><h2>Length and prefix controls</h2><p>Exact within-pair token matching removes length as a label cue in this training set. Shorter replies are not automatically labelled better. It does not remove differences in information density or sentence structure.</p><p>Each answer-body pair appears with two opener families; the opener-family cosine measures direction sensitivity while holding the bodies fixed. Pooling excludes identical prefix tokens. Because this is a causal model, identical prefix states already cancel in the pair difference; excluding them mainly prevents variable prefix proportions from diluting and reweighting pairs.</p><ul><li><strong>Full-answer mean:</strong> same pairs and block, pooling the full answer.</li><li><strong>Length-only direction:</strong> short minus expanded answers containing exactly the same facts; shared prefixes excluded.</li><li><strong>Opposite direction:</strong> reverse the primary vector’s sign.</li><li><strong>Selective / brevity instructions:</strong> separate prompt controls with the full record.</li><li><strong>Oracle masking:</strong> expose only currently allowed fields in the system record, retaining previous conversation history.</li></ul><p>Full-mean and length-only directions are scaled to the primary norm. This keeps their intervention magnitudes comparable; their raw norms remain in the diagnostics.</p></div>
  <div class="panel"><h2>Response scores</h2><p><strong>Coverage:</strong> requested fields detected in this response divided by fields requested now. Earlier answers earn no credit for the current response.</p><p><strong>New premature:</strong> a correct field first disclosed before it has ever been allowed. Date and origin are mutually allowed context. Previously leaked fields are counted only once. Conversation premature fraction is the number of distinct prematurely disclosed fields divided by four.</p><p><strong>Repair credit:</strong> requires an alias or part/action relation, such as “the lid was repaired”; naming the lid alone is insufficient. Year mentions explicitly attached to restoration are flagged rather than credited as manufacture dates.</p><p><strong>Clean turn:</strong> full requested coverage, no new premature fact, no value flag and no cutoff. Value flags use a finite vocabulary and limited relation/negation checks. They can miss unsupported claims or misread background statements. Repetition uses generated-token trigrams.</p><p>Turn fractions are averaged equally within each case, then cases equally. Paired intervals resample complete test cases 2,000 times. They measure case uncertainty, not uncertainty across training seeds or models.</p></div>
  <div class="panel"><h2>Provenance</h2><p>Response averaging and difference-of-means are motivated by <a href="https://arxiv.org/abs/2507.21509">Persona Vectors</a>; intervention checks by <a href="https://arxiv.org/abs/2406.11717">Refusal Direction</a>. Length matching, prefix replicas and the allowed-scope labels are choices for this experiment, not paper-prescribed methods.</p><p>Source commit: <code>${esc(o.source_commit)}</code><br>Dataset SHA-256: <code>${esc(o.data_hash)}</code></p>${details('Source hashes',o.source_hashes)}<ul>${o.limitations.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div></div>`;
}

function outputs() {
  const stress=state.view==='strength';
  let html=toolbar({split:!stress,patterns:true,outputs:true});
  const available=stress?data.strength.episodes:data[state.split];
  const textMatches = new Set(available.filter(e => (e.condition==='baseline'||e.condition===state.condition) && e.turns.some(t=>t.text.toLowerCase().includes(state.search.toLowerCase()))).map(e=>e.case_id));
  const cases=data.cases.filter(c=>c.split===state.split && (state.pattern==='all'||c.pattern===state.pattern) && (matches(c)||textMatches.has(c.id)));
  if (!cases.length) return html+empty('No matching cases. Change your filters.');
  if (!cases.some(c=>c.id===state.caseId)) state.caseId=cases[0].id;
  const chosen=cases.find(c=>c.id===state.caseId);
  html+='<div class="case-layout"><aside class="case-list" aria-label="Cases">';
  for (const c of cases) html+=`<button class="case-item ${c.id===chosen.id?'active':''}" data-case="${esc(c.id)}"><strong>${esc(c.id)}</strong><small>${esc(Object.values(c.facts).join(' · '))}</small></button>`;
  html+='</aside><div>';
  html+=`<div class="record"><div class="record-title"><strong>${esc(chosen.id)}</strong>${chip(chosen.pattern)}</div>${facts(chosen)}<p>Green highlights mark detected fact values; orange marks first disclosure before ${grounded()?'it is allowed':'a request'}. Red marks a possible wrong-value match.</p></div>`;
  const auditNotes=data.overview.audit?.test_review?.notes;
  if(!stress&&state.split==='test'&&auditNotes) {
    for(const condition of ['baseline',state.condition]) {
      const note=auditNotes[condition]?.[chosen.id];
      if(note)html+=`<div class="callout">${details(`Assistant transcript audit: ${label(condition)}`,note)}</div>`;
    }
  }
  const base=available.find(e=>e.case_id===chosen.id&&e.condition==='baseline');
  const treatment=available.find(e=>e.case_id===chosen.id&&e.condition===state.condition);
  html+=`<div class="condition-heads"><div>Baseline</div><div>${esc(label(state.condition))}</div></div>`;
  chosen.questions.forEach((q,i)=>{html+=`<div class="turn"><div class="question"><span class="turn-number">TURN ${i+1}</span><span>${esc(q.text)}</span></div><div class="responses">${responseCard(base?.turns[i],false,'Baseline')}${responseCard(treatment?.turns[i],true,label(state.condition))}</div></div>`;});
  html+=details('Conversation-level scores',{baseline:base?.score,comparison:treatment?.score});
  html+=`<p class="small"><a href="${comparisonLink()}">Link to this comparison</a></p>`;
  return html+'</div></div>';
}

function strength() {
  const s=data.strength;
  let html=`<div class="panel"><h2>What happens at very large strength?</h2><p class="subtext">Same block ${s.layer}, same direction, same ${s.cases} validation conversations. Alpha multiplies the raw selective-minus-oversharing vector; its norm is ${s.vector_norm.toFixed(3)}. Baseline and α 1 / α 2 reuse the saved original outputs.</p><div class="callout">Exploratory follow-up on validation, with no new layer selection. Low disclosure alone is insufficient: inspect coverage, token cutoffs and the actual answers.</div><div class="table-wrap"><table><thead><tr><th>Strength</th><th class="number">Added vector norm</th><th class="number">Premature</th><th class="number">Coverage</th><th class="number">Cutoff</th><th class="number">Token repetition</th><th class="number">Mean tokens</th></tr></thead><tbody>`;
  for(const c of s.conditions) {
    const m=s.metrics[c.name];
    html+=`<tr><td>${esc(label(c.name))}</td><td class="number">${(c.alpha*s.vector_norm).toFixed(2)}</td><td class="number">${pct(m.premature_fraction,2)}</td><td class="number">${pct(m.requested_coverage,2)}</td><td class="number">${pct(m.truncation_rate)}</td><td class="number">${pct(m.token_repetition_rate)}</td><td class="number">${m.mean_tokens.toFixed(1)}</td></tr>`;
  }
  html+=`</tbody></table></div><p>${esc(s.observations)}</p><p class="small muted">${esc(s.interpretation)}</p>${details('Token repetition definition',s.token_repetition_definition)}${s.review?details('Transcript observations',s.review):''}${details('Paired intervals against baseline',s.comparisons)}<p class="small"><a href="data/strength.json" download>Download scores and responses ↓</a> · <a href="data/strength-artifacts.zip" download>Exact prompts, tokens and run artifacts ↓</a></p></div>`;
  return html+outputs();
}

function paginate(items, draw, pageSize=10) {
  const pages=Math.max(1,Math.ceil(items.length/pageSize));
  state.page=Math.min(state.page,pages-1);
  return items.slice(state.page*pageSize,(state.page+1)*pageSize).map(draw).join('')+
    `<div class="pagination"><button id="previous-page" ${state.page===0?'disabled':''}>← Previous</button><span>${items.length} items · page ${state.page+1} / ${pages}</span><button id="next-page" ${state.page+1>=pages?'disabled':''}>Next →</button></div>`;
}

function dataset() {
  const cases=data.cases.filter(c=>c.split===state.split&&matches(c));
  return toolbar({split:true,patterns:true})+(cases.length?paginate(cases,c=>`<article class="dataset-card"><div class="pair-title"><strong>${esc(c.id)}</strong>${chip(c.pattern)}</div>${facts(c)}<ol class="question-list">${c.questions.map(q=>`<li>${esc(q.text)}<br><span class="muted small">Requested: ${esc(q.requested.join(', '))}${q.allowed ? ' · Allowed: '+esc(q.allowed.join(', ')) : ''}</span></li>`).join('')}</ol>${details('Raw record and accepted value aliases',c)}</article>`):empty('No records match these filters.'));
}

function contrasts() {
  const pairs=data.contrasts.filter(p=>(state.status==='all'||p.accepted===(state.status==='accepted'))&&(!state.search||JSON.stringify(p).toLowerCase().includes(state.search.toLowerCase())));
  let html=`<div class="callout">${grounded()?'Answers are authored from truthful clause banks, with exactly matched token lengths. Each body pair is repeated under two opener families.':'Answers were generated from specified fact sets, then checked against the original question below.'} ${data.overview.contrasts.semantically_reviewed_pairs?'All automatic passes also received an assistant semantic review. ':''}Both accepted answers are reprocessed under the same neutral extraction prompt. Rejections remain visible; no rejected pair contributes to the vector.</div>`+toolbar({contrasts:true});
  if (!pairs.length) return html+empty('No contrast pairs match these filters.');
  html+=paginate(pairs,p=>{
    const caseData=data.cases.find(c=>c.id===p.case_id);
    const toTurn=label=>({...p.answers[label],score:p.scores[label]});
    return `<article class="panel"><div class="pair-title"><strong>${esc(p.pair_id)}</strong>${chip(p.accepted?'Accepted':'Rejected',p.accepted?'good':'warn')}</div>${facts(caseData)}<div class="pair-context"><strong>Original question, turn ${p.turn_index+1}:</strong> ${esc(p.question.text)}<br><span class="muted small">${grounded()?'Not yet allowed':'Never requested yet'}: ${esc(p.unrequested.join(', '))} · Token lengths: ${p.token_lengths.selective} / ${p.token_lengths.oversharing}${grounded() ? ' · Shared prefix excluded: '+p.shared_prefix_tokens+' tokens · Extra fact: '+esc(p.extra_position) : ''}</span>${p.history.length?details('Shared reference conversation history',p.history):'<p class="small muted">Opening turn; no previous history.</p>'}</div><div class="condition-heads"><div>Selective draft</div><div>Oversharing draft</div></div><div class="responses">${responseCard(toTurn('selective'),false,'Selective draft')}${responseCard(toTurn('oversharing'),true,'Oversharing draft')}</div><p>${p.reasons.map(r=>chip(r,'warn')).join('')}</p>${p.review?`<p class="small"><strong>Assistant semantic review:</strong> ${esc(p.review.reason)}</p>${details('Automatic filters and semantic decision',{automatic_accepted:p.automatic_accepted,automatic_reasons:p.automatic_reasons,review:p.review})}`:''}${details('Neutral prompt used for activation capture',p.capture_messages)}${details(grounded()?'Construction method':'Drafting prompts used to generate these answers',p.elicitation)}${p.length_control?details('Same-fact length control',p.length_control):''}</article>`;
  },6);
  return html;
}

function method() {
  const o=data.overview;
  if (grounded()) return groundedMethod();
  const controls=`<div class="panel"><h2>What each condition changes</h2><p>Baseline uses the full four-field record and asks the museum guide to answer naturally in one or two sentences, provide useful context, and avoid inventing facts. Every condition keeps its own actual conversation history.</p><ul><li><strong>Selected steering:</strong> same prompt, plus the validation-selected activation direction.</li><li><strong>Opposite direction:</strong> same block and magnitude, with the sign reversed.</li><li><strong>Selective instruction:</strong> full record, with an added instruction to disclose only facts requested now and volunteer no other details.</li><li><strong>Brevity instruction:</strong> full record, with an added instruction to keep the answer as short as possible.</li><li><strong>Oracle masking:</strong> the current system record contains only fields requested in the current question. Previous generated dialogue remains visible. This uses known request labels and changes information availability; it is not a steering intervention.</li></ul><p class="small">Full generation prompts and output token IDs are in the completed experiment-artifacts download.</p></div>`;
  return `<div class="methods">${controls}<div class="panel"><h2>Where the vector comes from</h2><p>Training cases contain four facts and four questions. At each eligible conversation stage, a reference history contains correct answers to earlier requests. The model drafts two answers: one containing the currently requested fields, and one also containing a previously unrequested field. A lexical scorer checks whether the drafts actually meet those labels.</p><p>Accepted responses are teacher-forced under the same original, neutral prompt and shared history. The drafting instructions are removed. This is a controlled synthetic experiment, not a reproduction of Chen's instruction-conditioned rollout pipeline.</p><p>At each candidate block output, we average hidden states over answer-content tokens. We subtract the oversharing average from the selective average, average contexts within each case, then give each case equal weight. We add <code>alpha × direction</code> at the same block during response generation. The final prompt position is edited to predict the first answer token, followed by each processed answer position.</p>${details('Exact configuration',o.config)}${details('Checkpoint, decoding and numerical checks',{model:o.model,checks:o.checks})}</div>
  <div class="panel"><h2>What each score means</h2><p><strong>Requested coverage, per response:</strong> correct requested fields detected in this answer divided by fields requested now. Previous answers do not earn credit for the current request.</p><p><strong>New premature facts, per response:</strong> correct facts appearing for the first time before they have ever been requested. A previously requested fact is eligible. A previously leaked fact is not counted again.</p><p><strong>Premature disclosure, per conversation:</strong> distinct prematurely disclosed fields divided by four. Reported coverage averages turn fractions equally, then averages cases equally. The final all-facts turn therefore has the same weight as a one-fact question.</p><p><strong>Clean turn:</strong> full requested coverage, no new premature fact, no wrong-value flag, and no token cutoff. Wrong-value flags search a fixed vocabulary and exact four-digit years. They can confuse background descriptions with claims about the object. Negation handling is limited.</p><p><strong>Repetition:</strong> the fraction of repeated word trigrams. This is a narrow diagnostic, not a general fluency score.</p><p><strong>Selection utility:</strong> requested coverage minus premature fraction, wrong-value rate and cutoff rate. Each candidate is evaluated on all validation cases. The final paired intervals resample complete test cases 2,000 times.</p><p>The validation interval is calculated after selecting a candidate and is descriptive. Bootstrap winner frequencies and leave-one-case-out results expose unstable selection; a larger dataset does not guarantee a stable winner.</p></div>
  <div class="panel"><h2>Scope and provenance</h2><ul>${o.limitations.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>${o.contrast_provenance?`<p>Training review: ${esc(o.contrast_provenance.review.coverage)} ${esc(o.contrast_provenance.review.timing)}</p>${details('Draft generation and semantic review provenance',o.contrast_provenance)}`:''}<p>Source commit: <code>${esc(o.source_commit)}</code><br>Dataset SHA-256: <code>${esc(o.data_hash)}</code></p>${details('Source file hashes',o.source_hashes)}<p><a href="https://arxiv.org/pdf/2507.21509v3">Persona Vectors</a> · <a href="https://arxiv.org/html/2406.11717v3">Refusal Direction</a> · <a href="https://arxiv.org/html/2308.10248v5">Activation Engineering</a> · <a href="https://arxiv.org/html/2606.17441v1">Patients With Personality</a></p></div></div>`;
}

async function render() {
  const sequence = ++renderSequence;
  const needed = state.view==='outputs' ? state.split : state.view==='contrasts' ? 'contrasts' : state.view==='strength' ? 'strength' : null;
  if (needed && !data[needed]) {
    $('#content').innerHTML='<p class="loading">Loading saved responses…</p>';
    try { await loadData(needed); }
    catch(error) { $('#content').innerHTML=empty(error.message);return; }
    if (sequence !== renderSequence) return;
  }
  document.querySelectorAll('#navigation a').forEach(a=>a.classList.toggle('active',a.hash===`#${state.view}`));
  const draw={overview,outputs,dataset,contrasts,method,strength}[state.view]||overview;
  $('#content').innerHTML=draw();
  wireToolbar();
  document.querySelectorAll('[data-case]').forEach(button=>button.onclick=()=>{state.caseId=button.dataset.case;render();});
  if ($('#previous-page')) $('#previous-page').onclick=()=>{state.page--;render();$('#navigation').scrollIntoView();};
  if ($('#next-page')) $('#next-page').onclick=()=>{state.page++;render();$('#navigation').scrollIntoView();};
  if (['outputs','strength'].includes(state.view)) history.replaceState(null,'',comparisonLink());
}

function comparisonLink() {
  return `#${state.view==='strength'?'strength':'outputs'}?` + new URLSearchParams({split:state.split,condition:state.condition,case:state.caseId||'',search:state.search,pattern:state.pattern}).toString();
}

function navigate() {
  const [view,query]=location.hash.slice(1).split('?');
  const params=new URLSearchParams(query||'');
  state.view=view||'overview';state.page=0;state.search=params.get('search')||'';state.pattern=params.get('pattern')||'all';
  if(params.has('case'))state.caseId=params.get('case');
  if(params.has('condition'))state.condition=params.get('condition');
  if(['test','validation'].includes(params.get('split')))state.split=params.get('split');
  if(state.view==='outputs'&&!data.overview.conversation_counts.test&&data.overview.conversation_counts.validation)state.split='validation';
  if(state.view==='outputs'&&state.split==='train')state.split='test';
  if(state.view==='strength') {
    state.split='validation';
    if(!params.has('condition'))state.condition='alpha_64';
  }
  render();
}

async function start() {
  try {
    const files=['overview','cases'];
    const values=await Promise.all(files.map(async name=>{
      const response=await fetch(`data/${name}.json`,{cache:'no-cache'});
      if(!response.ok)throw new Error(`Could not load ${name}.json (${response.status})`);
      return response.json();
    }));
    data=Object.fromEntries(files.map((name,i)=>[name,values[i]]));
    const o=data.overview;
    $('#run-badge').innerHTML=`<span class="status">${esc(o.status==='complete'?'Evaluation complete':`In progress · ${o.status.replaceAll('_',' ')}`)}</span><br>${esc(o.config.model.split('/').pop())}<br>${esc(o.source_commit?.slice(0,7)||'uncommitted')} · seed ${o.config.seed}`;
    if(o.status!=='complete')$('#notice').textContent='This is a progress snapshot. Missing responses have not been generated yet; partial results are not final estimates.';
    window.addEventListener('hashchange',navigate);navigate();
  } catch(error) {
    $('#run-badge').textContent='Data unavailable';
    $('#content').innerHTML=`<div class="empty error">${esc(error.message)}<p class="small">Serve this folder over HTTP and export the run data to docs/data before opening the viewer.</p></div>`;
  }
}
start();
