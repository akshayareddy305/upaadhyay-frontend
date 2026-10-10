/* site-pages.js — shared data + helpers for For Faculty / For Employers / How It Works / job pages */
const SP_CATS = {
 'professor':['Professor','Senior academic positions at universities and degree colleges.'],
 'associate-professor':['Associate Professor','Mid-career academic roles with research and teaching responsibilities.'],
 'assistant-professor':['Assistant Professor','Entry-level academic positions at colleges and universities.'],
 'lecturer':['Lecturer','Teaching positions across colleges and junior colleges.'],
 'research':['Research Professor','Research-led faculty roles in funded labs and institutes.'],
 'research-associate':['Research Associate','Project-based research positions with leading institutes.'],
 'postdoctoral':['Postdoctoral','Postdoctoral fellowships and research appointments.'],
 'non-teaching':['Non-Teaching','Academic support and administrative roles.'],
 'academic-coordinator':['Academic Coordinator','Coordinate curriculum, schedules and academic operations.'],
 'lab-staff':['Lab Staff','Lab technicians, instructors and instrumentation staff.'],
 'administration':['Administration','Administrative and office roles in education institutions.']
};
const SP_INST=['Kakatiya Institute of Technology','Deccan Public School','National Research Institute','Osmania Degree College','Greenfield University','Sri Vidya Junior College'];
const SP_CITY=['Hyderabad','Warangal','Bengaluru','Chennai','Pune','Delhi'];
let SP_JOBS = [];   // filled from the API by spLoadJobs() in js/backend.js

function E(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function spBoot(active){ mountNav(active); mountChrome(); }
function spJobCard(j){
  return '<a class="sp-card sp-job" href="'+PAGES.jobView+'?id='+encodeURIComponent(j.id)+'"><h3>'+E(j.title)+'</h3><p>'+E(j.inst)+'</p><div class="sp-meta"><span>'+E(j.loc)+'</span><span>'+E(j.type)+'</span><span>'+E(j.exp)+'+ yrs</span><span>'+E(j.qual)+'</span></div><div class="sp-meta"><b style="color:var(--ok)">'+E(j.sal)+'</b></div></a>';
}
function spHead(title,t,d){document.title=title+' — Upadyay';}
