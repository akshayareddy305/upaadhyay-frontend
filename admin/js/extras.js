// admin/js/extras.js — sort (newest/oldest), CSV export on every list, college-card Job Applications view,
// faculty detail drawer. Loaded last; uses the same /api/admin/* endpoints as the rest of the console.

/* ---------- helpers ---------- */
window.__sortOld = false;
const DATE_KEYS = ['created_at', 'applied_at', 'submitted_at', 'sent_at', 'uploaded_at'];
const _rowDate = function(r){ for(const k of DATE_KEYS){ if(r && r[k]) return new Date(r[k]).getTime() || 0; } return 0; };
// Newest/oldest: ask the server (sort=) and also order each returned page so it works even if the API ignores the param.
(function(){
  const og = api.get.bind(api);
  api.get = async function(path){
    const isList = /^\/admin\/(companies|applications|users|jobs|files|notifications|branch-requests)/.test(path);
    if(isList) path += (path.indexOf('?') < 0 ? '?' : '&') + 'sort=' + (window.__sortOld ? 'oldest' : 'newest');
    const res = await og.apply(null, [path].concat([].slice.call(arguments, 1)));
    if(isList && res && Array.isArray(res.data)) res.data.sort(function(a, b){ return window.__sortOld ? _rowDate(a) - _rowDate(b) : _rowDate(b) - _rowDate(a); });
    return res;
  };
})();
async function fetchAll(path, params){
  let page = 1, last = 1, out = [];
  do{
    const r = await api.get(path + qs(Object.assign({}, params, { page: page, per_page: 100 })));
    out = out.concat((r && r.data) || []); last = (r && r.last_page) || 1; page++;
  }while(page <= last && page <= 30);
  return out;
}
function downloadCSV(name, head, rows){
  const f = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  const csv = '\ufeff' + [head].concat(rows).map(function(r){ return r.map(f).join(','); }).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}
const loc = function(o){ return [o.city, o.state].filter(Boolean).join(', '); };
const appRow = function(a){ const c = a.candidate || {}, j = a.job || {}, co = j.company || {}; return [c.name, c.email, j.title, co.company_name, fmtDate(a.applied_at || a.created_at), statusLabel(a.status)]; };
const APP_HEAD = ['Applicant', 'Email', 'Job', 'Institution', 'Applied', 'Status'];

