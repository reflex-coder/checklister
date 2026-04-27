// public/runner.js
const state = {
  checklists: [], checklist: null, runId: null,
  runnerName: '', stepIndex: 0, responses: [], answering: false,
  listMode: false
};
const SCREENS = ['screen-home','screen-name','screen-step','screen-list','screen-complete'];

function show(id) {
  SCREENS.forEach(s => document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function goHome() {
  const res = await fetch('/api/checklists');
  state.checklists = await res.json();
  const el = document.getElementById('checklist-cards');
  if (!state.checklists.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:20px 0;">No checklists yet. <a href="/admin" style="color:var(--accent);">Create one in admin</a></p>';
  } else {
    el.innerHTML = state.checklists.map(cl =>
      `<div class="card" onclick="selectChecklist('${esc(cl.id)}')">
        <div>
          <div class="card-name">${esc(cl.name)}</div>
          <div class="card-meta">${cl.description ? esc(cl.description) + ' · ' : ''}${cl.step_count} step${cl.step_count !== 1 ? 's' : ''}</div>
        </div>
        <div class="card-arrow">›</div>
      </div>`
    ).join('');
  }
  show('screen-home');
}

async function selectChecklist(id) {
  state.checklist = await fetch('/api/checklists/' + id).then(r => r.json());
  document.getElementById('name-title').textContent = state.checklist.name;
  document.getElementById('name-sub').textContent = state.checklist.steps.length + ' steps';
  document.getElementById('runner-name-input').value = '';
  show('screen-name');
}

async function startRun() {
  try {
    state.runnerName = document.getElementById('runner-name-input').value.trim();
    state.stepIndex = 0;
    state.responses = [];
    const run = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist_id: state.checklist.id, runner_name: state.runnerName })
    }).then(r => r.json());
    state.runId = run.id;
    if (state.listMode) { showListScreen(); } else { showStep(); }
  } catch (err) {
    alert('Failed to start run. Please check your connection and try again.');
  }
}

function renderStepActions(step) {
  var container = document.getElementById('step-actions');
  container.textContent = '';
  if (step.no_label) {
    var noBtn = document.createElement('button');
    noBtn.className = 'btn btn-no';
    noBtn.onclick = function() { answer('no'); };
    noBtn.textContent = '✗ ' + step.no_label;
    container.appendChild(noBtn);
  }
  var yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-yes';
  yesBtn.onclick = function() { answer('yes'); };
  yesBtn.textContent = '✓ ' + (step.yes_label || 'Check');
  container.appendChild(yesBtn);
  if (step.skippable) {
    var skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-ghost';
    skipBtn.onclick = function() { answer('skip'); };
    skipBtn.textContent = 'Skip';
    container.appendChild(skipBtn);
  }
}

function showStep() {
  const steps = state.checklist.steps;
  if (state.stepIndex >= steps.length) { completeRun(); return; }
  const step = steps[state.stepIndex];
  const pct = Math.round(state.stepIndex / steps.length * 100);
  document.getElementById('step-progress').style.width = pct + '%';
  document.getElementById('step-label').textContent =
    state.checklist.name + ' · Step ' + (state.stepIndex + 1) + ' of ' + steps.length;
  document.getElementById('step-question').textContent = step.text;
  const noteField = document.getElementById('note-field');
  if (step.allow_note) {
    noteField.classList.remove('hidden');
    document.getElementById('note-input').value = '';
  } else {
    noteField.classList.add('hidden');
  }
  renderStepActions(step);
  show('screen-step');
}

async function answer(ans) {
  if (state.answering) return;
  state.answering = true;
  try {
    const step = state.checklist.steps[state.stepIndex];
    const note = step.allow_note ? document.getElementById('note-input').value.trim() : '';
    state.responses.push({ step_id: step.id, answer: ans, note: note, answered_at: new Date().toISOString() });
    await fetch('/api/runs/' + state.runId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: state.responses })
    });
    state.stepIndex++;
    showStep();
  } catch (err) {
    state.responses.pop();
    alert('Failed to save answer. Please try again.');
  } finally {
    state.answering = false;
  }
}

