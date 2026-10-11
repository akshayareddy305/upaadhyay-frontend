/* ==========================================================================
   backend.js — connects the existing UI to the Laravel API (no more demo data).
   Load AFTER layout.js on every page that uses store.js (see README).

   What lives here:
     - profile load/save   (candidate: /candidate/profile, company: /company/profile)
     - public jobs         (/jobs, /jobs/{id}, /categories, /institutions)
     - apply               (/jobs/{id}/apply)
     - employer side       (/company/jobs, /company/applicants, /company/candidates,
                            /company/invitations, /company/messages, application status)
     - notifications       (/notifications)
   Everything goes through window.api (js/api.js), which adds the Sanctum token.
   ========================================================================== */
(function(){
  'use strict';
  if(typeof api === 'undefined' || typeof saveState !== 'function') return;

  const COLORS = ['var(--blue-700)','var(--green)','#7C3AED','#B45309','#BE123C','#0F766E','#4338CA'];
  const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCc+PHJlY3Qgd2lkdGg9JzI0JyBoZWlnaHQ9JzI0JyBmaWxsPScjRUVGMkY3Jy8+PGcgZmlsbD0nbm9uZScgc3Ryb2tlPScjOTRBM0I4JyBzdHJva2Utd2lkdGg9JzEuNSc+PGNpcmNsZSBjeD0nMTInIGN5PSc5JyByPSczLjUnLz48cGF0aCBkPSdNNSAyMGMwLTMuNSAzLTUuNSA3LTUuNXM3IDIgNyA1LjUnLz48L2c+PC9zdmc+';

  /* ---------------- small helpers ---------------- */
  function esc(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function origin(){ return api.BASE.replace(/\/api$/, ''); }
  function fileUrl(p){ if(!p) return ''; if(/^(https?:|data:)/.test(p)) return p; return origin() + '/' + String(p).replace(/^\/+/, ''); }
  function splitList(s){ return String(s || '').split(/[,;\n]/).map(function(x){ return x.trim(); }).filter(Boolean); }
  function inr(n){ return '₹' + Number(n).toLocaleString('en-IN'); }
  function initials(name){ return String(name || '??').trim().split(/\s+/).slice(0,2).map(function(w){ return w[0]; }).join('').toUpperCase() || '??'; }
  function daysSince(d){ return d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5)) : 0; }
  function daysUntil(d){ return d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5)) : null; }
  function items(res){ return Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []); }
  function qs(o){ const p = new URLSearchParams(); Object.keys(o || {}).forEach(function(k){ if(o[k] !== '' && o[k] != null) p.set(k, o[k]); }); const s = p.toString(); return s ? '?' + s : ''; }
  async function paged(path, params, maxPages){
    let out = [], page = 1, last = 1;
    do{
      const r = await api.get(path + qs(Object.assign({ per_page: 50, page: page }, params || {})), { silent403: true, noAuthRedirect: !api.hasToken() });
      out = out.concat(items(r));
      last = (r && r.last_page) || 1; page++;
    }while(page <= last && page <= (maxPages || 5));
    return out;
  }
  function stripHeavy(obj){          // never push base64 images / huge blobs into JSON columns
    return JSON.parse(JSON.stringify(obj, function(k, v){ return (typeof v === 'string' && v.indexOf('data:') === 0 && v.length > 500) ? '' : v; }));
  }

  /* ---------------- categories ---------------- */
  let _cats = null;
  async function categories(){ if(!_cats){ try{ _cats = await api.get('/categories', { noAuthRedirect: true }); }catch(e){ _cats = []; } } return _cats; }
  async function categoryId(name){ const c = (await categories()).find(function(x){ return x.name === name; }); return c ? c.id : null; }

  /* ---------------- jobs (public) ---------------- */
  function salaryText(j, m){
    if(m.salary_as_per_norms) return 'As per norms';
    if(j.salary_min || j.salary_max){
      const per = (m.salary_period === 'year') ? 'Year' : 'Month';
      return (j.salary_min ? inr(j.salary_min) : '') + (j.salary_max ? ' – ' + inr(j.salary_max) : '') + '/' + per + (m.salary_negotiable ? ' (negotiable)' : '');
    }
    return 'Not disclosed';
  }
  function mapJob(j){
    const m = j.meta || {}, co = j.company || {};
    const tags = [];
    if(m.qualification) tags.push(m.qualification);
    if(m.type_label || j.employment_type) tags.push(m.type_label || j.employment_type);
    return {
      id: j.id, title: j.title, org: co.company_name || 'Institution', logo: fileUrl(co.logo),
      city: j.city || j.location || '', location: j.location || '', cat: (j.category && j.category.name) || m.category_label || '',
      tags: tags, skills: (j.skills || []).map(function(s){ return s.name; }),
      salary: salaryText(j, m), type: m.type_label || j.employment_type || 'Full-time', mode: 'In Office',
      posted: daysSince(j.published_at || j.created_at), daysLeft: daysUntil(j.application_deadline),
      applicants: j.applications_count || 0, minExp: Number(j.experience_min || 0),
      color: COLORS[(j.id || 0) % COLORS.length], initials: initials(co.company_name),
      role: m.role || '', dept: m.dept || '', qualification: m.qualification || '', description: j.description || '', raw: j
    };
  }
  async function fetchJobs(params){ return (await paged('/jobs', params, 4)).map(mapJob); }

  /* Browse-jobs page: load from the API, then reuse the existing filters/cards. */
  window.bkLoadBrowseJobs = async function(){
    const list = document.getElementById('bjJobList');
    if(list) list.innerHTML = '<div class="bj-empty" style="grid-column:1/-1;">Loading jobs…</div>';
    try{ bjJobs = await fetchJobs({}); }
    catch(e){ bjJobs = []; if(list) list.innerHTML = '<div class="bj-empty" style="grid-column:1/-1;">Could not load jobs. ' + esc(e.message) + '</div>'; return; }
    const q = getParam('q'), loc = getParam('loc');
    const kw = document.getElementById('bjKeyword'), lc = document.getElementById('bjLocation');
    if(q && kw && !kw.value) kw.value = q;
    if(loc && lc && !lc.value) lc.value = loc;
    renderBrowseJobs();
  };

  /* Apply (seeker). */
  window.applyToJob = async function(id, title){
    if(!isLoggedIn || currentRole === 'company'){ goTo('register', { role: 'seeker' }); return; }
    if(currentRole !== 'seeker'){ api.toast('Only faculty accounts can apply to jobs.'); return; }
    try{
      await api.post('/jobs/' + id + '/apply', {});
      api.toast('Application sent' + (title ? ' for ' + title : ''));
      document.querySelectorAll('[data-apply-job="' + id + '"]').forEach(function(b){ b.textContent = 'Applied ✓'; b.disabled = true; });
    }catch(e){ api.toast(e.message); }
  };

  /* Static pages (For Faculty / Job view): shared loader. */
  const SP_KEYS = { professor:/professor/i, 'associate-professor':/associate/i, 'assistant-professor':/assistant/i, lecturer:/lecturer/i,
    research:/research professor/i, 'research-associate':/research associate/i, postdoctoral:/post-?doc/i, 'non-teaching':/non[- ]teaching/i,
    'academic-coordinator':/coordinator/i, 'lab-staff':/lab/i, administration:/admin/i };
  function spCatFor(job){
    const t = (job.role || '') + ' ' + job.title;
    const order = ['research-associate','research','postdoctoral','associate-professor','assistant-professor','professor','lecturer','non-teaching','academic-coordinator','lab-staff','administration'];
    for(let i = 0; i < order.length; i++){ if(SP_KEYS[order[i]].test(t)) return order[i]; }
    return '';
  }
  let _spPromise = null;
  window.spLoadJobs = function(){
    if(!_spPromise){
      _spPromise = fetchJobs({}).then(function(rows){
        SP_JOBS = rows.map(function(j){
          return { id: j.id, cat: spCatFor(j), title: j.title, inst: j.org, loc: j.city, subj: j.dept, qual: j.qualification || '—',
                   exp: j.minExp, type: j.type, sal: j.salary, desc: j.description, raw: j };
        });
        return SP_JOBS;
      }).catch(function(){ SP_JOBS = []; return SP_JOBS; });
    }
    return _spPromise;
  };
  window.spGetJob = async function(id){
    await spLoadJobs();
    let j = SP_JOBS.filter(function(x){ return x.id == id; })[0];
    if(j) return j;
    try{
      const m = mapJob(await api.get('/jobs/' + id, { noAuthRedirect: true }));
      return { id: m.id, cat: spCatFor(m), title: m.title, inst: m.org, loc: m.city, subj: m.dept, qual: m.qualification || '—', exp: m.minExp, type: m.type, sal: m.salary, desc: m.description, raw: m };
    }catch(e){ return null; }
  };

  /* Home page: featured institutions come from the backend. */
  window.bkLoadInstitutions = async function(){
    try{
      const r = await api.get('/institutions', { noAuthRedirect: true });
      return items(r).map(function(c){ return [c.company_name || c.name, c.city || c.location || '']; }).filter(function(c){ return c[0]; });
    }catch(e){ return []; }
  };

  /* ---------------- profiles: load + auto-save ---------------- */
  let _syncReady = false, _lastSig = '', _timer = null, _instSig = '';
  const _origSaveState = saveState;

  function cap(s){ s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  async function hydrateSeeker(){
    const u = await api.get('/candidate/profile', { silent403: true });
    const cp = (u && (u.candidate_profile || u.candidateProfile)) || {}, pd = cp.profile_data || {};
    Object.assign(currentUser, pd);
    if(u.name) currentUser.name = u.name;
    if(u.email) currentUser.email = u.email;
    if(u.phone) currentUser.phone = u.phone;
    if(cp.date_of_birth && !currentUser.dob) currentUser.dob = String(cp.date_of_birth).slice(0, 10);
    if(cp.gender && !currentUser.gender) currentUser.gender = cap(cp.gender);
    if(cp.city && !currentUser.city) currentUser.city = cp.city;
    if(cp.state && !currentUser.state) currentUser.state = cp.state;
    if(cp.location && !currentUser.location) currentUser.location = cp.location;
    if(cp.current_job_title && !currentUser.currentDesignation) currentUser.currentDesignation = cp.current_job_title;
    if(cp.total_experience != null && !currentUser.experience) currentUser.experience = String(cp.total_experience);
    if(cp.profile_photo) currentUser.avatar = fileUrl(cp.profile_photo);   // server column is the source of truth
    _lastSig = JSON.stringify(seekerPayload());
  }
  function seekerPayload(){
    const U = currentUser, body = { name: U.name || undefined, phone: U.phone || undefined };
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(U.dob || '') && new Date(U.dob) < new Date() ? U.dob : undefined;
    const g = String(U.gender || '').toLowerCase();
    const exp = parseFloat(U.experience);
    body.date_of_birth = dob;
    body.gender = g ? (g === 'male' || g === 'female' ? g : 'other') : undefined;   // 'Non-binary' / 'Prefer not to say' -> other (full label kept in profile_data)
    body.location = (U.location || U.currentLocation || '').slice(0, 190) || undefined;
    body.city = (U.city || '').slice(0, 100) || undefined;
    body.state = (U.state || '').slice(0, 100) || undefined;
    body.current_job_title = (U.currentDesignation || '').slice(0, 190) || undefined;
    body.total_experience = isFinite(exp) && exp >= 0 && exp <= 60 ? exp : undefined;
    body.profile_data = stripHeavy(U);
    Object.keys(body).forEach(function(k){ if(body[k] === undefined) delete body[k]; });
    return body;
  }

  function normUrl(u){ u = String(u || '').trim(); if(!u) return undefined; if(!/^https?:\/\//i.test(u)) u = 'https://' + u; try{ new URL(u); return u.slice(0, 255); }catch(e){ return undefined; } }
  function instState(){ try{ return JSON.parse(localStorage.getItem('upadyay_inst_v1')) || null; }catch(e){ return null; } }
  async function hydrateCompany(){
    const c = await api.get('/company/profile', { silent403: true });
    const pd = (c && c.profile_data) || {};
    Object.assign(currentCompany, pd.app || {});
    if(c.company_name) currentCompany.name = c.company_name;
    if(c.industry) currentCompany.type = c.industry;
    if(c.city) currentCompany.city = c.city;
    if(c.website) currentCompany.website = c.website;
    if(c.description) currentCompany.desc = c.description;
    if(c.email) currentCompany.email = c.email;
    if(c.phone) currentCompany.phone = c.phone;
    if(c.logo && !currentCompany.logo) currentCompany.logo = fileUrl(c.logo);
    currentCompany.verification = c.verification_status || '';
    if(pd.inst && !instState()){            // bring the institution form back on a new device
      try{ localStorage.setItem('upadyay_inst_v1', JSON.stringify(pd.inst)); }catch(e){}
    }
    _instSig = JSON.stringify(instState());
    _lastSig = JSON.stringify(companyPayload());
  }
  function companyPayload(){
    const C = currentCompany;
    const body = { company_name: C.name || undefined, industry: C.type || undefined, city: C.city || undefined,
                   website: normUrl(C.website), description: C.desc || undefined,
                   phone: C.phone ? String(C.phone).slice(0, 20) : undefined };
    if(/^\S+@\S+\.\S+$/.test(C.email || '')) body.email = C.email;
    body.profile_data = stripHeavy({ app: { contactName: C.contactName, designation: C.designation, saved: C.saved, logo: C.logo }, inst: instState() });
    Object.keys(body).forEach(function(k){ if(body[k] === undefined) delete body[k]; });
    return body;
  }

  async function pushProfile(){
    if(!_syncReady || !api.hasToken()) return;
    const isCo = currentRole === 'company';
    if(!isCo && currentRole !== 'seeker') return;
    const body = isCo ? companyPayload() : seekerPayload();
    const sig = JSON.stringify(body);
    if(sig === _lastSig) return;
    try{
      await api.put(isCo ? '/company/profile' : '/candidate/profile', body, { silent403: true });
      _lastSig = sig;
    }catch(e){
      if(e.status && e.status !== 401) api.toast('Could not save your profile: ' + e.message);
    }
  }
  /* Explicit, awaited save for the faculty profile form: resolves only after the server confirms (throws ApiError otherwise). */
  window.bkSaveSeekerProfile = async function(){
    if(currentRole !== 'seeker') throw new Error('Only faculty accounts have a faculty profile.');
    const body = seekerPayload();
    const u = await api.put('/candidate/profile', body, { silent403: true });
    _lastSig = JSON.stringify(body);
    const cp = (u && (u.candidate_profile || u.candidateProfile)) || {};
    if(cp.profile_photo) currentUser.avatar = fileUrl(cp.profile_photo);
    _origSaveState();
    return u;
  };
  /* Re-read the saved profile from the server (used on tab focus so other tabs/devices' edits show up). */
  window.bkRefreshSeeker = async function(){ await hydrateSeeker(); window.bkProfileLoaded = true; window.bkProfileError = ''; _syncReady = true; _origSaveState(); };
  function schedulePush(){ clearTimeout(_timer); _timer = setTimeout(pushProfile, 900); }

  /* Every existing saveState() call now also syncs to the backend (debounced, only if something changed). */
  saveState = function(){ _origSaveState(); schedulePush(); };
  setInterval(function(){                     // institution form saves straight to localStorage; mirror it
    if(currentRole !== 'company' || !_syncReady) return;
    const s = JSON.stringify(instState());
    if(s !== _instSig){ _instSig = s; schedulePush(); }
  }, 3000);

  let _hydration = null;
  window.bkHydrate = function(){
    if(!_hydration){
      _hydration = (async function(){
        try{
          if(currentRole === 'seeker'){ await hydrateSeeker(); window.bkProfileLoaded = true; window.bkProfileError = ''; }
          else if(currentRole === 'company'){ await hydrateCompany(); if(typeof applyEmployerLock === 'function') applyEmployerLock(); }
          _syncReady = true;
          _origSaveState();
          if(currentRole === 'company'){ try{ await loadEmployer(); }catch(e){ console.warn('[backend] employer data', e); } }
          loadNotifs();
        }catch(e){
          console.warn('[backend] hydrate failed', e);
          if(currentRole === 'seeker'){ window.bkProfileLoaded = false; window.bkProfileError = (e && e.message) || 'Network error'; }
          if(e && e.status === 404){ _syncReady = true; }
        }
      })();
    }
    return _hydration;
  };
  /* Protected pages wait for the profile to load before they draw their forms. */
  const _requireLogin = requireLogin;
  requireLogin = async function(role){
    const ok = await _requireLogin(role);
    if(ok) await bkHydrate();
    return ok;
  };
  /* Pages that don't call requireLogin (home, jobs…) still load notifications + profile in the background. */
  if(typeof authReady !== 'undefined'){ authReady.then(function(u){ if(u) bkHydrate(); }); }

  /* ---------------- notifications ---------------- */
  async function loadNotifs(){
    if(!api.hasToken()) return;
    try{
      const d = await api.get('/notifications?per_page=20', { silent403: true, noAuthRedirect: true });
      const rows = d && d.notifications ? items(d.notifications) : [];
      dashNotifs = rows.map(function(n){
        return { id: n.id, read: !!n.read_at, time: n.created_at, text: '<b>' + esc(n.title) + '</b>' + (n.message ? ' — ' + esc(n.message) : '') };
      });
      hasUnreadNotif = !!(d && d.unread_count > 0);
      _origSaveState();
      ['navBellDot','dashBellDot','bjBellDot'].forEach(function(id){ const el = document.getElementById(id); if(el) el.style.display = hasUnreadNotif ? 'block' : 'none'; });
    }catch(e){ /* keep whatever we had */ }
  }
  function markRead(){ if(api.hasToken()) api.put('/notifications/read-all', {}, { silent403: true, noAuthRedirect: true }).catch(function(){}); }
  if(typeof openNotifPanel === 'function'){ const o = openNotifPanel; openNotifPanel = function(){ o.apply(this, arguments); markRead(); }; }
  if(typeof toggleDashNotifs === 'function'){ const o2 = toggleDashNotifs; toggleDashNotifs = function(){ o2.apply(this, arguments); markRead(); }; }
  setInterval(loadNotifs, 60000);
  /* pushNotif now only adds a local line for things the server doesn't announce itself. */
  window.bkLoadNotifs = loadNotifs;

  /* ---------------- employer: jobs, candidates, applicants ---------------- */
  const appByCandidate = {};          // candidateId -> latest application id (for status updates)
  const appByJobCand = {};            // jobKey:candidateId -> application id

  function mapPostedJob(j){
    const m = j.meta || {};
    return {
      id: j.id, status: j.status, title: j.title, role: m.role || '', dept: m.dept || '', type: m.type_label || j.employment_type,
      category: (j.category && j.category.name) || m.category_label || '', qualification: m.qualification || '', notice: m.notice || '',
      vacancies: j.vacancy_count, expMin: j.experience_min == null ? '' : j.experience_min, expMax: j.experience_max == null ? '' : j.experience_max,
      salMin: j.salary_min == null ? '' : j.salary_min, salMax: j.salary_max == null ? '' : j.salary_max,
      salPeriod: m.salary_period || 'month', salNeg: !!m.salary_negotiable, salNorms: !!m.salary_as_per_norms,
      campus: m.campus || '', campusLoc: m.campus_loc || '', location: j.location, desc: j.description,
      skills: (j.skills || []).map(function(s){ return s.name; }).join(', '),
      deadline: j.application_deadline ? String(j.application_deadline).slice(0, 10) : '', applicantIds: [], applicantCount: j.applications_count || 0
    };
  }
  function mapCandidate(u){
    const cp = u.candidate_profile || u.candidateProfile || {}, pd = cp.profile_data || {};
    const skillNames = (u.skills || []).map(function(s){ return s.name; });
    const exp = cp.total_experience != null ? cp.total_experience : pd.experience;
    const edu = [];
    if(pd.qualification || pd.subject) edu.push([[pd.qualification, pd.subject].filter(Boolean).join(', '), [pd.college, pd.highestQualYear].filter(Boolean).join(' · ')]);
    (pd.additionalQualifications || []).forEach(function(q){ edu.push([[q.qualification, q.specialization].filter(Boolean).join(', '), [q.college, q.year].filter(Boolean).join(' · ')]); });
    const expRows = (pd.employmentHistory || []).map(function(e){
      return [[e.designation, e.department].filter(Boolean).join(', '), [e.org, (e.from || '') + ' – ' + (e.currentlyWorking ? 'Present' : (e.to || ''))].filter(Boolean).join(' · ')];
    });
    if(!expRows.length && pd.currentOrg) expRows.push([pd.currentDesignation || 'Faculty', pd.currentOrg]);
    const links = [];
    (u.resumes || []).forEach(function(r){ if(r.file) links.push([r.file.original_name || 'Resume', 'doc', r.file.id]); });
    (u.certificates || []).forEach(function(c){ if(c.file) links.push([c.file.original_name || 'Certificate', 'doc', c.file.id]); });
    (pd.otherDocuments || []).forEach(function(d){ if(d && d.label) links.push([d.label, 'link']); });
    return {
      id: u.id, avatar: fileUrl(cp.profile_photo) || (pd.avatar && pd.avatar.indexOf('data:') !== 0 ? pd.avatar : DEFAULT_AVATAR),
      name: u.name || 'Candidate', role: cp.current_job_title || pd.currentDesignation || pd.subject || 'Faculty',
      tags: [pd.qualification, exp ? exp + ' yrs experience' : '', cp.city || pd.city || pd.location].filter(Boolean),
      college: pd.college || pd.currentOrg || '', about: cp.bio || pd.about || '',
      skills: skillNames.length ? skillNames : [].concat(pd.academicSkills || [], splitList(pd.programmingLanguages), splitList(pd.softwareTools)).slice(0, 14),
      education: edu, experience: expRows,
      stats: [[String(pd.journalPublications || 0), 'Publications'], [String(pd.totalPatents || 0), 'Patents'], [String(pd.numProjects || 0), 'Projects']],
      links: links,
      interests: { departments: splitList(pd.preferredDepartments), designations: splitList(pd.preferredDesignations), subjects: splitList(pd.preferredTeachingSubjects),
                   orgType: pd.preferredOrgType || '', location: pd.preferredLocation || pd.preferredWorkLocation || '', employmentType: pd.preferredEmploymentType || '' },
      salary: { presentCtc: pd.presentCtc, expectedCtc: pd.expectedCtc, minAcceptable: pd.minAcceptableSalary }
    };
  }
  function setProfile(u){ const p = mapCandidate(u); facultyProfiles[String(u.id)] = p; return p; }

  async function loadEmployer(){
    Object.keys(facultyProfiles).forEach(function(k){ delete facultyProfiles[k]; });
    Object.keys(postedJobs).forEach(function(k){ delete postedJobs[k]; });
    const jobs = await paged('/company/jobs', {}, 10);
    jobs.forEach(function(j){ postedJobs['j' + j.id] = mapPostedJob(j); });
    const apps = await paged('/company/applicants', {}, 10);
    apps.forEach(function(a){
      const cand = a.candidate; if(!cand) return;
      const cid = String(cand.id), key = 'j' + a.job_id;
      if(!facultyProfiles[cid]) setProfile(cand);
      if(postedJobs[key] && postedJobs[key].applicantIds.indexOf(cid) < 0) postedJobs[key].applicantIds.push(cid);
      appByJobCand[key + ':' + cid] = a.id;
      if(!appByCandidate[cid] || a.id > appByCandidate[cid]) appByCandidate[cid] = a.id;
      if(['shortlisted','interview','selected'].indexOf(a.status) > -1) candidateStatus[cid] = 'shortlisted';
    });
    const cands = await api.get('/company/candidates?per_page=50', { silent403: true });
    items(cands).forEach(function(u){ if(!facultyProfiles[String(u.id)]) setProfile(u); });
    _origSaveState();
    if(typeof renderPostedJobs === 'function') renderPostedJobs();
    if(typeof renderMyJobsCards === 'function') renderMyJobsCards();
    if(document.getElementById('candidateList') && typeof renderCandidates === 'function') renderCandidates();
  }
  window.bkReloadEmployer = loadEmployer;

  window.bkEnsureCandidate = async function(id){
    if(facultyProfiles[String(id)]) return facultyProfiles[String(id)];
    try{ return setProfile(await api.get('/company/candidates/' + encodeURIComponent(id))); }catch(e){ return null; }
  };
  window.bkOpenFile = async function(fileId){
    try{
      const r = await api.get('/files/' + fileId + '/link');
      const url = r && (r.url || r.link);
      if(url) window.open(url, '_blank', 'noopener'); else api.toast('File link unavailable.');
    }catch(e){ api.toast(e.message); }
  };
  window.bkStatusBadge = function(job){
    const s = job && job.status;
    if(s === 'published') return '<span class="badge-live">Live</span>';
    if(s === 'closed' || s === 'expired') return '<span class="badge badge-pending">Closed</span>';
    return '<span class="badge badge-pending" title="Visible after admin approval">Draft</span>';
  };

  /* Post a job → POST /company/jobs */
  window.bkPostJob = async function(f){
    const typeMap = { 'Full-time': 'full-time', 'Part-time': 'part-time', 'Contract': 'contract', 'Visiting faculty': 'part-time' };
    const loc = f.location || f.campusLoc || 'India';
    const num = function(x){ return x === '' || x == null || isNaN(Number(x)) ? null : Number(x); };
    const body = {
      title: f.title,
      description: f.desc || [f.role, f.dept, f.qualification && ('Qualification: ' + f.qualification)].filter(Boolean).join(' · ') || f.title,
      requirements: f.qualification ? ('Qualification: ' + f.qualification + (f.notice ? ' · Notice period: ' + f.notice : '')) : null,
      location: loc, city: String(loc).split(',')[0].trim().slice(0, 100) || null,
      employment_type: typeMap[f.type] || 'full-time', category_id: await categoryId(f.category),
      experience_min: num(f.expMin), experience_max: num(f.expMax),
      salary_min: f.salNorms ? null : num(f.salMin), salary_max: f.salNorms ? null : num(f.salMax),
      vacancy_count: Math.max(1, parseInt(f.vacancies, 10) || 1), application_deadline: f.deadline || null,
      status: 'published', skills: splitList(f.skills).slice(0, 30),
      meta: { role: f.role, dept: f.dept, qualification: f.qualification, notice: f.notice, type_label: f.type, category_label: f.category,
              salary_period: f.salPeriod, salary_negotiable: !!f.salNeg, salary_as_per_norms: !!f.salNorms, campus: f.campus, campus_loc: f.campusLoc }
    };
    let job;
    try{ job = await api.post('/company/jobs', body, { silent403: true }); }
    catch(e){
      if(e.status === 403){                        // company/branch not approved yet → keep it as a draft
        body.status = 'draft';
        job = await api.post('/company/jobs', body);
        api.toast('Saved as a draft — it goes live once the institution is approved.');
      }else throw e;
    }
    postedJobs['j' + job.id] = mapPostedJob(job);
    _origSaveState();
    renderPostedJobs();
    if(typeof renderMyJobsCards === 'function') renderMyJobsCards();
    return job;
  };

  function activeApiJobId(){ const j = (typeof activeJobId !== 'undefined' && activeJobId) ? postedJobs[activeJobId] : null; return j ? j.id : undefined; }
  function refreshCandidateViews(){
    if(typeof renderCandidates === 'function' && document.getElementById('candidateList')) renderCandidates(false);
    const av = document.getElementById('applicantsView');
    if(av && av.style.display !== 'none' && typeof renderApplicants === 'function') renderApplicants(activeJobId);
  }
  window.inviteCandidate = async function(id, ev){
    if(ev) ev.stopPropagation();
    try{
      await api.post('/company/invitations', { candidate_id: Number(id), job_id: activeApiJobId() });
      candidateStatus[id] = 'invited'; _origSaveState();
      const p = facultyProfiles[id]; api.toast('Invitation sent to ' + (p ? p.name : 'the candidate') + '.');
      refreshCandidateViews();
    }catch(e){ api.toast(e.message); }
  };
  window.shortlistCandidate = async function(id, ev){
    if(ev) ev.stopPropagation();
    const key = (typeof activeJobId !== 'undefined' && activeJobId) ? activeJobId : null;
    const appId = (key && appByJobCand[key + ':' + id]) || appByCandidate[id];
    if(!appId){ api.toast('This candidate has not applied to any of your jobs yet — invite them first.'); return; }
    try{
      await api.put('/company/applications/' + appId + '/status', { status: 'shortlisted' });
      candidateStatus[id] = 'shortlisted'; _origSaveState();
      const p = facultyProfiles[id]; api.toast('Shortlisted ' + (p ? p.name : 'candidate') + '.');
      refreshCandidateViews();
    }catch(e){ api.toast(e.message); }
  };
  window.messageCandidate = async function(id, ev){
    if(ev) ev.stopPropagation();
    const p = facultyProfiles[id];
    const msg = prompt('Send a message to ' + (p ? p.name : 'this candidate') + ':', "Hi, we'd like to talk to you about an opening at " + (currentCompany.name || 'our institution') + '.');
    if(!msg) return;
    try{ await api.post('/company/messages', { candidate_id: Number(id), message: msg }); api.toast('Message sent.'); }
    catch(e){ api.toast(e.message); }
  };
  /* Company profile form → PUT /company/profile (saveState hook) + validation errors surfaced. */
  if(typeof saveCompany === 'function'){
    const sc = saveCompany;
    saveCompany = function(){
      sc.apply(this, arguments);
      clearTimeout(_timer);
      api.put('/company/profile', companyPayload(), { silent403: true })
        .then(function(){ _lastSig = JSON.stringify(companyPayload()); })
        .catch(function(e){ api.toast(e.message); });
    };
  }
})();