/* ---------- export definitions (fetch ALL pages with the current filters) ---------- */
const EXP = {
  institutions:{ path:'/admin/companies', p:function(){ return { status:S.inst.status, search:S.inst.search }; },
    head:['Institution', 'Code', 'Type', 'Contact', 'Email', 'Location', 'Registered', 'Jobs', 'Status'],
    row:function(c){ const u = c.user || {}; return [c.company_name, c.institution_code, c.industry, u.name, u.email || c.email, loc(c), fmtDate(c.created_at), c.jobs_count || 0, statusLabel(c.verification_status)]; } },
  branches:{ path:'/admin/branch-requests', p:function(){ return { status:S.br.status }; },
    head:['Sub-branch', 'Email', 'Location', 'Main institution', 'Main decision', 'Admin decision', 'Submitted'],
    row:function(b){ return [b.name, b.email, loc(b), (b.main || {}).name, b.main_status, b.admin_status, fmtDate(b.submitted_at)]; } },
  faculty:{ path:'/admin/users', p:function(){ return { role:'candidate', status:S.fac.status, search:S.fac.search }; },
    head:['Name', 'Email', 'Phone', 'Current role', 'Location', 'Experience (yrs)', 'Account', 'Registered'],
    row:function(u){ const p = u.candidate_profile || u.candidateProfile || {}; return [u.name, u.email, u.phone, p.current_job_title, loc(p), p.total_experience, u.status, fmtDate(u.created_at)]; } },
  jobs:{ path:'/admin/jobs', p:function(){ return { status:S.jobs.status, search:S.jobs.search }; },
    head:['Job', 'Category', 'Institution', 'Location', 'Applicants', 'Status', 'Posted'],
    row:function(j){ return [j.title, (j.category || {}).name, (j.company || {}).company_name, loc(j), j.applications_count || 0, j.status, fmtDate(j.created_at)]; } },
  files:{ path:'/admin/files', p:function(){ return { category:S.files.category }; },
    head:['File', 'Owner', 'Owner email', 'Category', 'Size', 'Uploaded'],
    row:function(f){ const o = f.user || f.owner || {}; return [f.original_name || f.name, o.name, o.email, f.category, fmtSize(f.size), fmtDate(f.created_at)]; } },
  notifications:{ path:'/admin/notifications', p:function(){ return {}; },
    head:['To', 'Title', 'Message', 'Sent'],
    row:function(n){ const u = n.user || {}; return [u.name || u.email || n.audience || 'All', n.title, n.message || n.body, fmtDate(n.created_at)]; } }
};
async function exportTab(tab){
  if(tab === 'overview'){
    const d = S.dash || await loadDashboard(); if(!d){ toast('Nothing to export yet.', true); return; }
    downloadCSV('overview', ['Metric', 'Value'], [['Institutions to review', (d.companies_by_status || {}).pending || 0], ['Approved institutions', (d.companies_by_status || {}).approved || 0], ['Registered institutions', d.total_companies], ['Live jobs', d.active_jobs], ['Total jobs', d.total_jobs], ['Job applications', d.total_applications], ['Faculty registered', d.total_candidates]]); return;
  }
  const e = EXP[tab]; if(!e) return;
  toast('Preparing export…');
  try{ const rows = await fetchAll(e.path, e.p()); downloadCSV(tab, e.head, rows.map(e.row)); toast(rows.length + ' records exported.'); }
  catch(err){ toast(err.message || 'Export failed.', true); }
}
window.exportTab = exportTab;

/* ---------- toolbar: sort + export on every page ---------- */
function toolsHtml(tab, withSort){
  return '<span class="x-tools">' + (withSort === false ? '' : '<select class="x-sort" aria-label="Sort by date"><option value="new">Newest first</option><option value="old">Oldest first</option></select>')
    + '<button type="button" class="btn btn-ghost btn-sm" data-export="' + tab + '">⤓ Export CSV</button></span>';
}
function addTools(){
  [['institutions', 'Institutions'], ['branches', 'Branches'], ['faculty', 'Faculty'], ['jobs', 'Jobs'], ['files', 'Files'], ['notifications', 'Notifications']].forEach(function(t){
    const panel = $('panel' + t[1]); if(!panel) return;
    const bar = panel.querySelector('.admin-search-row, .admin-toolbar, .admin-panel-head'); if(bar && !bar.querySelector('.x-tools')) bar.insertAdjacentHTML('beforeend', toolsHtml(t[0]));
  });
  $('ovTools').innerHTML = toolsHtml('overview');
}
document.addEventListener('click', function(e){ const b = e.target.closest('[data-export]'); if(b) exportTab(b.dataset.export); });
document.addEventListener('change', function(e){
  if(!e.target.classList.contains('x-sort')) return;
  window.__sortOld = e.target.value === 'old';
  document.querySelectorAll('.x-sort').forEach(function(s){ s.value = e.target.value; });
  if(S.tab === 'applications') renderApps(); else adminGo(S.tab);
});
addTools();
$('ovSearch').addEventListener('input', function(){
  const q = this.value.trim().toLowerCase();
  document.querySelectorAll('#ovPending tr, #ovApps tr').forEach(function(r){ r.style.display = !q || r.textContent.toLowerCase().indexOf(q) > -1 ? '' : 'none'; });
});
const _lo = window.loadOverview; window.loadOverview = function(){ $('ovSearch').value = ''; return _lo.apply(this, arguments); };

