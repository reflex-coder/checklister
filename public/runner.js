// public/runner.js
const state = {
  checklists: [], checklist: null, runId: null,
  runnerName: '', stepIndex: 0, responses: [], answering: false
};
const SCREENS = ['screen-home','screen-name','screen-step','screen-complete'];

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
          <div class="card-meta">${cl.step_count} step${cl.step_count !== 1 ? 's' : ''}</div>
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
    showStep();
  } catch (err) {
    alert('Failed to start run. Please check your connection and try again.');
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
  const skipBtn = step.skippable
    ? '<button class="btn btn-ghost" onclick="answer(\'skip\')">Skip</button>'
    : '';
  document.getElementById('step-actions').innerHTML =
    '<button class="btn btn-no" onclick="answer(\'no\')">&#x2717; No</button>' +
    '<button class="btn btn-yes" onclick="answer(\'yes\')">&#x2713; Yes</button>' +
    skipBtn;
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
}

goHome();
