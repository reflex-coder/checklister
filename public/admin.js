// public/admin.js
var editingId = null, stepMeta = [], regenTimer = null;

async function apiFetch(url, options) {
  var res = await fetch(url, options);
  if (res.status === 401) { window.location.href = '/admin/login'; return null; }
  return res;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function g(id) { return document.getElementById(id); }
function showV(id) {
  ['view-list','view-editor','view-log'].forEach(function(x) { g(x).classList.add('hidden'); });
  g(id).classList.remove('hidden');
}

async function showList() {
  showV('view-list');
  var r = await apiFetch('/api/checklists');
  if (!r) return;
  var lists = await r.json();
  var tbody = g('tbl');
  if (!lists.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:20px;">No checklists yet.</td></tr>';
    return;
  }
  tbody.innerHTML = lists.map(function(cl) {
    var notifs = [cl.slack_webhook_url ? 'Slack' : '', cl.notification_email ? 'Email' : ''].filter(Boolean).join(', ') || 'None';
    return '<tr>' +
      '<td class="td-name">' + esc(cl.name) + '</td>' +
      '<td class="td-m">' + cl.step_count + '</td>' +
      '<td class="td-m">' + cl.run_count + '</td>' +
      '<td class="td-m">' + notifs + '</td>' +
      '<td><div class="acts">' +
        '<button class="act" onclick="editCl(\'' + esc(cl.id) + '\')">Edit</button>' +
        '<button class="act" onclick="viewLog(\'' + esc(cl.id) + '\')">Runs</button>' +
        '<button class="act del" onclick="deleteCl(\'' + esc(cl.id) + '\',\'' + esc(cl.name) + '\')">Delete</button>' +
      '</div></td>' +
      '</tr>';
  }).join('');
}

async function showEditor(cl) {
  editingId = cl ? cl.id : null;
  g('ed-heading').textContent = cl ? ('Edit: ' + cl.name) : 'New Checklist';
  g('ed-name').value = cl ? cl.name : '';
  g('ed-desc').value = cl ? cl.description : '';
  g('ed-slack').value = cl ? cl.slack_webhook_url : '';
  g('ed-email').value = cl ? cl.notification_email : '';
  if (cl && cl.steps.length) {
    g('ed-steps').value = cl.steps.map(function(s) { return s.text; }).join('\n');
    stepMeta = cl.steps.map(function(s) { return { allow_note: s.allow_note, skippable: s.skippable, yes_label: s.yes_label || '', no_label: s.no_label || '' }; });
  } else {
    g('ed-steps').value = '';
    stepMeta = [];
  }
  regenOpts();
  showV('view-editor');
}

async function editCl(id) {
  var r = await apiFetch('/api/checklists/' + id);
  if (!r) return;
  showEditor(await r.json());
}

async function viewLog(id) {
  var r1 = await apiFetch('/api/checklists/' + id);
  if (!r1) return;
  var cl = await r1.json();
  var r2 = await apiFetch('/api/runs?checklist_id=' + id);
  if (!r2) return;
  var runs = await r2.json();
  g('log-heading').textContent = 'Run Log: ' + cl.name;
  var box = g('log-box');
  if (!runs.length) {
    box.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:14px;">No runs yet.</div>';
    showV('view-log');
    return;
  }
  box.innerHTML = runs.map(function(run, i) {
    var done = !!run.completed_at;
    var yes = run.responses.filter(function(r) { return r.answer === 'yes'; }).length;
    var detail = run.responses.map(function(r) {
      var step = cl.steps.find(function(s) { return s.id === r.step_id; });
      var icon = r.answer === 'yes' ? '&#10003;' : r.answer === 'no' ? '&#10007;' : '&ndash;';
      var noteHtml = r.note ? ' <span style="color:#888;">(' + esc(r.note) + ')</span>' : '';
      return '<div class="log-detail-row">' + icon + ' ' + esc(step ? step.text : r.step_id) + noteHtml + '</div>';
    }).join('');
    return '<div class="log-row" onclick="g(\'ld' + i + '\').classList.toggle(\'open\')">' +
      '<div class="log-dot ' + (done ? '' : 'inc') + '"></div>' +
      '<div class="log-info"><div class="log-name">' + esc(run.runner_name || 'Anonymous') + '</div>' +
      '<div class="log-meta">' + new Date(run.started_at).toLocaleString() + '</div></div>' +
      '<div class="log-score">' + (done ? yes + '/' + cl.steps.length : 'Abandoned') + '</div>' +
      '</div>' +
      '<div class="log-detail" id="ld' + i + '">' + detail + '</div>';
  }).join('');
  showV('view-log');
}

async function deleteCl(id, name) {
  if (!confirm('Delete "' + name + '"? All run history will be lost.')) return;
  var res = await apiFetch('/api/checklists/' + id, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) { alert('Failed to delete checklist. Please try again.'); return; }
  showList();
}

function scheduleRegen() { clearTimeout(regenTimer); regenTimer = setTimeout(regenOpts, 400); }

function regenOpts() {
  var lines = g('ed-steps').value.split('\n').filter(function(l) { return l.trim(); });
  while (stepMeta.length < lines.length) stepMeta.push({ allow_note: false, skippable: false, yes_label: '', no_label: '' });
  stepMeta = stepMeta.slice(0, lines.length);
  var wrap = g('opts-wrap'), opts = g('opts');
  if (!lines.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  opts.innerHTML = lines.map(function(line, i) {
    return '<div class="sopt">' +
      '<div class="sopt-text">' + esc(line) + '</div>' +
      '<div class="tg">' +
        '<label class="tog"><input type="checkbox" ' + (stepMeta[i].allow_note ? 'checked' : '') + ' onchange="stepMeta[' + i + '].allow_note=this.checked"> Allow note</label>' +
        '<label class="tog"><input type="checkbox" ' + (stepMeta[i].skippable ? 'checked' : '') + ' onchange="stepMeta[' + i + '].skippable=this.checked"> Skippable</label>' +
      '</div></div>';
  }).join('');
}

async function saveChecklist() {
  var name = g('ed-name').value.trim();
  if (!name) { alert('Name is required.'); return; }
  var lines = g('ed-steps').value.split('\n').filter(function(l) { return l.trim(); });
  var existingSteps = [];
  if (editingId) {
    var er = await apiFetch('/api/checklists/' + editingId);
    if (!er) return;
    existingSteps = (await er.json()).steps;
  }
  var steps = lines.map(function(text, i) {
    return {
      id: existingSteps[i] ? existingSteps[i].id : generateId(),
      text: text,
      allow_note: stepMeta[i] ? !!stepMeta[i].allow_note : false,
      skippable: stepMeta[i] ? !!stepMeta[i].skippable : false,
      yes_label: stepMeta[i] ? (stepMeta[i].yes_label || '').trim() : '',
      no_label: stepMeta[i] ? (stepMeta[i].no_label || '').trim() : ''
    };
  });
  var body = {
    name: name,
    description: g('ed-desc').value.trim(),
    steps: steps,
    slack_webhook_url: g('ed-slack').value.trim(),
    notification_email: g('ed-email').value.trim()
  };
  var method = editingId ? 'PUT' : 'POST';
  var url = editingId ? '/api/checklists/' + editingId : '/api/checklists';
  var res = await apiFetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res) return;
  if (!res.ok) { alert('Failed to save checklist. Please try again.'); return; }
  showList();
}

function generateId() {
  return crypto.randomUUID();
}

function exportJson() {
  var lines = g('ed-steps').value.split('\n').filter(function(l) { return l.trim(); });
  var steps = lines.map(function(text, i) {
    return { id: generateId(), text: text, allow_note: stepMeta[i] ? !!stepMeta[i].allow_note : false, skippable: stepMeta[i] ? !!stepMeta[i].skippable : false };
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(steps, null, 2)], { type: 'application/json' }));
  a.download = 'checklist-steps.json';
  a.click();
}