/* ---------- Job Applications: college cards → college → job → applications ---------- */
const AV = { data:null, level:'colleges', co:null, job:null, q:'', order:'new' };
async function loadAppData(){
  const r = await Promise.all([fetchAll('/admin/companies', {}), fetchAll('/admin/jobs', {}), fetchAll('/admin/applications', {})]);
  const cos = {};
  r[0].forEach(function(c){ cos[c.id] = { co:c, jobs:[], apps:[] }; });
  const jobById = {};
  r[1].forEach(function(j){ const cid = (j.company || {}).id || j.company_id; if(!cos[cid]) cos[cid] = { co:j.company || { id:cid, company_name:'Institution #' + cid }, jobs:[], apps:[] }; cos[cid].jobs.push(j); jobById[j.id] = j; });
  r[2].forEach(function(a){ const j = a.job || {}, cid = (j.company || {}).id || (jobById[a.job_id || j.id] || {}).company_id; if(cos[cid]) cos[cid].apps.push(a); });
  AV.data = { cos:cos, apps:r[2] };
}
async function renderApps(){
  const root = $('appCards');
  if(!AV.data){ root.innerHTML = '<div class="admin-loading">Loading…</div>'; try{ await loadAppData(); }catch(e){ root.innerHTML = '<div class="admin-error"><span>' + esc(e.message) + '</span><button type="button" class="btn btn-ghost btn-sm" onclick="loadApplications()">Retry</button></div>'; return; } }
  const sortSel = '<select class="x-sort" aria-label="Sort"><option value="new"' + (window.__sortOld ? '' : ' selected') + '>Newest first</option><option value="old"' + (window.__sortOld ? ' selected' : '') + '>Oldest first</option></select>';
  const dir = window.__sortOld ? 1 : -1, byDate = function(a, b){ return dir * (_rowDate(a) - _rowDate(b)); };
  if(AV.level === 'colleges'){
    const q = AV.q.toLowerCase();
    const list = Object.keys(AV.data.cos).map(function(k){ return AV.data.cos[k]; }).filter(function(x){ return !q || (x.co.company_name || '').toLowerCase().indexOf(q) > -1 || loc(x.co).toLowerCase().indexOf(q) > -1; }).sort(function(a, b){ return byDate(a.co, b.co); });
    root.innerHTML = '<div class="xc-head"><h3>Colleges &amp; institutions</h3><input type="search" id="avQ" placeholder="Search college or city" value="' + esc(AV.q) + '"><span class="muted">' + list.length + ' colleges</span>' + sortSel
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="xaExport(\'colleges\')">⤓ Export CSV</button></div>'
      + '<div class="xc-grid">' + (list.map(function(x){ return '<div class="xc-card" onclick="xaCollege(' + x.co.id + ')"><div class="xc-top">' + avatarHtml(x.co.company_name, x.co.logo) + '<div><b>' + esc(x.co.company_name) + '</b><small>' + esc(loc(x.co) || '—') + '</small></div></div>'
        + '<div class="xc-stats"><div class="xc-stat"><b>' + x.jobs.length + '</b><span>Jobs posted</span></div><div class="xc-stat"><b>' + x.apps.length + '</b><span>Applications</span></div></div></div>'; }).join('') || '<div class="admin-empty">No colleges found.</div>') + '</div>';
    const qi = $('avQ'); qi.addEventListener('input', function(){ AV.q = qi.value; const p = qi.selectionStart; renderApps().then(function(){ const n = $('avQ'); n.focus(); n.setSelectionRange(p, p); }); });
    return;
  }
  const x = AV.data.cos[AV.co]; if(!x){ AV.level = 'colleges'; return renderApps(); }
  const c = x.co, crumb = '<div class="xc-crumb"><a onclick="xaBack(\'colleges\')">All colleges</a> › ' + (AV.level === 'job' ? '<a onclick="xaBack(\'college\')">' + esc(c.company_name) + '</a> › ' + esc((x.jobs.filter(function(j){ return j.id === AV.job; })[0] || {}).title || 'Job') : esc(c.company_name)) + '</div>';
  if(AV.level === 'college'){
    const kv = function(k, v){ return v ? '<div><span>' + k + '</span>' + esc(v) + '</div>' : ''; }, u = c.user || {};
    root.innerHTML = crumb + '<div class="admin-panel"><div class="admin-panel-head"><span style="display:flex;gap:10px;align-items:center">' + avatarHtml(c.company_name, c.logo) + esc(c.company_name) + ' ' + pill(c.verification_status || 'pending') + '</span>'
      + '<span class="x-tools"><a class="btn btn-ghost btn-sm" href="company.html?id=' + c.id + '">Full profile</a><button type="button" class="btn btn-ghost btn-sm" onclick="xaExport(\'jobs\')">⤓ Export jobs</button></span></div>'
      + '<div class="xc-about">' + kv('Type', c.industry) + kv('Institution code', c.institution_code) + kv('Location', [c.address, loc(c)].filter(Boolean).join(', ')) + kv('Email', c.email || u.email) + kv('Phone', c.phone || u.phone) + kv('Website', c.website) + kv('Registered', c.created_at ? fmtDate(c.created_at) : '')
      + kv('Jobs posted', x.jobs.length) + kv('Applications', x.apps.length) + (c.description ? '<p>' + esc(c.description) + '</p>' : '') + '</div></div>'
      + '<div class="xc-head"><h3>Jobs posted (' + x.jobs.length + ')</h3>' + sortSel + '</div><div class="xc-grid">'
      + (x.jobs.slice().sort(byDate).map(function(j){ const n = x.apps.filter(function(a){ return ((a.job || {}).id || a.job_id) === j.id; }).length; return '<div class="xc-card xc-job" onclick="xaJob(' + j.id + ')"><b>' + esc(j.title) + '</b><small>' + esc((j.category || {}).name || '') + ' · ' + esc(loc(j) || '—') + '</small><div class="xc-jobmeta"><span>' + pill(j.status === 'published' ? 'live' : j.status) + '</span><span><b>' + n + '</b> applications</span></div><small style="margin:6px 0 0">Posted ' + esc(fmtDate(j.created_at)) + '</small></div>'; }).join('') || '<div class="admin-empty">This college has not posted any jobs.</div>') + '</div>';
    return;
  }
  const j = x.jobs.filter(function(y){ return y.id === AV.job; })[0] || {}, apps = x.apps.filter(function(a){ return ((a.job || {}).id || a.job_id) === j.id; }).sort(byDate);
  const kv = function(k, v){ return v ? '<div><span>' + k + '</span>' + esc(v) + '</div>' : ''; };
  root.innerHTML = crumb + '<div class="admin-panel"><div class="admin-panel-head"><span>' + esc(j.title) + ' ' + pill(j.status === 'published' ? 'live' : j.status) + '</span><span class="x-tools"><button type="button" class="btn btn-ghost btn-sm" onclick="editJob(' + j.id + ')">Edit</button></span></div>'
    + '<div class="xc-about">' + kv('Category', (j.category || {}).name) + kv('Location', loc(j)) + kv('Job type', j.job_type || j.employment_type) + kv('Experience', j.experience || j.experience_required) + kv('Salary', j.salary || j.salary_range) + kv('Vacancies', j.vacancies || j.openings) + kv('Posted', fmtDate(j.created_at)) + kv('Last date', j.last_date || j.deadline ? fmtDate(j.last_date || j.deadline) : '')
    + (j.description ? '<p>' + esc(j.description) + '</p>' : '') + '</div></div>'
    + '<div class="admin-panel"><div class="admin-panel-head"><span>Applications (' + apps.length + ')</span><span class="x-tools">' + sortSel + '<button type="button" class="btn btn-ghost btn-sm" onclick="xaExport(\'apps\')">⤓ Export CSV</button></span></div><div class="admin-scroll"><table class="admin-table"><thead><tr><th>Applicant</th><th>Applied</th><th>Status</th><th class="act"></th></tr></thead><tbody>'
    + (apps.map(function(a){ const cd = a.candidate || {}, fid = a.resume && a.resume.file && a.resume.file.id; return '<tr><td><div class="admin-row-name">' + avatarHtml(cd.name) + '<div>' + esc(cd.name || '—') + '<small>' + esc(cd.email || '') + '</small></div></div></td><td>' + esc(fmtDate(a.applied_at || a.created_at)) + '</td><td>' + pill(a.status) + '</td>'
      + '<td class="act"><div class="admin-rowbtns">' + (fid ? '<button type="button" class="btn btn-ghost btn-sm" onclick="openFile(' + fid + ')">Resume</button>' : '') + '<button type="button" class="btn btn-ghost btn-sm" onclick="changeAppStatus(' + a.id + ',\'' + esc(a.status) + '\')">Status</button><button type="button" class="btn btn-ghost btn-sm danger" onclick="deleteApplication(' + a.id + ')">Delete</button></div></td></tr>'; }).join('') || '<tr><td colspan="4" class="admin-empty">No applications for this job yet.</td></tr>') + '</tbody></table></div></div>';
}
window.loadApplications = async function(){ AV.data = null; return renderApps(); };   // also called after status change / delete
window.xaCollege = function(id){ AV.level = 'college'; AV.co = id; renderApps(); window.scrollTo(0, 0); };
window.xaJob = function(id){ AV.level = 'job'; AV.job = id; renderApps(); window.scrollTo(0, 0); };
window.xaBack = function(l){ AV.level = l; renderApps(); };
window.xaExport = function(kind){
  const d = AV.data; if(!d) return;
  if(kind === 'colleges') return downloadCSV('colleges', ['College', 'Location', 'Jobs posted', 'Applications'], Object.keys(d.cos).map(function(k){ const x = d.cos[k]; return [x.co.company_name, loc(x.co), x.jobs.length, x.apps.length]; }));
  const x = d.cos[AV.co];
  if(kind === 'jobs') return downloadCSV('jobs-' + (x.co.company_name || 'college'), ['Job', 'Category', 'Location', 'Status', 'Applications', 'Posted'], x.jobs.map(function(j){ return [j.title, (j.category || {}).name, loc(j), j.status, x.apps.filter(function(a){ return ((a.job || {}).id || a.job_id) === j.id; }).length, fmtDate(j.created_at)]; }));
  downloadCSV('applications-' + (x.co.company_name || 'college'), APP_HEAD, x.apps.filter(function(a){ return ((a.job || {}).id || a.job_id) === AV.job; }).map(appRow));
};

