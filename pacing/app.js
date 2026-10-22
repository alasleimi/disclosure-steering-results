"use strict";
const $ = s => document.querySelector(s);
const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct = x => x == null ? "—" : `${(100*x).toFixed(2)}%`;
const num = x => x == null ? "—" : Number(x).toFixed(1);
const names = {baseline:"Baseline",selective:"Selective prompt",brief:"Brevity prompt",oracle:"Oracle fact masking",steered:"Selected vector",opposite:"Opposite direction",neutral_replay:"Neutral-prompt replay",random:"Random direction",response_last:"Last-token vector",response_middle:"Middle-token vector"};
const label = x => x==="steered" && data?.smoke ? "Fixture mean vector" : names[x] || x;
const chip = (s, kind="") => `<span class="chip ${kind}">${esc(s)}</span>`;
const details = (title, value) => `<details><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(value,null,2))}</pre></details>`;
const facts = c => `<div class="record"><div class="record-title"><strong>${esc(c.id)}</strong>${chip(c.split)}</div>${Object.entries(c.facts).map(([k,v])=>chip(`${k}: ${v}`)).join("")}</div>`;
const options = (values,selected,display=x=>x) => values.map(v=>`<option value="${esc(v)}" ${v===selected?"selected":""}>${esc(display(v))}</option>`).join("");
let data, development, archive, runs;
let state = {split:"test",reference:"baseline",condition:"steered",hidePerfectCards:false,prematureLeft:"all",prematureRight:"all",focusTurn:0,caseId:"",search:"",pairFilter:"retained",pairIndex:0,devIndex:0};
const prematureOptions = {all:"All",yes:"Yes",no:"No"};
const scoreEvents = e => e?.score?.events || (e?.turns||[]).map(t=>t.score);
const prematureFields = e => [...new Set(scoreEvents(e).flatMap(event=>event?.premature||[]))];
function matchesPremature(left,right,expectedTurns){
  const matchesSide=(episode,choice)=>{
    if(choice==="all")return true;
    const events=scoreEvents(episode), hasPremature=prematureFields(episode).length>0;
    if(choice==="yes")return hasPremature;
    return expectedTurns>0&&episode?.turns.length===expectedTurns&&events.length===expectedTurns&&events.every(event=>Array.isArray(event?.premature))&&!hasPremature;
  };
  return matchesSide(left,state.prematureLeft)&&matchesSide(right,state.prematureRight);
}
function readPrematureFilters(params){
  const legacy=params.get("leaks");
  if(["all","left","right","both"].includes(legacy)){
    state.prematureLeft=["left","both"].includes(legacy)?"yes":"all";
    state.prematureRight=["right","both"].includes(legacy)?"yes":"all";
  }
  for(const key of ["prematureLeft","prematureRight"])if(Object.hasOwn(prematureOptions,params.get(key)))state[key]=params.get(key);
}
function prematureOverview(left,right){
  return `<div class="leak-index"><strong>Premature disclosure in this card</strong><p class="small muted">Jump to a flagged turn. Orange highlights show the matched fact text; earlier turns remain available for context.</p>${[...new Map([[state.reference,left],[state.condition,right]])].map(([condition,e])=>`<div><strong>${esc(label(condition))}</strong> ${scoreEvents(e).map((event,i)=>event?.premature?.length?`<button type="button" data-turn="${i+1}" aria-label="Jump to turn ${i+1}: ${esc(label(condition))}; premature ${esc(event.premature.join(', '))}">Turn ${i+1} · ${esc(event.premature.join(', '))}</button>`:"").join("")||`<span class="muted">${e?"No premature facts recorded.":"No saved response."}</span>`}</div>`).join("")}</div>`;
}
function highlightedResponse(text,event){
  const chars=Array.from(text), fields=new Set(event?.premature||[]), spans=[];
  for(const [fact,matches] of Object.entries(event?.evidence||{}))if(fields.has(fact.split('=')[0])){
    for(const span of matches)if(Number.isInteger(span.start)&&Number.isInteger(span.end)&&span.start>=0&&span.end>span.start&&span.end<=chars.length)spans.push({...span,fact});
  }
  spans.sort((a,b)=>a.start-b.start||b.end-a.end);
  let html="", cursor=0;
  for(const span of spans){
    if(span.start<cursor)continue;
    html+=esc(chars.slice(cursor,span.start).join(''))+`<mark class="evidence leak" title="${esc(span.fact)}">${esc(chars.slice(span.start,span.end).join(''))}</mark>`;
    cursor=span.end;
  }
  return html+esc(chars.slice(cursor).join(''));
}
const table = metrics => `<div class="table-wrap"><table><thead><tr><th>Condition</th><th>Cards</th><th>Premature ↓</th><th>Non-name ↓</th><th>Requested ↑</th><th>Full reveal ↑</th><th>Known wrong ↓</th><th>Cutoff ↓</th><th>Tokens</th></tr></thead><tbody>${Object.entries(metrics).map(([k,m])=>`<tr class="${k==="steered"?"selected":""}"><td>${esc(label(k))}</td><td>${m.cases}</td>${[m.premature_fraction,m.nonname_premature_fraction,m.requested_coverage,m.broad_coverage,m.wrong_value_rate,m.truncation_rate].map(v=>`<td class="number">${pct(v)}</td>`).join("")}<td class="number">${num(m.mean_tokens)}</td></tr>`).join("")}</tbody></table></div>`;
function overview(){
  const evaluation=data.evaluation||{}, test=evaluation.test, diagnostic=evaluation.diagnostic, validation=evaluation.validation, gate=data.transfer_gate;
  const extraction=data.extraction;
  const stats=diagnostic?[[data.smoke.fixture_pairs,"Authored fixture pairs"],[data.smoke.diagnostic_case_ids.length,"Diagnostic cards"],[data.episodes.reduce((n,e)=>n+e.turns.length,0),"Generated responses"],[0,"Held-out responses"]]:data.draft_summary&&!extraction?[[data.draft_summary.contexts,"Training contexts tried"],[data.draft_summary.pairs,"Generated pairs"],[data.draft_summary.candidate_ids.length,"Filter-passing pairs"],[0,"Held-out responses"]]:[[data.cases.filter(c=>c.split==="train").length,"Training cards"],[extraction?.pairs.length??"Pending","Reviewed pairs used"],[data.cases.filter(c=>c.split==="validation").length,"Validation cards"],[data.cases.filter(c=>c.split==="test").length,"Held-out cards"]];
  let html=`<div class="stats">${stats.map(([v,l])=>`<div class="stat"><span class="value">${v}</span><span class="label">${l}</span></div>`).join("")}</div>`;
  html+=`<div class="panel"><h2>${diagnostic?"Small-model harness diagnostic":test?"Held-out nonmedical results":data.extraction?"Validation and test in progress":data.draft_summary?"Bounded elicitation trial":"Experiment in progress"}</h2><p class="subtext">${diagnostic?esc(data.smoke.interpretation):test?"Each condition answers the same cards, using its own generated conversation history.":"No validation or held-out steering conclusions. All generated attempts remain available in Contrasts & fixtures."}</p>${diagnostic||test?table((diagnostic||test).metrics):`<p>${esc((data.manifest?.status||"Prepared").replaceAll("_"," "))}</p>${data.pilot_review?`<p>${esc(data.pilot_review.reason)}</p>`:""}${data.draft_summary?details("Pair filtering and yield",data.draft_summary):""}`}</div>`;
  if(diagnostic) html+=`<div class="callout">Fixed block ${data.smoke.layer} (zero-based), strength +1. The fixture vector changed ${diagnostic.comparisons.steered.changed_conversations}/${diagnostic.comparisons.steered.paired_cases} conversations but did not improve premature disclosure. Five diagnostic cards and authored, unequal-length contrasts cannot establish a general steering effect. No layer selection or patient transfer was performed.</div>`;
  if(extraction) html+=`<div class="panel"><h2>Measured contrasts</h2><p>${extraction.pairs.length} retained model-generated pairs from ${extraction.cards} cards. Category quotas limit how many examples of each extra fact enter the direction; cards receive equal weight.</p><p>Mean answer length: ${(extraction.pairs.reduce((n,p)=>n+p.positive_tokens,0)/extraction.pairs.length).toFixed(1)} selective vs ${(extraction.pairs.reduce((n,p)=>n+p.negative_tokens,0)/extraction.pairs.length).toFixed(1)} oversharing tokens (excluding EOS). ${extraction.pairs.filter(p=>p.shared_prefix_tokens>0).length}/${extraction.pairs.length} pairs share an answer prefix. Same-bin filtering leaves a length difference; the direction can still mix disclosure with formatting and verbosity.</p></div>`;
  if(data.selection) html+=`<div class="callout">Validation recommendation: <strong>${esc(label(data.selection.recommended))}</strong>. Best active setting: block ${data.selection.active_candidate.layer}, strength ${data.selection.active_candidate.alpha}. ${data.selection.recommended==="baseline"?"The active candidate is still evaluated for evidence; it was not preferred to zero steering.":"The setting was frozen before test generation."}</div>`;
  if(test?.comparisons?.steered){
    const c=test.comparisons.steered;
    html+=`<div class="panel"><h2>Selected vector minus baseline</h2><p class="subtext">${c.changed_conversations}/${c.paired_cases} conversations changed. Paired 95% bootstrap intervals resample whole cards.</p><div class="table-wrap"><table><thead><tr><th>Measure</th><th>Difference</th><th>95% interval</th></tr></thead><tbody>${["premature_fraction","nonname_premature_fraction","requested_coverage","broad_coverage","wrong_value_rate","truncation_rate"].map(k=>{const m=c.metrics[k];return `<tr><td>${esc(k.replaceAll("_"," "))}</td><td class="number">${(100*m.difference).toFixed(2)} pp</td><td class="number">[${m.ci95.map(x=>(100*x).toFixed(2)).join(", ")}] pp</td></tr>`;}).join("")}</tbody></table></div></div>`;
  }
  if(gate) html+=`<div class="panel"><h2>Nonmedical gate for attempting transfer</h2><p><strong>${esc(gate.status.replaceAll("_"," "))}</strong></p>${Object.entries(gate.checks).map(([k,v])=>chip(`${v?"Pass":"Fail"}: ${k.replaceAll("_"," ")}`,v?"good":"bad")).join("")}<p class="subtext">Medical transfer is conditional on this frozen gate and a transcript audit. A failed gate does not establish that steering can never transfer.</p></div>`;
  if(evaluation.transfer) html+=`<div class="panel"><h2>Fresh fictional patient transfer</h2><p class="subtext">No patient training or retuning. Forty-eight cards share three scenario families; this is not a clinical validation study.</p>${table(evaluation.transfer.metrics)}</div>`;
  if(data.transfer_review) html+=`<div class="panel"><h2>Fictional-patient transcript audit</h2><p><strong>${esc(data.transfer_review.conclusion)}</strong></p>${details("Cross-family sample and scoring limits",data.transfer_review)}</div>`;
  if(validation) html+=`<details class="panel"><summary>Validation sweep and prompt controls</summary>${table(validation.metrics)}</details>`;
  if(data.test_review) html+=`<div class="panel"><h2>Transcript audit</h2>${details("Read the audit and identified scoring limits",data.test_review)}</div>`;
  if(data.diagnostic_review) html+=`<div class="panel"><h2>Diagnostic transcript audit</h2><p>All 160 responses were read. Matching the right fact words can hide incorrect relationships and invented details.</p>${details("Examples and scoring limits",data.diagnostic_review)}</div>`;
  if(data.pilot_review) html+=`<div class="panel"><h2>Elicitation audit</h2>${details("Review of generated attempts",data.pilot_review)}</div>`;
  html+=`<div class="panel downloads"><a href="experiment.zip">Download saved run artifacts</a><a href="data.json">Viewer data</a><a href="archive.json">Archive SHA-256</a><span>${archive?(archive.bytes/1048576).toFixed(1)+" MB archive":""}</span></div>`;
  return html;
}
function response(turn,event,name,notes=[]){
  if(!turn) return `<div class="response" data-label="${esc(name)}"><p class="response-text">This condition has not been generated yet.</p></div>`;
  return `<div class="response" data-label="${esc(name)}"><p class="response-text">${highlightedResponse(turn.text,event)}</p><div class="response-metrics"><strong>${esc(name)}</strong><div class="metric-line"><span>Requested coverage <strong>${pct(event?.coverage)}</strong></span><span>Tokens <strong>${turn.tokens}</strong></span></div>${(event?.premature||[]).map(f=>chip(`Early: ${f}`,"warn")).join("")}${(event?.wrong||[]).map(e=>chip(`Wrong: ${e.field}=${e.value}`,"bad")).join("")}${event?.truncated?chip("Token cutoff","bad"):""}${event?.clean?chip("Passed lexical checks","good"):""}${notes.map(n=>`<p class="small">${chip("Transcript review",n.kind==="improvement"?"good":"warn")} ${esc(n.finding)}</p>`).join("")}${details("Score and matching evidence",event||{})}${turn.messages?details("Exact input messages",turn.messages):""}</div></div>`;
}
function outputs(source=data,dev=false){
  const episodes=source.episodes||[];
  const splits=[...new Set(episodes.map(e=>e.split))];
  if(!splits.length) return `<div class="empty">No evaluation responses saved yet. Browse the dataset or training contrasts.</div>`;
  const split=dev?"development":(splits.includes(state.split)?state.split:splits[0]);
  if(!dev)state.split=split;
  const available=episodes.filter(e=>e.split===split);
  const conditions=[...new Set(available.map(e=>e.condition))];
  if(!conditions.includes(state.reference))state.reference=conditions.includes("baseline")?"baseline":conditions[0];
  if(!conditions.includes(state.condition))state.condition=conditions.includes("selective")?"selective":conditions[0];
  const byCaseCondition=new Map(available.map(e=>[`${e.case_id}:${e.condition}`,e]));
  const episodeFor=(c,condition)=>byCaseCondition.get(`${c.id}:${condition}`);
  const perfectCard=(c,condition)=>{
    const e=episodeFor(c,condition);
    return c.questions.length>0&&e?.turns.length===c.questions.length&&e.score?.events?.length===c.questions.length&&e.score.events.every(event=>event.clean===true);
  };
  const matchingCases=source.cases.filter(c=>c.split===split&&JSON.stringify(c).toLowerCase().includes(state.search.toLowerCase()));
  const afterPerfect=matchingCases.filter(c=>!state.hidePerfectCards||!perfectCard(c,state.reference)||!perfectCard(c,state.condition));
  const cases=afterPerfect.filter(c=>matchesPremature(episodeFor(c,state.reference),episodeFor(c,state.condition),c.questions.length));
  const hiddenCount=matchingCases.length-afterPerfect.length;
  const filterFeedback=!matchingCases.length?"No cards match the current search and filters.":hiddenCount===0?"0 cards hidden. No matching card passes every turn for both selected conditions.":`${hiddenCount} ${hiddenCount===1?"card":"cards"} hidden: both conditions pass every turn.`;
  if(!cases.some(c=>c.id===state.caseId)){state.caseId=cases[0]?.id||"";state.focusTurn=0;}
  const c=cases.find(c=>c.id===state.caseId);
  if(state.focusTurn>(c?.questions.length||0))state.focusTurn=0;
  let html=`<div class="toolbar">${!dev?`<label>Evaluation split<select id="split">${options(splits,split)}</select></label>`:""}<label>Left condition<select id="reference">${options(conditions,state.reference,label)}</select></label><label>Premature left<select id="premature-left" aria-describedby="leak-filter-help">${options(Object.keys(prematureOptions),state.prematureLeft,k=>prematureOptions[k])}</select></label><label>Right condition<select id="condition">${options(conditions,state.condition,label)}</select></label><label>Premature right<select id="premature-right" aria-describedby="leak-filter-help">${options(Object.keys(prematureOptions),state.prematureRight,k=>prematureOptions[k])}</select></label><label class="grow">Find a card<input id="search" value="${esc(state.search)}" placeholder="Name, job, case ID…"></label></div><div class="comparison-filters"><label><input type="checkbox" id="hide-perfect-cards" ${state.hidePerfectCards?"checked":""} aria-describedby="perfect-card-filter-help">Hide cards where both are fully correct</label><span class="count" role="status">${cases.length} / ${matchingCases.length} cards</span><p id="leak-filter-help">Each side is independent: Yes = at least one premature fact; No = none across a complete scored conversation; All = no restriction. Both filters must match. Badges count distinct premature facts.</p><p id="perfect-card-filter-help">Both selected conditions must pass every tracked check on every turn: full requested coverage, no premature disclosure, no wrong-value flags and no token cutoffs. Only the card list is filtered; result tables use all cards.</p>${state.hidePerfectCards?`<p id="perfect-card-filter-result" role="status"><strong>${esc(filterFeedback)}</strong></p>`:""}</div><div class="case-layout"><aside class="case-list" aria-label="Choose a card">${cases.map(c=>`<button class="case-item ${c.id===state.caseId?"active":""}" data-case="${esc(c.id)}"><strong>${esc(c.id)}</strong><small>${esc(c.facts.name||c.facts.symptoms||"")} · ${esc(c.pattern||"patient")}</small>${[...new Set([state.reference,state.condition])].map(condition=>{const count=prematureFields(episodeFor(c,condition)).length;return count?chip(`${label(condition)}: ${count} early`,"warn"):"";}).join("")}</button>`).join("")}</aside><div>`;
  if(!c)return html+`<div class="empty">No matching cards. Change your search, disclosure filter or fully correct card filter.</div></div></div>`;
  const reference=episodeFor(c,state.reference);
  const treatment=episodeFor(c,state.condition);
  const auditNotes=(condition,index)=>[...(source.diagnostic_review?.examples||[]),...(source.test_review?.examples||[]),...(source.transfer_review?.examples||[])].filter(n=>n.case_id===c.id&&n.condition===condition&&n.turn===index+1);
  const conversationChecks=e=>{
    const events=e?.score?.events||[], total=c.questions.length;
    const passed=events.filter(event=>event.clean===true).length;
    const scored=events.filter(event=>typeof event.clean==="boolean").length;
    return `${passed}/${total} turns pass all checks${scored<total?` (${total-scored} unscored)`:""}`;
  };
  html+=facts(c)+`<p class="small" id="conversation-checks"><strong>Whole conversation:</strong> ${esc(label(state.reference))}: <strong>${conversationChecks(reference)}</strong>; ${esc(label(state.condition))}: <strong>${conversationChecks(treatment)}</strong>.</p>${prematureOverview(reference,treatment)}<div class="condition-heads"><div>${esc(label(state.reference))}</div><div>${esc(label(state.condition))}</div></div>`;
  c.questions.forEach((q,i)=>{const flagged=[reference,treatment].some(e=>e?.score?.events[i]?.premature?.length);html+=`<article id="turn-${i+1}" tabindex="-1" class="turn ${flagged?"has-premature":""}"><div class="question"><span class="turn-number">TURN ${i+1}</span><strong>${esc(q.text)}</strong>${flagged?chip("Premature disclosure","warn"):""}</div><p class="small muted">Required: ${esc(q.requested.join(", "))}. Eligible now: ${esc((treatment?.score.events[i]?.eligible||q.allowed).join(", "))}.</p><div class="responses">${response(reference?.turns[i],reference?.score.events[i],label(state.reference),auditNotes(state.reference,i))}${response(treatment?.turns[i],treatment?.score.events[i],label(state.condition),auditNotes(state.condition,i))}</div></article>`;});
  if(!dev)html+=`<p class="small"><a id="comparison-link" href="${comparisonLink()}">Link to this comparison</a></p>`;
  return html+`</div></div>`;
}
function dataset(){
  const splits=[...new Set(data.cases.map(c=>c.split))];
  if(!splits.includes(state.split))state.split="train";
  const cases=data.cases.filter(c=>c.split===state.split&&JSON.stringify(c).toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="toolbar"><label>Split<select id="split">${options(splits,state.split)}</select></label><label class="grow">Find a card<input id="search" value="${esc(state.search)}" placeholder="Name, fact or case ID…"></label><span class="count">${cases.length} cards</span></div><p class="subtext">Records are unique across splits. Vocabulary is shared; this tests new combinations and question wording, not unseen concepts. Eligibility accumulates from each question's allowed fields. These equal requested fields on person cards; patient cards also allow specified related context.</p>${cases.map(c=>`<article class="dataset-card">${facts(c)}<p class="small">Pattern: ${esc(c.pattern||c.domain)} · Card presentation order: ${esc(c.card_order?.join(", ")||"patient record")}</p><ol class="question-list">${c.questions.map(q=>`<li>${esc(q.text)}<br>${chip("Required: "+q.requested.join(", "))}${q.allowed.join()!==q.requested.join()?chip("Allowed: "+q.allowed.join(", ")):""}</li>`).join("")}</ol></article>`).join("")}`;
}
function contrasts(){
  if(data.fixtures?.length)return fixtures();
  const map=new Map();for(const r of data.drafts||[]){if(!map.has(r.pair_id))map.set(r.pair_id,{});map.get(r.pair_id)[r.side]=r;}
  const retained=new Set(data.extraction?.pairs.map(p=>p.pair_id)||[]), accepted=new Set(data.review?.accepted||[]), candidates=new Set(data.draft_summary?.candidate_ids||[]);
  const status=id=>retained.has(id)?"retained":accepted.has(id)?"reviewed":Object.hasOwn(data.review?.rejected||{},id)?"rejected":candidates.has(id)?"awaiting review":"filtered";
  const pairs=[...map].filter(([id,s])=>(state.pairFilter==="all"||status(id)===state.pairFilter)&&JSON.stringify(s).toLowerCase().includes(state.search.toLowerCase()));
  state.pairIndex=Math.max(0,Math.min(state.pairIndex,pairs.length-1));
  let html=`<div class="toolbar"><label>Pair status<select id="pair-filter">${options(["retained","reviewed","rejected","awaiting review","filtered","all"],state.pairFilter)}</select></label><label class="grow">Find a contrast<input id="search" value="${esc(state.search)}" placeholder="Fact, response text or pair ID…"></label><span class="count">${pairs.length} pairs</span></div><p class="subtext">The model wrote both answers. No answer padding, forced opener or manual rewriting. Same 16-token bin is approximate length control; the actual token counts remain visible.</p>`;
  if(!pairs.length)return html+`<div class="empty">No pairs in this view yet. Choose “all” to inspect generated attempts.</div>`;
  const [id,s]=pairs[state.pairIndex], r=s.selective||s.oversharing, c=data.cases.find(c=>c.id===r.case_id);
  html+=`<div class="pagination"><button id="prev" ${state.pairIndex===0?"disabled":""}>Previous</button><span>${state.pairIndex+1} / ${pairs.length}</span><button id="next" ${state.pairIndex===pairs.length-1?"disabled":""}>Next</button></div>${facts(c)}<div class="panel"><div class="pair-title"><strong>${esc(id)}</strong>${chip(status(id),retained.has(id)?"good":"")}</div><p>Question at turn ${r.turn+1}: <strong>${esc(r.question.text)}</strong></p><p class="small">Designated extra category: ${esc(r.extra_category)}. ${data.review?.rejected?.[id]?"Review: "+esc(data.review.rejected[id]):""}</p>${details("Shared reference conversation history",r.history)}<div class="condition-heads"><div>Selective response</div><div>Oversharing response</div></div><div class="responses">${response(s.selective,s.selective?.score,"Selective")}${response(s.oversharing,s.oversharing?.score,"Oversharing")}</div><p class="small">Automatic behavior filter: selective ${s.selective?.behavior_filter?"passed":"failed / pending"}; oversharing ${s.oversharing?.behavior_filter?"passed":"failed / pending"}.</p></div>`;
  return html;
}
function fixtures(){
  const pairs=[];
  for(let i=0;i<data.fixtures.length;i+=2)pairs.push(data.fixtures.slice(i,i+2));
  state.pairIndex=Math.max(0,Math.min(state.pairIndex,pairs.length-1));
  const pair=pairs[state.pairIndex], c=data.cases.find(c=>c.id===pair[0].case_id);
  return `<div class="callout"><strong>Authored harness fixtures.</strong> These answers were written by the dataset code, then teacher-forced through the model. They were not generated by the model, reviewed training pairs, or length-matched. The separate elicitation runs contain the model-generated attempts.</div><div class="pagination"><button id="prev" ${state.pairIndex===0?"disabled":""}>Previous</button><span>${state.pairIndex+1} / ${pairs.length}</span><button id="next" ${state.pairIndex===pairs.length-1?"disabled":""}>Next</button></div>${facts(c)}<div class="panel"><h2>Fixture ${state.pairIndex+1}</h2><p>Turn ${pair[0].turn+1}: ${esc(c.questions[pair[0].turn].text)}</p><p>Added category: ${esc(pair[0].extra_category)}</p><div class="responses">${pair.map(row=>`<div class="response"><strong>${esc(row.side)}</strong><p class="response-text">${esc(row.answer)}</p>${details("Exact teacher-forcing context",row.messages)}</div>`).join("")}</div></div>`;
}
function developmentView(){
  if(!development?.length)return `<div class="empty">Development archive not loaded.</div>`;
  const d=development[state.devIndex];
  return `<div class="toolbar"><label>Preserved development run<select id="dev-run">${options(development.map((_,i)=>String(i)),String(state.devIndex),i=>development[Number(i)].name)}</select></label></div><div class="panel"><h2>${esc(d.name)}</h2><p>${esc(d.note)}</p>${d.metrics?table(d.metrics):""}${details("Transcript review",d.review||{})}</div>${outputs(d,true)}`;
}
function method(){
 const local=data.smoke?`<h2>What actually ran</h2><p>Twelve authored positive/negative fixture pairs, replayed under the same neutral prompt, test the runtime. Capture the residual after decoder blocks at every response-token position (excluding EOS). Compare the full response mean, last answer token and middle answer token; average pair differences within each card, then cards equally. All layers are captured; this diagnostic fixes zero-based block ${data.smoke.layer} without validation. Last/middle vectors are rescaled to the mean vector's L2 norm.</p><p>Inject at the final prompt token and after each generated token, with fixed strength +1 and an opposite-sign control. Five development cards, four turns and eight conditions produce 160 replies. These fixtures have unequal lengths and shared prefixes; they test execution, not whether we isolated a disclosure trait.</p>`:`<h2>What actually ran</h2><p>Try ${data.draft_summary?.contexts||0} training contexts, three instruction pairs per context, giving ${data.draft_summary?.expected_responses||0} model-generated answers. The ${esc(data.manifest.config.elicitation_style)} elicitation style keeps the complete record available. Trait mode uses long system instructions; compact mode uses shorter scope instructions attached to the question and a simpler system prompt. This changes context and instruction placement as well as length, so it does not isolate a length effect.</p><p>Accept only full requested coverage, zero extras on the selective side and exactly the designated extra on the oversharing side, with no known-wrong value, cutoff or excessive repetition. Both answers must lie in the same 16-token bin. Review candidate pairs before extraction. Zero eligible pairs stops this run; no vector is extracted from failed drafts.</p>`;
 return `<div class="panel methods">${local}<h2>What this task tests</h2><p>A fictional person has six facts: name, job, city, commute, hobby and pet. The player controls which facts become eligible. Some questions ask for one fact, others for several or for the entire record. An early full reveal and repeated questions check whether the model follows the current conversation.</p><h2>Full study protocol${data.evaluation?.test?"":" (not yet completed)"}</h2><p>Three pairs of elicitation instructions generate selective and oversharing answers. Each negative is assigned one still-hidden extra category. Training uses shared truthful reference histories at varied conversation positions. Every automatically eligible pair is reviewed before extraction. Pair quotas balance the extra categories; coarse token bins reduce length differences without making answers unnaturally identical in length.</p><p>The primary direction is selective minus oversharing, measured at decoder-block output and averaged over <strong>all generated answer tokens, excluding EOS</strong>. Multiple pairs from a card are averaged first; cards then receive equal weight. Original elicitation prompts remain in the context, following <a href="https://arxiv.org/abs/2507.21509">Chen et al.</a> Neutral replay measures the same answer tokens under the baseline prompt as a control. Shared prefixes are measured but retained.</p><p>All layers are captured once. Validation tests zero-based blocks 6, 13 and 20 with strengths −1, 0.5 and 1, plus zero. The selected raw vector is added after the final prompt token and every generated token at the chosen block. Random and neutral controls receive the same edit norm. Prompt-only controls have no activation edit.</p><h2>Scores</h2><ul><li><strong>Premature fraction:</strong> distinct correct case facts first disclosed before becoming eligible, divided by all six case facts. Previous requests keep a fact eligible. Every condition uses its own generated history.</li><li><strong>Requested coverage:</strong> fraction of the current question's required facts found in the response, averaged over turns and then cards.</li><li><strong>Full reveal coverage:</strong> coverage only on questions asking for the entire record. A short answer can lose this score.</li><li><strong>Non-name premature fraction:</strong> for person cards, early facts other than the name divided by the five non-name fields. Patient cards have no name field, so this equals their overall premature fraction.</li><li><strong>Known wrong:</strong> proportion of turns matching an incorrect value from the fixed vocabulary or a development-derived relation/error rule. It does not catch every invented assertion.</li><li><strong>Cutoff:</strong> generation reached the 96-token limit without EOS. Generation is greedy.</li></ul><p>Matching is lexical, with limited negation and relation checks. Cities used as work locations, plausible invented explanations and unusual paraphrases can fool it. Inspect the transcript audit; these scores are not semantic or clinical ground truth.</p><h2>Selection and transfer gate</h2><p>Validation utility is mean(requested coverage, full-reveal coverage) minus premature fraction, known-wrong rate and cutoff rate. Zero wins utility ties. The best active setting is tested even if zero is recommended; that does not turn it into a successful intervention.</p><p>The untouched test must show a leakage reduction with its paired 95% interval below zero; coverage must remain within a two-point noninferiority margin, errors/cutoffs must not rise comparably, and non-name leakage must not increase. A preselected transcript sample is reviewed. Only then can the unchanged setting be tried on fresh patient cards, following the course's nonmedical-to-medical question and the masking comparison in <a href="https://arxiv.org/abs/2606.17441">Patients with Personality</a>.</p>${details("Exact model, execution configuration and source hashes",data.manifest)}${details("Extraction diagnostics, lengths and prefix counts",data.extraction||{})}${details("Numerical runtime checks",data.checks||data.runtime_check||{})}<p><a href="experiment.zip">Download the raw run</a>: exact messages, token IDs, vectors and source hashes. Local scientific-choice notes and credentials are not part of the archive.</p></div>`;
}
function comparisonLink(){
 return "#outputs?"+new URLSearchParams({run:data.run,split:state.split,reference:state.reference,condition:state.condition,prematureLeft:state.prematureLeft,prematureRight:state.prematureRight,hidePerfectCards:state.hidePerfectCards?"1":"0",case:state.caseId,search:state.search,turn:state.focusTurn||""}).toString();
}
function jumpToTurn(turn){
 const target=$("#turn-"+turn);if(!target)return;
 state.focusTurn=turn;target.scrollIntoView({block:"start"});target.focus({preventScroll:true});
 if(location.hash.split('?')[0]==="#outputs"){
  history.replaceState(null,"",comparisonLink());
  if($("#comparison-link"))$("#comparison-link").href=comparisonLink();
 }
}
function navigate(){
 const [view,query]=location.hash.slice(1).split('?'), params=new URLSearchParams(query||"");
 const index=runs.findIndex(r=>r.run===params.get("run"));
 if(index>=0&&runs[index]!==data)selectRun(index,false);
 state.search=params.get("search")||"";state.focusTurn=0;
 if(view==="outputs"){
  for(const [param,key] of [["split","split"],["reference","reference"],["condition","condition"],["case","caseId"]])if(params.has(param))state[key]=params.get(param);
  readPrematureFilters(params);
  if(params.has("hidePerfectCards"))state.hidePerfectCards=params.get("hidePerfectCards")==="1";
  const turn=Number(params.get("turn"));if(Number.isSafeInteger(turn)&&turn>0)state.focusTurn=turn;
 }
 render();
}
function render(){
 const view=location.hash.slice(1).split('?')[0]||"overview";
 $("#content").innerHTML=({overview,outputs,dataset,contrasts,development:developmentView,method}[view]||overview)();
 document.querySelectorAll("#navigation a").forEach(a=>a.classList.toggle("active",a.hash==="#"+view));
 for(const [id,key] of [["split","split"],["reference","reference"],["condition","condition"],["premature-left","prematureLeft"],["premature-right","prematureRight"],["pair-filter","pairFilter"]])$("#"+id)?.addEventListener("change",e=>{state[key]=e.target.value;state.pairIndex=0;state.focusTurn=0;render();});
 $("#hide-perfect-cards")?.addEventListener("change",e=>{state.hidePerfectCards=e.target.checked;state.focusTurn=0;render();});
 $("#search")?.addEventListener("change",e=>{state.search=e.target.value;state.pairIndex=0;state.focusTurn=0;render();});
 $("#dev-run")?.addEventListener("change",e=>{state.devIndex=Number(e.target.value);state.caseId="";render();});
 document.querySelectorAll("[data-case]").forEach(b=>b.addEventListener("click",()=>{state.caseId=b.dataset.case;state.focusTurn=0;render();}));
 document.querySelectorAll("[data-turn]").forEach(b=>b.addEventListener("click",()=>jumpToTurn(Number(b.dataset.turn))));
 $("#prev")?.addEventListener("click",()=>{state.pairIndex--;render();});
 $("#next")?.addEventListener("click",()=>{state.pairIndex++;render();});
 if(view==="outputs")history.replaceState(null,"",comparisonLink());
 if(state.focusTurn)jumpToTurn(state.focusTurn);
}
function selectRun(index,draw=true){
 data=runs[index];
 state={split:data.smoke?"diagnostic":"test",reference:"baseline",condition:"steered",hidePerfectCards:false,prematureLeft:"all",prematureRight:"all",focusTurn:0,caseId:"",search:"",pairFilter:data.extraction?"retained":"all",pairIndex:0,devIndex:0};
 $("#run-selector").value=String(index);
 $("#run-badge").textContent=`${data.manifest.config.model} · ${data.manifest.config.quantization||"unquantized"} / ${data.manifest.config.dtype}\n${data.run}`;
 $("#notice").textContent=data.smoke?"Completed harness diagnostic: five development cards, authored fixtures, no held-out result. Read the audit alongside the lexical scores.":data.evaluation?.transfer?`Completed: ${data.manifest.config.test_cases} held-out nonmedical cards and ${data.manifest.config.transfer_cases} fictional patient cards. Read the coverage tradeoffs and transcript audits alongside the lexical scores.`:data.evaluation?.test?`Held-out nonmedical results on ${data.manifest.config.test_cases} cards. Compare coverage and disclosure together, and read the transcript audit for semantic errors the lexical scores miss.`:data.extraction?"Model-generated contrasts have been reviewed and extracted. Validation/test generation is in progress; no final conclusion yet.":"Small-model elicitation trial: generated attempts and filtering results. This run has no validation, test or patient outputs.";
 if(draw)render();
}
async function start(){
 const fetchJson=async p=>{const r=await fetch(p);if(!r.ok)throw new Error(`${p}: ${r.status}`);return r.json();};
 try{
  const [main,old,meta,trials]=await Promise.all([fetchJson("data.json"),fetchJson("development.json").catch(()=>[]),fetchJson("archive.json"),fetchJson("trials.json")]);
  development=old;archive=meta;runs=[main,...trials];
  $("#run-selector").innerHTML=options(runs.map((_,i)=>String(i)),"0",i=>runs[Number(i)].run);
  $("#run-selector").addEventListener("change",e=>selectRun(Number(e.target.value)));
  window.addEventListener("hashchange",navigate);selectRun(0,false);navigate();
 }catch(e){$("#content").innerHTML=`<div class="empty error">Could not load the saved experiment: ${esc(e.message)}. Please reload or inspect the linked repository.</div>`;}
}
start();
