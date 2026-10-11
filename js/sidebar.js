/* sidebar.js — role-based left sidebar for the dashboards.
   company (main institution) | branch (sub-branch) | seeker (faculty)
   Needs profile-card.js. Mount once per page; it re-renders itself whenever the profile data changes. */
(function(){
  if(!window.UpCard) return;
  var $ = function(id){ return document.getElementById(id); };
  var esc = UpCard.esc, state = { ov:false }, items = [], side, fab, scrim;

  var P = { grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', building:'M4 21V4.5L12 2l8 2.5V21M9 21v-5h6v5M8 8h2M14 8h2M8 12h2M14 12h2',
    shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4', tree:'M12 3v6m0 0L5 15m7-6l7 6M5 15v6m14-6v6', inbox:'M4 5h16v11H8l-4 4z',
    plus:'M12 5v14M5 12h14', list:'M4 7h16M4 12h16M4 17h10', people:'M16 11a3 3 0 100-6 3 3 0 000 6zM8 12a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5',
    search:'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.35-4.35', user:'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6', badge:'M12 8v4l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
    bell:'M12 3a5 5 0 00-5 5v3l-2 4h14l-2-4V8a5 5 0 00-5-5zM10 18a2 2 0 004 0', cog:'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z',
    out:'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9', lock:'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z' };
  function ic(n){ return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + P[n] + '"/></svg>'; }
  function lsj(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }
  function toast(m){ if(typeof showGenericToast === 'function') showGenericToast(m); else if(window.api && api.toast) api.toast(m); }
  function approvedMain(){ return typeof employerApproved === 'function' && employerApproved(); }

  /* ---------- main institution ---------- */
  function hideOv(){ state.ov = false; var o = $('upOverview'); if(o) o.style.display = 'none'; }
  function tab(t){ if(typeof switchEmployerTab === 'function') switchEmployerTab(t); }
  function sec(k){
    var I = lsj('upadyay_inst_v1') || {};
    if(I.view === 'wizard' && k !== 'profile'){ toast('Finish your institution registration first.'); return; }
    tab('company'); if(window.IN && IN.sec) IN.sec(k); window.scrollTo(0, 0);
  }
  function overview(){
    var host = $('dashCompanyTab'); if(!host) return;
    tab('company'); host.style.display = 'none';
    var o = $('upOverview');
    if(!o){ o = document.createElement('div'); o.id = 'upOverview'; o.className = 'up-ov'; host.parentNode.insertBefore(o, host); }
    state.ov = true; o.style.display = 'block'; paintOverview(); window.scrollTo(0, 0);
  }
  function paintOverview(){
    var o = $('upOverview'); if(!o || !state.ov) return;
    var c = UpCard.data('company'), ok = c.approved;
    o.innerHTML = '<div class="in-head"><h3>Overview</h3><p>' + esc(c.hint) + '</p></div>'
      + '<div class="up-tiles">' + c.stats.map(function(s){ return '<div class="up-tile"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>'; }).join('') + '</div>'
      + '<div class="up-acts">'
      + '<button class="btn btn-primary btn-sm" data-ov="' + (ok ? 'post' : 'verify') + '">' + (ok ? '+ Post a job' : 'Finish verification') + '</button>'
      + '<button class="btn btn-ghost btn-sm" data-ov="profile">Institution profile</button>'
      + (ok ? '<button class="btn btn-ghost btn-sm" data-ov="myjobs">Posted jobs</button><button class="btn btn-ghost btn-sm" data-ov="candidates">Browse faculty</button>' : '') + '</div>'
      + (c.pending ? '<div class="in-note" style="margin-top:14px"><b>1 sub-branch request is waiting.</b> Review it under Sub-branch requests.</div>' : '');
    [].forEach.call(o.querySelectorAll('[data-ov]'), function(b){ b.onclick = function(){ var t = b.getAttribute('data-ov'); if(t === 'verify' || t === 'profile') sec(t); else tab(t); schedule(); }; });
  }
  function companyActive(){
    if(state.ov) return 'ov';
    var t = 'company'; try{ t = sessionStorage.getItem('upadyay_emp_tab') || 'company'; }catch(e){}
    if(t === 'post') return 'post'; if(t === 'myjobs') return 'myjobs'; if(t === 'candidates') return 'cands';
    var el = document.querySelector('#instRoot .in-dash .in-step.on:not(.sub) .in-step-t'), x = el ? el.textContent.toLowerCase() : '';
    return /^verif/.test(x) ? 'verify' : /^branch/.test(x) ? 'branches' : /^repres/.test(x) ? 'rep' : /^posted/.test(x) ? 'myjobs' : 'profile';
  }
  function companyItems(){
    var c = UpCard.data('company'), ok = c.approved;
    return { active:companyActive(), edit:function(){ hideOv(); tab('company'); if(window.IN && IN.edit) IN.edit(0); },
      list:[ { k:'ov', t:'Overview', i:'grid', go:overview },
        { k:'profile', t:'Institution profile', i:'building', go:function(){ sec('profile'); } },
        { k:'verify', t:'Verification', i:'shield', go:function(){ sec('verify'); }, flag:!ok },
        { k:'branches', t:'Branches / campuses', i:'tree', go:function(){ sec('branches'); }, lock:!ok },
        { k:'reqs', t:'Sub-branch requests', i:'inbox', go:function(){ sec('branches'); }, lock:!ok, n:c.pending },
        { k:'post', t:'Post a job', i:'plus', go:function(){ tab('post'); }, lock:!ok },
        { k:'myjobs', t:'Posted jobs', i:'list', go:function(){ tab('myjobs'); }, lock:!ok, n:c.stats[2][0] },
        { k:'apps', t:'Applicants', i:'people', go:function(){ tab('myjobs'); }, lock:!ok, n:c.stats[3][0] },
        { k:'cands', t:'Browse faculty', i:'search', go:function(){ tab('candidates'); }, lock:!ok },
        { k:'rep', t:'Representative & authority', i:'user', go:function(){ sec('rep'); } },
        { k:'out', t:'Log out', i:'out', go:function(){ logoutUser(); }, out:1 } ] };
  }

  /* ---------- sub-branch ---------- */
  function bt(t, locked){
    if(locked){ toast('Unlocks once your main institution approves this branch.'); return; }
    if(typeof nwOpenTab === 'function' && nwOpenTab(t)) return;
    goTo('network', { start:'dash', tab:t });
  }
  function branchItems(){
    var c = UpCard.data('branch'), ok = c.approved, sd = 'profile';
    try{ if(typeof S === 'object' && S && S.sd) sd = S.sd; }catch(e){}
    return { active:sd, edit:function(){ bt('profile'); },
      list:[ { k:'profile', t:'Branch profile', i:'building', go:function(){ bt('profile'); } },
        { k:'post', t:'Post a job', i:'plus', go:function(){ bt('post', !ok); }, lock:!ok },
        { k:'jobs', t:'Posted jobs', i:'list', go:function(){ bt('jobs', !ok); }, lock:!ok, n:c.stats[0][0] },
        { k:'cands', t:'Browse faculty', i:'search', go:function(){ bt('cands', !ok); }, lock:!ok },
        { k:'reqs', t:'Requests', i:'inbox', go:function(){ bt('reqs', !ok); }, lock:!ok },
        { k:'out', t:'Log out', i:'out', go:function(){ logoutUser(); }, out:1 } ] };
  }

  /* ---------- faculty ---------- */
  function facultyItems(){
    var onPage = !!$('dashProfileTab');
    function mine(){ if(onPage && typeof switchDashTab === 'function'){ switchDashTab('profile'); window.scrollTo(0, 0); } else goTo('faculty'); }
    return { active:onPage ? 'profile' : '', edit:mine,
      list:[ { k:'profile', t:'My profile', i:'user', go:mine },
        { k:'jobs', t:'Browse jobs', i:'search', go:function(){ goTo('jobs'); } },
        { k:'notif', t:'Notifications', i:'bell', go:function(){ var b = document.querySelector('.nav-bell'); if(b) b.click(); } },
        { k:'set', t:'Settings', i:'cog', go:function(){ if(typeof openFullProfile === 'function') openFullProfile(); else mine(); } },
        { k:'out', t:'Log out', i:'out', go:function(){ logoutUser(); }, out:1 } ] };
  }

  /* ---------- render ---------- */
  function visible(r){
    if(typeof isLoggedIn === 'undefined' || !isLoggedIn) return false;
    if(r === 'company') return !!$('dashCompanyTab');
    if(r === 'seeker') return !!$('dashProfileTab');
    if(r === 'branch'){ try{ return typeof S === 'object' && S && S.role === 'sub'; }catch(e){ return false; } }
    return false;
  }
  function ensure(){
    if(side) return;
    side = document.createElement('aside'); side.id = 'upSide'; side.className = 'up-side'; side.setAttribute('aria-label', 'Dashboard menu');
    fab = document.createElement('button'); fab.id = 'upSideFab'; fab.type = 'button'; fab.className = 'up-fab'; fab.textContent = 'Menu';
    scrim = document.createElement('div'); scrim.className = 'up-scrim';
    document.body.appendChild(side); document.body.appendChild(fab); document.body.appendChild(scrim);
    var toggle = function(on){ side.classList.toggle('open', on); scrim.classList.toggle('open', on); };
    fab.onclick = function(){ toggle(!side.classList.contains('open')); }; scrim.onclick = function(){ toggle(false); };
    side.addEventListener('click', function(e){
      var b = e.target.closest('[data-k]'); if(!b) return;
      if(b.getAttribute('data-k') === '_edit'){ side._cfg.edit(); }
      else { var it = items.filter(function(x){ return x.k === b.getAttribute('data-k'); })[0]; if(it) it.go(); }
      toggle(false); schedule();
    });
  }
  function render(){
    var r = UpCard.role(), on = visible(r);
    document.body.classList.toggle('up-has-side', on);
    if(!side && !on) return;
    ensure(); side.style.display = fab.style.display = on ? '' : 'none'; if(!on) return;
    var cfg = r === 'company' ? companyItems() : r === 'branch' ? branchItems() : facultyItems(); side._cfg = cfg; items = cfg.list;
    var c = UpCard.data(r), scrollY = side.scrollTop;
    var plain = r === 'company';   /* main institution: menu only, no profile card / edit button */
    side.innerHTML = (plain ? '' : UpCard.html(c, { noRows:r === 'seeker' })
      + '<button type="button" class="btn btn-ghost btn-sm up-edit" data-k="_edit">' + esc(c.editLabel) + '</button>')
      + '<nav class="up-nav">' + items.map(function(it){
          return '<button type="button" class="up-item' + (it.k === cfg.active ? ' on' : '') + (it.out ? ' out' : '') + (it.lock ? ' locked' : '') + '" data-k="' + it.k + '"' + (it.k === cfg.active ? ' aria-current="page"' : '') + '>'
            + ic(it.i) + '<span class="t">' + esc(it.t) + '</span>'
            + (it.n ? '<em>' + esc(it.n) + '</em>' : '') + (it.flag ? '<em class="flag">!</em>' : '') + (it.lock ? '<i class="lk" title="Locked until approved">' + ic('lock') + '</i>' : '') + '</button>'; }).join('') + '</nav>';
    side.scrollTop = scrollY;
    paintOverview();
  }
  var t0; function schedule(){ clearTimeout(t0); t0 = setTimeout(render, 60); }

  /* keep the active item right when tabs or sections change from inside the page */
  if(typeof switchEmployerTab === 'function' && !switchEmployerTab.__up){
    var _sw = switchEmployerTab;
    window.switchEmployerTab = function(){ hideOv(); var r = _sw.apply(this, arguments); schedule(); return r; };
    window.switchEmployerTab.__up = 1;
  }
  var root = $('instRoot'); if(root && window.MutationObserver) new MutationObserver(schedule).observe(root, { childList:true, subtree:true });
  UpCard.onChange(render);
  var go = function(){ render(); setTimeout(render, 400); setTimeout(render, 1500); };   /* pages build their state async after login */
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  window.UpSide = { render:render };
})();
