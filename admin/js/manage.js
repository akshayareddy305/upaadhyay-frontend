// admin/js/manage.js — edit / delete / update screens for the admin console. Loaded after admin.js.
// Every call goes to the Laravel API (/api/admin/* plus the shared PUT /applications/{id}/status and PUT /jobs/{id}).

/* ---------- small helpers ---------- */
function run(promise, okMsg, after){
  return promise.then(function(r){ if(okMsg) toast(okMsg); if(after) after(r); return r; })
    .catch(function(e){ toast(e.message || 'Something went wrong.', true); });
}
function bindPager(id, st, loader){
  document.getElementById(id).addEventListener('click', function(e){
    const b = e.target.closest('[data-page]'); if(!b || b.disabled) return;
    st.page += b.dataset.page === 'next' ? 1 : -1; loader();
  });
}
function applyPg(st, res){ st.page = (res && res.current_page) || 1; st.last = (res && res.last_page) || 1; st.total = (res && res.total) || 0; }
function q(id){ return document.getElementById(id); }
function rowsOrEmpty(rows, cols, msg){ return rows.length ? rows.join('') : '<tr><td colspan="' + cols + '" class="admin-empty">' + esc(msg) + '</td></tr>'; }
function loadingRow(cols){ return '<tr><td colspan="' + cols + '" class="admin-loading">Loading…</td></tr>'; }
function failRow(cols, e, fn){ return '<tr><td colspan="' + cols + '"><div class="admin-error"><span>' + esc(e.message) + '</span><button type="button" class="btn btn-ghost btn-sm" onclick="' + fn + '()">Retry</button></div></td></tr>'; }

/* ---------- faculty: edit + delete ---------- */
async function editUser(id){
  let u; try{ u = await api.get('/admin/users/' + id); }catch(e){ toast(e.message, true); return; }
  formDialog({
    title:'Edit faculty account',
    fields:[{ name:'name', label:'Full name', value:u.name, required:true }, { name:'email', label:'Email', type:'email', value:u.email, required:true },
            { name:'phone', label:'Phone', value:u.phone }, { name:'status', label:'Account status', type:'select', value:u.status, options:[['active','Active'],['blocked','Blocked']] }],
    onSave: function(v){ return api.put('/admin/users/' + id, v).then(function(){ toast('Account updated.'); loadFaculty(); }); }
  });
}
async function deleteUser(id, name){
  const r = await confirmDelete(name, 'This permanently deletes the account, its profile, applications and uploaded files.');
  if(r.ok) run(api.del('/admin/users/' + id), 'Account deleted.', loadFaculty);
}

/* ---------- institutions: edit + delete ---------- */
async function editInstitution(id){
  let d; try{ d = (await api.get('/admin/companies/' + id)).company; }catch(e){ toast(e.message, true); return; }
  formDialog({
    title:'Edit institution',
    fields:[{ name:'company_name', label:'Institution name', value:d.company_name, required:true }, { name:'email', label:'Official email', type:'email', value:d.email },
            { name:'phone', label:'Phone', value:d.phone }, { name:'website', label:'Website', value:d.website }, { name:'industry', label:'Type', value:d.industry },
            { name:'city', label:'City', value:d.city }, { name:'state', label:'State', value:d.state }, { name:'description', label:'Description', type:'textarea', value:d.description }],
    onSave: function(v){ return api.put('/admin/companies/' + id, v).then(function(){ toast('Institution updated.'); loadInstitutions(); }); }
  });
}
async function deleteInstitution(id, name){
  const r = await confirmDelete(name, 'This permanently deletes the institution account, its jobs, applications and uploaded documents.');
  if(r.ok) run(api.del('/admin/companies/' + id), 'Institution deleted.', loadInstitutions);
}

/* ---------- applications: change status + delete ---------- */
async function changeAppStatus(id, current){
  const opts = [['under_review','Under review'],['shortlisted','Shortlisted'],['interview','Interview'],['selected','Selected'],['rejected','Rejected']];
  formDialog({
    title:'Update application status',
    fields:[{ name:'status', label:'Status', type:'select', value:current, options:opts }, { name:'note', label:'Note to applicant (optional)', type:'textarea', max:1000 }],
    onSave: function(v){ return api.put('/applications/' + id + '/status', { status:v.status, note:v.note || null }).then(function(){ toast('Status updated.'); loadApplications(); }); }
  });
}
async function deleteApplication(id){
  const r = await confirmDelete('this application');
  if(r.ok) run(api.del('/admin/applications/' + id), 'Application deleted.', loadApplications);
}