async function completeRun() {
  try {
    await fetch('/api/runs/' + state.runId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: state.responses, completed_at: new Date().toISOString() })
    });
    document.getElementById('complete-title').textContent = state.checklist.name;
    document.getElementById('complete-sub').textContent =
      (state.runnerName || 'Anonymous') + ' · ' + state.responses.length + ' steps';
    document.getElementById('response-list').innerHTML = state.responses.map(function(r) {
      const step = state.checklist.steps.find(function(s) { return s.id === r.step_id; });
      const icon = r.answer === 'yes' ? '&#x2713;' : r.answer === 'no' ? '&#x2717;' : '&ndash;';
      const noteHtml = r.note ? '<div class="resp-note">' + esc(r.note) + '</div>' : '';
      return '<div class="response-item"><div class="resp-icon">' + icon + '</div><div class="resp-body">' + esc(step ? step.text : r.step_id) + noteHtml + '</div></div>';
    }).join('');
    const notifs = [];
    if (state.checklist.slack_webhook_url) notifs.push('Slack notified');
    if (state.checklist.notification_email) notifs.push('Email sent');
    document.getElementById('notif-status').innerHTML = notifs.map(function(n) {
      return '<div class="notif">' + n + '</div>';
    }).join('');
    show('screen-complete');
  } catch (err) {
    alert('Failed to complete run. Please try again.');
  }
}

function setMode(isListMode) {
  state.listMode = isListMode;
  document.getElementById('mode-step').classList.toggle('active', !isListMode);
  document.getElementById('mode-list').classList.toggle('active', isListMode);
}

function makeListItem(step, i) {
  var item = document.createElement('div');
  item.className = 'list-item';
  item.id = 'list-item-' + i;

  var txt = document.createElement('div');
  txt.className = 'list-item-text';
  txt.textContent = step.text;
  item.appendChild(txt);

  if (step.allow_note) {
    var noteWrap = document.createElement('div');
    noteWrap.className = 'list-note';
    var noteArea = document.createElement('textarea');
    noteArea.id = 'list-note-input-' + i;
    noteArea.placeholder = 'Note (optional)...';
    noteWrap.appendChild(noteArea);
    item.appendChild(noteWrap);
  }

  var btns = document.createElement('div');
  btns.className = 'list-item-btns';

  if (step.no_label) {
    var noBtn = document.createElement('button');
    noBtn.className = 'btn-list-no';
    noBtn.id = 'btn-no-' + i;
    noBtn.textContent = '✗ ' + step.no_label;
    noBtn.onclick = (function(idx) { return function() { listAnswer(idx, 'no'); }; })(i);
    btns.appendChild(noBtn);
  }

  var yesBtn = document.createElement('button');
  yesBtn.className = 'btn-list-yes';
  yesBtn.id = 'btn-yes-' + i;
  yesBtn.textContent = '✓ ' + (step.yes_label || 'Check');
  yesBtn.onclick = (function(idx) { return function() { listAnswer(idx, 'yes'); }; })(i);
  btns.appendChild(yesBtn);

  if (step.skippable) {
    var skipBtn = document.createElement('button');
    skipBtn.className = 'btn-list-skip';
    skipBtn.id = 'btn-skip-' + i;
    skipBtn.textContent = 'Skip';
    skipBtn.onclick = (function(idx) { return function() { listAnswer(idx, 'skip'); }; })(i);
    btns.appendChild(skipBtn);
  }

  item.appendChild(btns);
  return item;
}

function showListScreen() {
  var steps = state.checklist.steps;
  document.getElementById('list-label').textContent = state.checklist.name + ' · ' + steps.length + ' steps';
  var container = document.getElementById('list-steps');
  container.textContent = '';
  steps.forEach(function(step, i) { container.appendChild(makeListItem(step, i)); });
  updateListProgress();
  show('screen-list');
}

async function listAnswer(stepIndex, ans) {
  var step = state.checklist.steps[stepIndex];
  var noteInput = document.getElementById('list-note-input-' + stepIndex);
  var note = (step.allow_note && noteInput) ? noteInput.value.trim() : '';

  var existing = state.responses.findIndex(function(r) { return r.step_id === step.id; });
  var response = { step_id: step.id, answer: ans, note: note, answered_at: new Date().toISOString() };
  if (existing >= 0) { state.responses[existing] = response; } else { state.responses.push(response); }

  ['yes', 'no', 'skip'].forEach(function(a) {
    var btn = document.getElementById('btn-' + a + '-' + stepIndex);
    if (btn) btn.classList.toggle('selected', a === ans);
  });

  updateListProgress();

  fetch('/api/runs/' + state.runId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses: state.responses })
  }).catch(function(err) { console.error('Save error:', err); });
}

function updateListProgress() {
  var total = state.checklist.steps.length;
  var answered = state.responses.length;
  document.getElementById('list-progress').style.width = Math.round(answered / total * 100) + '%';
  document.getElementById('list-counter').textContent = answered + ' of ' + total + ' answered';
  document.getElementById('list-complete-btn').disabled = answered < total;
}

goHome();