function importJson() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var steps = JSON.parse(ev.target.result);
        g('ed-steps').value = steps.map(function(s) { return s.text; }).join('\n');
        stepMeta = steps.map(function(s) { return { allow_note: !!s.allow_note, skippable: !!s.skippable, yes_label: s.yes_label || '', no_label: s.no_label || '' }; });
        regenOpts();
      } catch(err) { alert('Invalid JSON file.'); }
    };
    reader.readAsText(e.target.files[0]);
  };
  input.click();
}

function addLabelInputs() {
  document.querySelectorAll('#opts .sopt').forEach(function(sopt, i) {
    if (!stepMeta[i]) return;
    var tg = sopt.querySelector('.tg');
    var pair = document.createElement('div');
    pair.className = 'lbl-pair';

    var yesIn = document.createElement('input');
    yesIn.className = 'lbl-in';
    yesIn.type = 'text';
    yesIn.placeholder = 'Yes';
    yesIn.value = stepMeta[i].yes_label || '';
    yesIn.addEventListener('input', (function(idx) {
      return function() { stepMeta[idx].yes_label = this.value; };
    })(i));

    var noIn = document.createElement('input');
    noIn.className = 'lbl-in';
    noIn.type = 'text';
    noIn.placeholder = 'No';
    noIn.value = stepMeta[i].no_label || '';
    noIn.addEventListener('input', (function(idx) {
      return function() { stepMeta[idx].no_label = this.value; };
    })(i));

    pair.appendChild(yesIn);
    pair.appendChild(noIn);
    tg.insertBefore(pair, tg.firstChild);
  });
}

function addBulkBar() {
  var existing = document.getElementById('bulk-bar');
  if (existing) existing.remove();
  if (!document.querySelectorAll('#opts .sopt').length) return;
  var bar = document.createElement('div');
  bar.id = 'bulk-bar';
  bar.className = 'bulk-bar';
  [{ label: 'Allow note:', field: 'allow_note' }, { label: 'Skippable:', field: 'skippable' }].forEach(function(item, idx) {
    if (idx) { var s = document.createElement('span'); s.style.marginLeft = '10px'; bar.appendChild(s); }
    var lbl = document.createElement('span'); lbl.className = 'bulk-label'; lbl.textContent = item.label; bar.appendChild(lbl);
    var on = document.createElement('button'); on.className = 'bulk-btn'; on.textContent = 'All on'; on.onclick = (function(f) { return function() { bulkSet(f, true); }; })(item.field); bar.appendChild(on);
    var off = document.createElement('button'); off.className = 'bulk-btn'; off.textContent = 'All off'; off.onclick = (function(f) { return function() { bulkSet(f, false); }; })(item.field); bar.appendChild(off);
  });
  document.getElementById('opts').parentNode.insertBefore(bar, document.getElementById('opts'));
}

function bulkSet(field, value) {
  stepMeta.forEach(function(m) { m[field] = value; });
  regenOpts();
}

var _regenOpts = regenOpts;
regenOpts = function() { _regenOpts(); addBulkBar(); addLabelInputs(); };

showList();