/* ---------- jobs ---------- */
async function load_jobs(){
  q('jobBody').innerHTML = loadingRow(6);
  try{
    const res = await api.get('/admin/jobs' + qs({ status:S.jobs.status, search:S.jobs.search, page:S.jobs.page, per_page:15 }));
    applyPg(S.jobs, res); const rows = (res && res.data) || [];
    q('jobCount').textContent = S.jobs.total + (S.jobs.total === 1 ? ' job' : ' jobs');
    q('jobBody').innerHTML = rowsOrEmpty(rows.map(function(j){
      const co = j.company || {}, live = j.status === 'published';
      return '<tr><td>' + esc(j.title) + '<small class="muted" style="display:block">' + esc((j.category && j.category.name) || '') + '</small></td>'
        + '<td>' + (co.id ? '<a href="company.html?id=' + co.id + '" style="color:var(--blue-700);font-weight:600">' + esc(co.company_name) + '</a>' : '—') + '</td>'
        + '<td>' + esc([j.city, j.state].filter(Boolean).join(', ') || '—') + '</td><td class="num">' + (j.applications_count || 0) + '</td>'
        + '<td>' + pill(live ? 'live' : j.status) + '</td>'
        + '<td class="act"><div class="admin-rowbtns"><button type="button" class="btn btn-ghost btn-sm" onclick="editJob(' + j.id + ')">Edit</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="toggleJob(' + j.id + ',' + live + ')">' + (live ? 'Unpublish' : 'Publish') + '</button>'
        + '<button type="button" class="btn btn-ghost btn-sm danger" onclick="deleteJob(' + j.id + ')">Delete</button></div></td></tr>';
    }), 6, 'No jobs found.');
    q('jobPager').innerHTML = pagerHtml(S.jobs, 'jobs');
    window.__jobs = rows;
  }catch(e){ q('jobBody').innerHTML = failRow(6, e, 'load_jobs'); }
}
function editJob(id){
  const j = (window.__jobs || []).filter(function(x){ return x.id === id; })[0]; if(!j) return;
  formDialog({
    title:'Edit job',
    fields:[{ name:'title', label:'Job title', value:j.title, required:true }, { name:'city', label:'City', value:j.city }, { name:'state', label:'State', value:j.state },
            { name:'status', label:'Status', type:'select', value:j.status, options:[['published','Published'],['draft','Draft'],['closed','Closed']] }],
    onSave: function(v){ return api.put('/jobs/' + id, v).then(function(){ toast('Job updated.'); load_jobs(); }); }
  });
}
function toggleJob(id, live){ run(api.put('/admin/jobs/' + id + (live ? '/unpublish' : '/publish')), live ? 'Job unpublished.' : 'Job published.', load_jobs); }
async function deleteJob(id){ const r = await confirmDelete('this job', 'Its applications are removed too.'); if(r.ok) run(api.del('/admin/jobs/' + id), 'Job deleted.', load_jobs); }

/* ---------- files ---------- */
async function load_files(){
  q('fileBody').innerHTML = loadingRow(6);
  try{
    const res = await api.get('/admin/files' + qs({ category:S.files.category, page:S.files.page, per_page:20 }));
    applyPg(S.files, res); const rows = (res && res.data) || [];
    q('fileCount').textContent = S.files.total + (S.files.total === 1 ? ' file' : ' files');
    q('fileBody').innerHTML = rowsOrEmpty(rows.map(function(f){
      const u = f.user || {};
      return '<tr><td>' + esc(f.original_name) + '</td><td>' + esc(u.name || '—') + '<small class="muted" style="display:block">' + esc(u.email || '') + '</small></td>'
        + '<td>' + esc(statusLabel(f.category)) + '</td><td class="num">' + esc(fmtSize(f.file_size)) + '</td><td>' + esc(fmtDate(f.created_at)) + '</td>'
        + '<td class="act"><div class="admin-rowbtns"><button type="button" class="btn btn-ghost btn-sm" onclick="openFile(' + f.id + ')">View</button>'
        + '<button type="button" class="btn btn-ghost btn-sm danger" onclick="deleteFile(' + f.id + ')">Delete</button></div></td></tr>';
    }), 6, 'No files found.');
    q('filePager').innerHTML = pagerHtml(S.files, 'files');
  }catch(e){ q('fileBody').innerHTML = failRow(6, e, 'load_files'); }
}
async function deleteFile(id){ const r = await confirmDelete('this file', 'It is removed from storage and from any profile that used it.'); if(r.ok) run(api.del('/admin/files/' + id), 'File deleted.', load_files); }

