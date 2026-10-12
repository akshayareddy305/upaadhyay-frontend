// admin/js/admin.js — admin dashboard (overview, institution verification queue, job applications, faculty).
// Every number and row comes from the Laravel API (/api/admin/*); nothing here is demo data.

const TABS = ['overview', 'institutions', 'applications', 'faculty', 'jobs', 'files', 'notifications', 'catalog'];
const TITLES = { overview:'Overview', institutions:'Institutions', applications:'Job Applications', faculty:'Faculty', jobs:'Jobs', files:'Files', notifications:'Announcements', catalog:'Skills & Categories' };
const INST_STATUSES = [['pending', 'Pending review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['blocked', 'Blocked'], ['', 'All']];
const PER_PAGE = 15;

const S = {
  tab: 'overview', dash: null,
  inst: { status:'pending', search:'', page:1, last:1, total:0 },
  apps: { status:'', search:'', page:1, last:1, total:0 },
  fac:  { status:'', search:'', page:1, last:1, total:0 },
  jobs: { status:'', search:'', page:1, last:1, total:0 },
  files:{ category:'', page:1, last:1, total:0 },
  notes:{ page:1, last:1, total:0 }
};

const $ = function(id){ return document.getElementById(id); };
function errorRow(cols, msg, retry){
  return '<tr><td colspan="' + cols + '"><div class="admin-error"><span>' + esc(msg) + '</span><button type="button" class="btn btn-ghost btn-sm" onclick="' + retry + '()">Retry</button></div></td></tr>';
}
function emptyRow(cols, msg){ return '<tr><td colspan="' + cols + '" class="admin-empty">' + esc(msg) + '</td></tr>'; }
function applyPage(st, res){
  st.page = (res && res.current_page) || 1; st.last = (res && res.last_page) || 1; st.total = (res && res.total) || 0;
}
function debounce(fn, ms){ let t; return function(){ clearTimeout(t); t = setTimeout(fn, ms); }; }

/* ------------------------------------------------------------------ navigation */
function adminGo(tab, status){
  if(TABS.indexOf(tab) === -1) tab = 'overview';
  S.tab = tab;
  if(tab === 'institutions' && status !== undefined && S.inst.status !== status){ S.inst.status = status; S.inst.page = 1; }
  TABS.forEach(function(t){ $('panel' + t.charAt(0).toUpperCase() + t.slice(1)).hidden = (t !== tab); });
  document.querySelectorAll('.admin-nav-item').forEach(function(b){
    b.classList.toggle('active', b.dataset.tab === tab);
    if(b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  setTopTitle(TITLES[tab]);
  try{
    const u = new URL(location.href); u.searchParams.set('tab', tab);
    if(tab === 'institutions') u.searchParams.set('status', S.inst.status || 'all'); else u.searchParams.delete('status');
    history.replaceState(null, '', u);
  }catch(e){}
  if(tab === 'overview') loadOverview();
  if(tab === 'institutions') loadInstitutions();
  if(tab === 'applications') loadApplications();
  if(tab === 'faculty') loadFaculty();
  ['jobs', 'files', 'notifications', 'catalog'].forEach(function(t){ if(tab === t && typeof window['load_' + t] === 'function') window['load_' + t](); });
}
window.adminGo = adminGo;

/* ------------------------------------------------------------------ dashboard numbers */
async function loadDashboard(){
  try{
    S.dash = await api.get('/admin/dashboard');
    setPendingBadge((S.dash.companies_by_status || {}).pending || S.dash.pending_companies || 0);
  }catch(e){ S.dash = null; }
  return S.dash;
}

/* ------------------------------------------------------------------ overview */
async function loadOverview(){
  const d = await loadDashboard();
  const by = (d && d.companies_by_status) || {};
  const card = function(cls, n, label, foot, go){
    return '<div class="admin-stat ' + cls + '"><div class="admin-stat-top"><div class="n">' + n + '</div><div class="l">' + label + '</div></div>'
      + '<div class="admin-stat-bot" onclick="' + go + '">' + foot + ' →</div></div>';
  };
  $('ovStats').innerHTML = d
    ? card('c1', by.pending != null ? by.pending : d.pending_companies, 'Institutions to review', 'Open review queue', "adminGo('institutions','pending')")
      + card('c2', by.approved || 0, 'Approved institutions', 'of ' + d.total_companies + ' registered', "adminGo('institutions','approved')")
      + card('c3', d.active_jobs, 'Live jobs', d.total_jobs + ' jobs in total', "adminGo('applications')")
      + card('c4', d.total_applications, 'Job applications', d.total_candidates + ' faculty registered', "adminGo('applications')")
    : '<div class="admin-error" style="grid-column:1/-1"><span>Could not load the dashboard numbers.</span><button type="button" class="btn btn-ghost btn-sm" onclick="loadOverview()">Retry</button></div>';

  // Pending institutions + latest applications load independently so one failure does not blank the page.
  api.get('/admin/companies' + qs({ status:'pending', per_page:6 })).then(function(res){
    const rows = (res && res.data) || [];
    $('ovPending').innerHTML = rows.map(function(c){
      return '<tr class="clickable" onclick="openInstitution(' + c.id + ')"><td><div class="admin-row-name">' + avatarHtml(c.company_name, c.logo)
        + '<div>' + esc(c.company_name) + '<small>' + esc([c.city, c.state].filter(Boolean).join(', ') || '—') + ' · ' + esc(fmtDate(c.created_at)) + '</small></div></div></td>'
        + '<td class="act"><button type="button" class="admin-viewbtn" onclick="event.stopPropagation(); openInstitution(' + c.id + ')">Review</button></td></tr>';
    }).join('') || emptyRow(2, 'Nothing waiting. All institutions have been reviewed.');
  }).catch(function(e){ $('ovPending').innerHTML = errorRow(2, e.message, 'loadOverview'); });

  api.get('/admin/applications' + qs({ per_page:6 })).then(function(res){
    const rows = (res && res.data) || [];
    $('ovApps').innerHTML = rows.map(function(a){
      const cand = a.candidate || {}, job = a.job || {}, co = job.company || {};
      return '<tr><td><div class="admin-row-name">' + avatarHtml(cand.name) + '<div>' + esc(cand.name || '—') + '<small>' + esc(job.title || '—') + ' · ' + esc(co.company_name || '—') + '</small></div></div></td><td class="act">' + pill(a.status) + '</td></tr>';
    }).join('') || emptyRow(2, 'No applications yet.');
  }).catch(function(e){ $('ovApps').innerHTML = errorRow(2, e.message, 'loadOverview'); });
}
window.loadOverview = loadOverview;

/* ------------------------------------------------------------------ institutions */
function openInstitution(id){ window.location.href = 'company.html?id=' + encodeURIComponent(id); }
window.openInstitution = openInstitution;

function renderInstTabs(){
  const by = (S.dash && S.dash.companies_by_status) || {};
  const total = Object.keys(by).reduce(function(s, k){ return s + (by[k] || 0); }, 0);
  $('instTabs').innerHTML = INST_STATUSES.map(function(t){
    const n = t[0] ? by[t[0]] : total;
    return '<button type="button" role="tab" class="admin-tab' + (S.inst.status === t[0] ? ' active' : '') + '" data-status="' + t[0] + '" aria-selected="' + (S.inst.status === t[0]) + '">'
      + t[1] + (S.dash ? ' <span class="n">' + (n || 0) + '</span>' : '') + '</button>';
  }).join('');
}

async function loadInstitutions(){
  renderInstTabs();
  $('instBody').innerHTML = '<tr><td colspan="9" class="admin-loading">Loading…</td></tr>';
  loadDashboard().then(renderInstTabs);   // counts refresh in the background
  try{
    const res = await api.get('/admin/companies' + qs({ status:S.inst.status, search:S.inst.search, page:S.inst.page, per_page:PER_PAGE }));
    applyPage(S.inst, res);
    const rows = (res && res.data) || [];
    $('instCount').textContent = S.inst.total + (S.inst.total === 1 ? ' institution' : ' institutions');
    $('instBody').innerHTML = rows.map(function(c){
      const u = c.user || {}, inst = (c.profile_data && c.profile_data.inst) || {};
      const submitted = inst.sub === true;
      return '<tr class="clickable" onclick="openInstitution(' + c.id + ')">'
        + '<td><div class="admin-row-name">' + avatarHtml(c.company_name, c.logo) + '<div>' + esc(c.company_name) + '<small>Code ' + esc(c.institution_code || '—') + (c.parent ? ' · branch of ' + esc(c.parent.company_name) : '') + '</small></div></div></td>'
        + '<td>' + esc(c.industry || '—') + '</td>'
        + '<td>' + esc(u.name || '—') + '<small class="muted" style="display:block">' + esc(u.email || c.email || '') + '</small></td>'
        + '<td>' + esc([c.city, c.state].filter(Boolean).join(', ') || '—') + '</td>'
        + '<td>' + esc(fmtDate(c.created_at)) + '</td>'
        + '<td>' + (submitted ? '<span class="admin-pill info">Submitted</span>' : '<span class="muted">Not submitted</span>') + '</td>'
        + '<td class="num">' + (c.jobs_count || 0) + '</td>'
        + '<td>' + pill(c.verification_status) + '</td>'
        + '<td class="act"><div class="admin-rowbtns"><button type="button" class="admin-viewbtn" onclick="event.stopPropagation(); openInstitution(' + c.id + ')">' + (c.verification_status === 'pending' ? 'Review' : 'View') + '</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); editInstitution(' + c.id + ')">Edit</button>'
        + '<button type="button" class="btn btn-ghost btn-sm danger" onclick="event.stopPropagation(); deleteInstitution(' + c.id + ',\'' + esc(String(c.company_name).replace(/'/g, '')) + '\')">Delete</button></div></td></tr>';
    }).join('') || emptyRow(9, S.inst.search ? 'No institutions match your search.' : 'No institutions in this list.');
    $('instPager').innerHTML = pagerHtml(S.inst, 'institutions');
  }catch(e){
    $('instBody').innerHTML = errorRow(9, e.message, 'loadInstitutions'); $('instPager').innerHTML = '';
  }
}
window.loadInstitutions = loadInstitutions;

/* ------------------------------------------------------------------ job applications */
async function loadApplications(){
  $('appBody').innerHTML = '<tr><td colspan="6" class="admin-loading">Loading…</td></tr>';
  try{
    const res = await api.get('/admin/applications' + qs({ status:S.apps.status, search:S.apps.search, page:S.apps.page, per_page:PER_PAGE }));
    applyPage(S.apps, res);
    const rows = (res && res.data) || [];
    $('appCount').textContent = S.apps.total + (S.apps.total === 1 ? ' application' : ' applications');
    $('appBody').innerHTML = rows.map(function(a){
      const cand = a.candidate || {}, job = a.job || {}, co = job.company || {};
      const fid = a.resume && a.resume.file && a.resume.file.id;
      return '<tr><td><div class="admin-row-name">' + avatarHtml(cand.name) + '<div>' + esc(cand.name || '—') + '<small>' + esc(cand.email || '') + '</small></div></div></td>'
        + '<td>' + esc(job.title || '—') + '<small class="muted" style="display:block">' + esc([job.city, job.state].filter(Boolean).join(', ')) + '</small></td>'
        + '<td>' + (co.id ? '<a href="company.html?id=' + co.id + '" style="color:var(--blue-700);font-weight:600">' + esc(co.company_name) + '</a>' : '—') + '</td>'
        + '<td>' + esc(fmtDate(a.applied_at || a.created_at)) + '</td>'
        + '<td>' + pill(a.status) + '</td>'
        + '<td class="act"><div class="admin-rowbtns">' + (fid ? '<button type="button" class="btn btn-ghost btn-sm" onclick="openFile(' + fid + ')">Resume</button>' : '')
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="changeAppStatus(' + a.id + ',\'' + esc(a.status) + '\')">Status</button>'
        + '<button type="button" class="btn btn-ghost btn-sm danger" onclick="deleteApplication(' + a.id + ')">Delete</button></div></td></tr>';
    }).join('') || emptyRow(6, 'No applications found.');
    $('appPager').innerHTML = pagerHtml(S.apps, 'applications');
  }catch(e){
    $('appBody').innerHTML = errorRow(6, e.message, 'loadApplications'); $('appPager').innerHTML = '';
  }
}
window.loadApplications = loadApplications;

/* ------------------------------------------------------------------ faculty (candidate accounts) */
async function loadFaculty(){
  $('facBody').innerHTML = '<tr><td colspan="7" class="admin-loading">Loading…</td></tr>';
  try{
    const res = await api.get('/admin/users' + qs({ role:'candidate', status:S.fac.status, search:S.fac.search, page:S.fac.page, per_page:PER_PAGE }));
    applyPage(S.fac, res);
    const rows = (res && res.data) || [];
    $('facCount').textContent = S.fac.total + (S.fac.total === 1 ? ' faculty member' : ' faculty members');
    $('facBody').innerHTML = rows.map(function(u){
      const p = u.candidate_profile || u.candidateProfile || {};
      const exp = p.total_experience != null && p.total_experience !== '' ? Number(p.total_experience) + ' yrs' : '—';
      const blocked = u.status === 'blocked';
      return '<tr><td><div class="admin-row-name">' + avatarHtml(u.name, p.profile_photo) + '<div>' + esc(u.name) + '</div></div></td>'
        + '<td>' + esc(u.email) + '<small class="muted" style="display:block">' + esc(u.phone || '') + '</small></td>'
        + '<td>' + esc(p.current_job_title || '—') + '</td>'
        + '<td>' + esc([p.city, p.state].filter(Boolean).join(', ') || '—') + '</td>'
        + '<td class="num">' + esc(exp) + '</td>'
        + '<td>' + pill(blocked ? 'blocked' : 'active') + '</td>'
        + '<td class="act"><div class="admin-rowbtns"><button type="button" class="btn btn-ghost btn-sm" onclick="editUser(' + u.id + ')">Edit</button>'
        + '<button type="button" class="btn btn-ghost btn-sm' + (blocked ? '' : ' danger') + '" onclick="toggleUser(' + u.id + ',' + (blocked ? 'false' : 'true') + ',\'' + esc(String(u.name).replace(/'/g, '')) + '\')">' + (blocked ? 'Unblock' : 'Block') + '</button>'
        + '<button type="button" class="btn btn-ghost btn-sm danger" onclick="deleteUser(' + u.id + ',\'' + esc(String(u.name).replace(/'/g, '')) + '\')">Delete</button></div></td></tr>';
    }).join('') || emptyRow(7, S.fac.search ? 'No faculty match your search.' : 'No faculty accounts yet.');
    $('facPager').innerHTML = pagerHtml(S.fac, 'faculty');
  }catch(e){
    $('facBody').innerHTML = errorRow(7, e.message, 'loadFaculty'); $('facPager').innerHTML = '';
  }
}
window.loadFaculty = loadFaculty;

async function toggleUser(id, block, name){
  const r = await askDialog({
    title: (block ? 'Block ' : 'Unblock ') + name + '?',
    body: block ? 'They will be signed out immediately and will not be able to log in until unblocked.' : 'They will be able to log in again.',
    confirmLabel: block ? 'Block' : 'Unblock', danger: block
  });
  if(!r.ok) return;
  try{ await api.put('/admin/users/' + id + (block ? '/block' : '/unblock')); toast(block ? 'Faculty account blocked.' : 'Faculty account unblocked.'); loadFaculty(); }
  catch(e){ toast(e.message, true); }
}
window.toggleUser = toggleUser;

/* ------------------------------------------------------------------ events + start */
function bindList(pagerId, st, loader){
  $(pagerId).addEventListener('click', function(e){
    const b = e.target.closest('[data-page]'); if(!b || b.disabled) return;
    st.page += b.dataset.page === 'next' ? 1 : -1; loader();
    window.scrollTo({ top:0, behavior:'smooth' });
  });
}
function bindFilter(el, st, key, loader, wait){
  const run = function(){ st[key] = el.value.trim(); st.page = 1; loader(); };
  el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', wait ? debounce(run, wait) : run);
}

(async function init(){
  const user = await requireAdmin(); if(!user) return;
  const qp = new URLSearchParams(location.search);
  const tab = TABS.indexOf(qp.get('tab')) !== -1 ? qp.get('tab') : 'overview';
  const st = qp.get('status');
  if(st !== null) S.inst.status = st === 'all' ? '' : (INST_STATUSES.some(function(x){ return x[0] === st; }) ? st : 'pending');
  mountChrome({ active: tab, title: TITLES[tab], user: user });

  $('instTabs').addEventListener('click', function(e){
    const b = e.target.closest('.admin-tab'); if(!b) return;
    S.inst.status = b.dataset.status; S.inst.page = 1; adminGo('institutions');
  });
  bindList('instPager', S.inst, loadInstitutions); bindList('appPager', S.apps, loadApplications); bindList('facPager', S.fac, loadFaculty);
  bindFilter($('instSearch'), S.inst, 'search', loadInstitutions, 350);
  bindFilter($('appSearch'), S.apps, 'search', loadApplications, 350); bindFilter($('appStatus'), S.apps, 'status', loadApplications);
  bindFilter($('facSearch'), S.fac, 'search', loadFaculty, 350);       bindFilter($('facStatus'), S.fac, 'status', loadFaculty);

  adminGo(tab);
})();
