// admin/js/data.js — real data from the Laravel API (replaces the old demo dataset).
// It fills the same two structures admin.js already renders:
//   facultyProfiles[id]  -> candidates      (GET /admin/users?role=candidate)
//   institutionsData[id] -> companies+jobs  (GET /admin/companies, GET /admin/jobs)
// plus adminStats (GET /admin/dashboard). Every string is HTML-escaped here because admin.js
// builds its tables with innerHTML; use unesc() when a value goes into textContent or a CSV.
let facultyProfiles = {};
let institutionsData = {};
let adminStats = null;
function readPostedJobs(){ return {}; }   // legacy hook, no longer used

function E(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
function unesc(s){ const t = document.createElement('textarea'); t.innerHTML = String(s == null ? '' : s); return t.value; }

function _items(r){ return Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : []); }
async function _paged(path, params){
  let out = [], page = 1, last = 1;
  do{
    const q = new URLSearchParams(Object.assign({ per_page: 100, page: page }, params || {})).toString();
    const r = await api.get(path + '?' + q);
    out = out.concat(_items(r)); last = (r && r.last_page) || 1; page++;
  }while(page <= last && page <= 20);
  return out;
}
function _ago(d){
  if(!d) return '—';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if(days <= 0) return 'today';
  if(days === 1) return '1 day ago';
  if(days < 14) return days + ' days ago';
  if(days < 60) return Math.floor(days / 7) + ' weeks ago';
  return Math.floor(days / 30) + ' months ago';
}
function _fileUrl(p){ if(!p) return ''; if(/^(https?:|data:)/.test(p)) return p; return api.BASE.replace(/\/api$/, '') + '/' + String(p).replace(/^\/+/, ''); }

function _mapFaculty(u){
  const cp = u.candidate_profile || u.candidateProfile || {}, pd = cp.profile_data || {};
  const exp = cp.total_experience != null ? cp.total_experience : pd.experience;
  const city = cp.city || pd.city || pd.location || '—';
  const rows = (pd.employmentHistory || []).map(function(e){
    return [E([e.designation, e.department].filter(Boolean).join(', ')), E([e.org, (e.from || '') + ' – ' + (e.currentlyWorking ? 'Present' : (e.to || ''))].filter(Boolean).join(' · '))];
  });
  return {
    id: u.id, status: u.status,
    avatar: E(_fileUrl(cp.profile_photo) || (pd.avatar && pd.avatar.indexOf('data:') !== 0 ? pd.avatar : 'https://i.pravatar.cc/160?img=68')),
    name: E(u.name || 'Candidate'), email: E(u.email || ''),
    role: E(cp.current_job_title || pd.currentDesignation || pd.subject || 'Faculty'),
    tags: [E(pd.qualification || '—'), E(exp ? exp + ' yrs experience' : '—'), E(city)],
    experience: rows, stats: [[E(pd.journalPublications || 0), 'Publications'], [E(pd.totalPatents || 0), 'Patents'], [E(pd.numProjects || 0), 'Projects']]
  };
}
function _instType(c){
  const t = ((c.industry || '') + ' ' + (c.company_name || '')).toLowerCase();
  return /school/.test(t) ? 'school' : /college|junior|intermediate/.test(t) ? 'college' : 'university';
}

async function loadAdminData(){
  const results = await Promise.all([
    api.get('/admin/dashboard'),
    _paged('/admin/users', { role: 'candidate' }),
    _paged('/admin/companies'),
    _paged('/admin/jobs')
  ]);
  adminStats = results[0];
  facultyProfiles = {};
  results[1].forEach(function(u){ facultyProfiles[u.id] = _mapFaculty(u); });
  institutionsData = {};
  results[2].forEach(function(c){
    const pd = c.profile_data || {}, app = pd.app || {};
    institutionsData['c' + c.id] = {
      companyId: c.id, userId: c.user_id, name: E(c.company_name), type: _instType(c),
      city: E([c.city, c.state].filter(Boolean).join(', ') || c.location || '—'),
      contact: E((c.user && c.user.name) || app.contactName || '—'), designation: E(app.designation || '—'),
      email: E(c.email || (c.user && c.user.email) || '—'), phone: E(c.phone || '—'), website: E(c.website || '—'),
      joined: E(c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'),
      verification: c.verification_status || 'pending', isBranch: !!c.parent_id, jobs: []
    };
  });
  results[3].forEach(function(j){
    const inst = institutionsData['c' + j.company_id]; if(!inst) return;
    const m = j.meta || {};
    inst.jobs.push({
      id: j.id, title: E(j.title), category: E((j.category && j.category.name) || m.category_label || '—'),
      qualification: E(m.qualification || '—'), location: E(j.city || j.location || '—'),
      applicants: j.applications_count || 0, rawStatus: j.status, status: j.status === 'published' ? 'live' : 'closed',
      posted: _ago(j.published_at || j.created_at)
    });
  });
  return true;
}