/* ---------- announcements ---------- */
async function load_notifications(){
  q('noteBody').innerHTML = loadingRow(5);
  try{
    const res = await api.get('/admin/notifications' + qs({ page:S.notes.page, per_page:20 }));
    applyPg(S.notes, res); const rows = (res && res.data) || [];
    q('noteBody').innerHTML = rowsOrEmpty(rows.map(function(n){
      const u = n.user || {};
      return '<tr><td>' + esc(u.name || '—') + '<small class="muted" style="display:block">' + esc(u.email || '') + '</small></td><td>' + esc(n.title) + '</td>'
        + '<td style="max-width:320px">' + esc(n.message || '') + '</td><td>' + esc(fmtDate(n.created_at)) + '</td>'
        + '<td class="act"><button type="button" class="btn btn-ghost btn-sm danger" onclick="deleteNote(' + n.id + ')">Delete</button></td></tr>';
    }), 5, 'No notifications sent yet.');
    q('notePager').innerHTML = pagerHtml(S.notes, 'notifications');
  }catch(e){ q('noteBody').innerHTML = failRow(5, e, 'load_notifications'); }
}
function sendAnnouncement(){
  formDialog({
    title:'New announcement', confirmLabel:'Send',
    fields:[{ name:'role', label:'Send to', type:'select', value:'all', options:[['all','Everyone'],['candidate','All faculty'],['company','All institutions']] },
            { name:'title', label:'Title', required:true }, { name:'message', label:'Message', type:'textarea' }],
    onSave: function(v){ return api.post('/admin/notifications', v).then(function(r){ toast('Sent to ' + ((r && r.recipients) || 0) + ' user(s).'); load_notifications(); }); }
  });
}
async function deleteNote(id){ const r = await confirmDelete('this notification'); if(r.ok) run(api.del('/admin/notifications/' + id), 'Notification deleted.', load_notifications); }

/* ---------- skills & categories ---------- */
const CAT = { skills:{ body:'skillBody', input:'skillNew', noun:'skill' }, categories:{ body:'catBody', input:'catNew', noun:'category' } };
async function load_catalog(){ loadCat('skills'); loadCat('categories'); }
async function loadCat(kind){
  const c = CAT[kind]; q(c.body).innerHTML = loadingRow(2);
  try{
    const res = await api.get('/admin/' + kind + '?per_page=200'); const rows = (res && res.data) || [];
    q(c.body).innerHTML = rowsOrEmpty(rows.map(function(r){
      return '<tr><td>' + esc(r.name) + '</td><td class="act"><div class="admin-rowbtns"><button type="button" class="btn btn-ghost btn-sm" onclick="renameCat(\'' + kind + '\',' + r.id + ',\'' + esc(String(r.name).replace(/'/g, '')) + '\')">Rename</button>'
        + '<button type="button" class="btn btn-ghost btn-sm danger" onclick="deleteCat(\'' + kind + '\',' + r.id + ')">Delete</button></div></td></tr>';
    }), 2, 'Nothing here yet.');
  }catch(e){ q(c.body).innerHTML = failRow(2, e, 'load_catalog'); }
}
async function addCatalog(kind){
  const c = CAT[kind], el = q(c.input), name = el.value.trim(); if(!name) return;
  run(api.post('/admin/' + kind, { name:name }), 'Added.', function(){ el.value = ''; loadCat(kind); });
}
function renameCat(kind, id, name){
  formDialog({ title:'Rename ' + CAT[kind].noun, fields:[{ name:'name', label:'Name', value:name, required:true, max:120 }],
    onSave: function(v){ return api.put('/admin/' + kind + '/' + id, v).then(function(){ toast('Renamed.'); loadCat(kind); }); } });
}
async function deleteCat(kind, id){ const r = await confirmDelete('this ' + CAT[kind].noun); if(r.ok) run(api.del('/admin/' + kind + '/' + id), 'Deleted.', function(){ loadCat(kind); }); }

/* ---------- wiring ---------- */
(function(){
  const debounced = function(fn, ms){ let t; return function(){ clearTimeout(t); t = setTimeout(fn, ms); }; };
  q('jobSearch').addEventListener('input', debounced(function(){ S.jobs.search = q('jobSearch').value.trim(); S.jobs.page = 1; load_jobs(); }, 350));
  q('jobStatus').addEventListener('change', function(){ S.jobs.status = this.value; S.jobs.page = 1; load_jobs(); });
  q('fileCat').addEventListener('change', function(){ S.files.category = this.value; S.files.page = 1; load_files(); });
  bindPager('jobPager', S.jobs, load_jobs); bindPager('filePager', S.files, load_files); bindPager('notePager', S.notes, load_notifications);
  ['editUser','deleteUser','editInstitution','deleteInstitution','changeAppStatus','deleteApplication','load_jobs','load_files','load_notifications','load_catalog',
   'editJob','toggleJob','deleteJob','deleteFile','sendAnnouncement','deleteNote','addCatalog','renameCat','deleteCat'].forEach(function(n){ window[n] = eval(n); });
})();