/* ---------- Faculty: click a record → detail drawer (profile · applied jobs · files · actions) ---------- */
const _lf = window.loadFaculty;
window.loadFaculty = async function(){
  await _lf.apply(this, arguments);
  document.querySelectorAll('#facBody tr').forEach(function(tr){
    const b = tr.querySelector('button[onclick^="editUser("]'); if(!b) return;
    const id = Number(b.getAttribute('onclick').match(/\d+/)[0]);
    tr.classList.add('clickable'); tr.onclick = function(e){ if(!e.target.closest('.admin-rowbtns')) openFaculty(id); };
  });
};
async function openFaculty(id, tab){
  let u; try{ u = await api.get('/admin/users/' + id); }catch(e){ toast(e.message, true); return; }
  const p = u.candidate_profile || u.candidateProfile || {}, blocked = u.status === 'blocked';
  let ov = document.querySelector('.xd-bg'); if(ov) ov.remove();
  ov = document.createElement('div'); ov.className = 'xd-bg';
  const nm = String(u.name || '').replace(/'/g, '');
  ov.innerHTML = '<div class="xd" role="dialog" aria-modal="true"><div class="xd-top">' + avatarHtml(u.name, p.profile_photo) + '<div><b>' + esc(u.name) + '</b><small>' + esc(u.email) + '</small></div><button type="button" class="xd-x" aria-label="Close">×</button></div>'
    + '<div class="xd-tabs">' + [['info', 'Information'], ['jobs', 'Jobs applied'], ['files', 'Files'], ['act', 'Actions']].map(function(t){ return '<button type="button" class="admin-tab' + (t[0] === (tab || 'info') ? ' active' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div class="xd-body" id="xdBody"></div></div>';
  document.body.appendChild(ov);
  const body = ov.querySelector('#xdBody'), close = function(){ ov.remove(); };
  ov.addEventListener('click', function(e){ if(e.target === ov || e.target.classList.contains('xd-x')) close(); });
  const kv = function(k, v){ return '<div class="xd-kv"><span>' + k + '</span><b>' + esc(v || '—') + '</b></div>'; };
  async function show(t){
    ov.querySelectorAll('.xd-tabs .admin-tab').forEach(function(b){ b.classList.toggle('active', b.dataset.t === t); });
    if(t === 'info') body.innerHTML = kv('Phone', u.phone) + kv('Current role', p.current_job_title) + kv('Location', loc(p)) + kv('Experience', p.total_experience != null && p.total_experience !== '' ? p.total_experience + ' yrs' : '') + kv('Qualification', p.highest_qualification || p.qualification) + kv('Registered', fmtDate(u.created_at)) + kv('Account', statusLabel(blocked ? 'blocked' : 'active')) + (p.bio || p.about ? '<p style="color:var(--ink-soft)">' + esc(p.bio || p.about) + '</p>' : '');
    if(t === 'jobs'){
      body.innerHTML = '<div class="admin-loading">Loading…</div>';
      try{
        const apps = (await fetchAll('/admin/applications', { search:u.email })).filter(function(a){ return (a.candidate || {}).id === u.id || (a.candidate || {}).email === u.email; });
        body.innerHTML = (apps.map(function(a){ const j = a.job || {}; return '<div class="xd-item"><div><b>' + esc(j.title || '—') + '</b><small>' + esc((j.company || {}).company_name || '—') + ' · ' + esc(fmtDate(a.applied_at || a.created_at)) + '</small></div>' + pill(a.status) + '</div>'; }).join('') || '<div class="admin-empty">No job applications yet.</div>')
          + (apps.length ? '<div class="xd-acts"><button type="button" class="btn btn-ghost btn-sm" id="xdExp">⤓ Export CSV</button></div>' : '');
        const eb = body.querySelector('#xdExp'); if(eb) eb.onclick = function(){ downloadCSV('applications-' + nm, APP_HEAD, apps.map(appRow)); };
      }catch(e){ body.innerHTML = '<div class="admin-error"><span>' + esc(e.message) + '</span></div>'; }
    }
    if(t === 'files'){
      body.innerHTML = '<div class="admin-loading">Loading…</div>';
      try{
        const fs = (await fetchAll('/admin/files', {})).filter(function(f){ const o = f.user || f.owner || {}; return f.user_id === u.id || o.id === u.id || o.email === u.email; });
        body.innerHTML = fs.map(function(f){ return '<div class="xd-item"><div><b>' + esc(f.original_name || f.name) + '</b><small>' + esc(statusLabel(f.category)) + ' · ' + esc(fmtSize(f.size)) + ' · ' + esc(fmtDate(f.created_at)) + '</small></div><button type="button" class="btn btn-ghost btn-sm" onclick="openFile(' + f.id + ')">View</button></div>'; }).join('') || '<div class="admin-empty">No files uploaded.</div>';
      }catch(e){ body.innerHTML = '<div class="admin-error"><span>' + esc(e.message) + '</span></div>'; }
    }
    if(t === 'act') body.innerHTML = '<div class="xd-acts"><button type="button" class="btn btn-primary btn-sm" data-a="edit">Edit account</button><button type="button" class="btn btn-ghost btn-sm' + (blocked ? '' : ' danger') + '" data-a="block">' + (blocked ? 'Unblock' : 'Block') + '</button><button type="button" class="btn btn-ghost btn-sm danger" data-a="del">Delete</button></div>';
  }
  ov.querySelector('.xd-tabs').addEventListener('click', function(e){ const b = e.target.closest('[data-t]'); if(b) show(b.dataset.t); });
  body.addEventListener('click', function(e){
    const b = e.target.closest('[data-a]'); if(!b) return; close();
    if(b.dataset.a === 'edit') editUser(id); if(b.dataset.a === 'block') toggleUser(id, !blocked, nm); if(b.dataset.a === 'del') deleteUser(id, nm);
  });
  show(tab || 'info');
}
window.openFaculty = openFaculty;
