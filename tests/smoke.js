// Smoke tests for both builds. Run: node tests/smoke.js   (needs tests/seed.local.json and Playwright)
// Checks: tracker loads; tick hierarchy (set → exercise → block); side switch; a hanging save recovers;
// offline app loads, takes an update, logs while offline, and its log imports back into the tracker;
// Session tab (3.11): timer + list, mini bar, start/stop/rest, holds past target, pause, restart set/exercise, skip for now,
// free order, undo, per-side counts, home sessions, reload, finish, after midnight, offline timings.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const R=path.resolve(__dirname,'..');
function today(){const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
const seedObj=JSON.parse(fs.readFileSync(path.join(__dirname,'seed.local.json'),'utf8'));delete seedObj['days/'+today()];const seed=JSON.stringify(seedObj); // tests start from a blank today
const failures=[];function check(name,ok,extra){console.log((ok?'PASS ':'FAIL ')+name+(extra?' — '+extra:''));if(!ok)failures.push(name)}
(async()=>{
  const out=path.join(__dirname,'out');fs.mkdirSync(out,{recursive:true});
  const tracker=fs.readFileSync(path.join(R,'dist/tracker.html'),'utf8');
  fs.writeFileSync(path.join(out,'harness.html'),'<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body><script>window.__SEED='+seed+'</script><script src="../mock.js"></script>'+tracker+'</body></html>');
  const srv=http.createServer((q,s)=>{const f=path.join(R,decodeURIComponent(q.url.split('?')[0]).replace(/\/$/,'/index.html'));fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.png')?'image/png':'application/json'});s.end(b)})}).listen(8799);
  const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.grantPermissions(['clipboard-read','clipboard-write']);await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://localhost:8799'});
  await ctx.route(/cdn\.jsdelivr|fonts\.googleapis|claude\.ai/,r=>r.fulfill({body:''}));
  const errs=[];
  // ---- tracker
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push('tracker: '+e.message));
  await p.goto('file://'+path.join(out,'harness.html'));await p.waitForTimeout(1200);
  check('tracker loads',await p.locator('#tabs .tab').count()===6);
  const T=today();
  if(await p.getByRole('button',{name:'Home',exact:true}).count())await p.getByRole('button',{name:'Home',exact:true}).click();await p.waitForTimeout(500);
  const st=async id=>p.locator('[data-id="'+id+'"] .row-main .tick').first().getAttribute('data-s');
  await p.locator('[data-id="home-bird-dog"] .row-text').first().click();await p.waitForTimeout(300);
  await p.getByRole('button',{name:'Tick set 1'}).first().click();await p.waitForTimeout(300);
  check('one set ticked → exercise part done',(await st('home-bird-dog'))==='partial');
  await p.locator('[data-id="home-bird-dog"] .row-main .tick').first().click();await p.waitForTimeout(300);
  check('exercise tick → all sets ticked',(await st('home-bird-dog'))==='done');
  await p.locator('[data-id="home-bird-dog"] .row-main .tick').first().click();await p.waitForTimeout(300);
  check('exercise untick → clears',(await st('home-bird-dog'))!=='done');
  check('side switch shown',await p.locator('[data-id="home-bird-dog"] .segm-btn').count()===2);
  await p.locator('[data-id="home-full-mobility-block"] .row-main .tick').first().click();await p.waitForTimeout(1500);
  const d1=await p.evaluate(t=>window.__MOCK.store['days/'+t],T);
  check('block tick → children ticked',d1&&d1.items['mob-9']&&d1.items['mob-9'].status==='done');
  check('version notice shown',await p.getByText(/Updated to \d/).count()===1);
  await p.getByRole('button',{name:'Pain 0',exact:true}).click();await p.waitForTimeout(300);
  await p.getByRole('button',{name:'More Sleep hours'}).click();await p.getByRole('button',{name:'Side',exact:true}).click();await p.waitForTimeout(1500);
  const dm=await p.evaluate(t=>window.__MOCK.store['days/'+t],T);
  check('morning pain and sleep saved',dm&&dm.morning&&dm.morning.pain===0&&dm.morning.sleepH===7.5&&dm.morning.sleepPos==='side'&&dm.loggedWith&&dm.loggedWith.tracker,JSON.stringify(dm&&dm.morning));
  await p.evaluate(()=>{window.__MOCK.hang=true});
  await p.locator('[data-id="home-modified-dead-bug"] .row-main .tick').first().click();await p.waitForTimeout(17000);
  const waiting=await p.textContent('#saveTxt');
  await p.evaluate(()=>{window.__MOCK.hang=false});await p.waitForTimeout(8000);
  const d2=await p.evaluate(t=>window.__MOCK.store['days/'+t],T);
  check('hanging save recovers',/waiting/.test(waiting)&&d2.items['home-modified-dead-bug'].status==='done',waiting+' → '+await p.textContent('#saveTxt'));

  // ---- Session tab (3.11), on a fake clock so rests and holds can be fast-forwarded
  const ctx2=await b.newContext({viewport:{width:390,height:844}});await ctx2.route(/cdn\.jsdelivr|fonts\.googleapis|claude\.ai/,r=>r.fulfill({body:''}));
  await ctx2.clock.install();
  const q=await ctx2.newPage();q.on('pageerror',e=>errs.push('session: '+e.message));
  const day=async()=>{await q.clock.fastForward(2000);await q.waitForTimeout(300);return q.evaluate(t=>{const d=JSON.parse(JSON.stringify(window.__MOCK.store['days/'+t]||{}));return d},T)};
  const ff=async ms=>{await q.clock.fastForward(ms);await q.waitForTimeout(150)};
  const main=()=>q.locator('#sessRoot .dock-main');
  const row=id=>q.locator('#sessRoot .srow[data-id="'+id+'"]');
  const pick=async id=>{await row(id).locator('.srow-btn').click();await q.waitForTimeout(200)};
  const link=name=>q.locator('#sessRoot').getByRole('button',{name:name,exact:true});
  const dk=()=>q.evaluate(()=>window.__BP_TEST.dock());
  const tabsQ=q.locator('#tabs .tab');
  await q.goto('file://'+path.join(out,'harness.html'));await q.waitForTimeout(1500);
  await q.getByRole('button',{name:'Gym',exact:true}).click();await q.waitForTimeout(400);
  await tabsQ.nth(1).click();await q.waitForTimeout(400);
  const rows0=await q.locator('#sessRoot .srow').count(),timer0=await q.locator('#sessRoot .sess-timer').isVisible();
  await main().click();await q.waitForTimeout(300); // Start gym session
  let mini=true;for(const i of [0,2,3]){await tabsQ.nth(i).click();await q.waitForTimeout(300);mini=mini&&await q.locator('#dock.mini').isVisible()}
  await tabsQ.nth(1).click();await q.waitForTimeout(300);
  check('Session tab: timer with the list under it; one-line bar on other tabs while running',timer0&&rows0>5&&mini&&!(await q.locator('#dock').isVisible()),JSON.stringify({rows0,timer0,mini}));
  // rep exercise, Start → Stop → Start
  await pick('pull-1-1');
  await main().click();await ff(40000);await main().click();await ff(60000);
  await main().click();await ff(35000);await main().click();await q.waitForTimeout(300);
  let dd=await day();const e1=dd.entries['pull-1-1|-|1'],e2=dd.entries['pull-1-1|-|2'];
  let tm=await q.evaluate(()=>window.__BP_TEST.timing());
  check('Start → Stop → Start writes two timed sets and rest > 0',!!(e1&&e1.startedAt&&e1.endedAt&&e2&&e2.startedAt&&e2.endedAt&&e1.reps!=null)&&tm.restS>0,'rest '+Math.round(tm.restS)+' s');
  // free order. A = pull-1-1 has 2 of 3; time C (face pull) instead of B, then come back to A
  await pick('pull-1-4');
  const aMid=await row('pull-1-1').textContent();
  await ff(30000);await main().click();await ff(40000);await main().click();await ff(30000);
  await pick('pull-1-1');
  const unitTxt=await q.locator('#sessRoot .dock-unit').textContent();
  await main().click();await ff(40000);await main().click();await q.waitForTimeout(200);
  tm=await q.evaluate(()=>window.__BP_TEST.timing());const bRow=await row('pull-1-2').textContent();
  check('free order: A, then C, then back to A',/2\/3/.test(aMid)&&/set 3 of 3/.test(unitTxt)&&tm.transitionS>=55&&!/\d\/\d/.test(bRow),JSON.stringify({aMid,unitTxt,trans:tm.transitionS,bRow}));
  // a finished item shows Done; tapping it makes it current with another set
  const aDone=/Done/.test(await row('pull-1-1').textContent());
  await pick('pull-1-1');let ds=await dk();
  check('finished item shows Done; tapping it makes it current with another set',aDone&&ds.cur==='pull-1-1'&&ds.unit&&ds.unit.extra&&ds.unit.n===4,JSON.stringify(ds.unit));
  // a hold past its target keeps counting; Stop saves it; Edit moves holdS and endedAt together
  await pick('gym-standing-lat-stretch');
  await main().click();await ff(52000);
  const still=await main().textContent();
  await main().click();await q.waitForTimeout(300);
  dd=await day();const hKey=Object.keys(dd.entries).filter(k=>k.indexOf('gym-standing-lat-stretch|')===0)[0];const hEntry=dd.entries[hKey];
  await q.getByRole('button',{name:'Edit last set'}).click();await q.waitForTimeout(300);
  await q.fill('#de-holdS','38');await q.getByRole('button',{name:'Save',exact:true}).click();await q.waitForTimeout(300);
  dd=await day();const hE2=dd.entries[hKey]||{};
  check('hold runs past target; Stop saves longer holdS; Edit sets holdS and endedAt',/Stop/.test(still)&&hEntry&&hEntry.holdS>=52&&hE2.holdS===38&&Date.parse(hE2.endedAt)-Date.parse(hE2.startedAt)===38000,JSON.stringify({held:hEntry&&hEntry.holdS,after:hE2.holdS}));
  // Pause: paused time is left out of the hold
  await main().click();await ff(10000);await link('Pause').click();await ff(30000);
  const pausedShown=/Paused/.test(await q.locator('#sessRoot .sess-timer').textContent());
  await link('Resume').click();await ff(10000);await main().click();await q.waitForTimeout(300);
  dd=await day();const pk=Object.keys(dd.entries).filter(k=>k.indexOf('gym-standing-lat-stretch|')===0&&k!==hKey)[0],pe=dd.entries[pk]||{};
  tm=await q.evaluate(()=>window.__BP_TEST.timing());
  check('Pause: paused time is not counted in the hold or as stretch time',pausedShown&&pe.holdS>=19&&pe.holdS<=22&&pe.pausedS>=29&&pe.pausedS<=31,JSON.stringify({holdS:pe.holdS,pausedS:pe.pausedS}));
  // Undo after Stop restores the running unit
  await pick('pull-1-2');
  await main().click();await ff(20000);await main().click();await q.waitForTimeout(200);
  await link('Undo').click();await q.waitForTimeout(300);
  dd=await day();const und=dd.entries['pull-1-2|-|1'];
  check('Undo after Stop restores the running unit',/Stop/.test(await main().textContent())&&(!und||!und.endedAt),JSON.stringify(und));
  // Restart the running set: clock back to zero
  await ff(15000);await link('Restart…').click();await q.waitForTimeout(200);
  await q.getByRole('button',{name:/^Restart this set/}).click();await q.waitForTimeout(300);
  const zero=await q.locator('#sessRoot .dock-big').textContent();
  check('Restart set puts the clock back to zero',/^00:0[0-2]$/.test(zero),zero);
  // reload during a running unit
  await ff(35000);await q.waitForTimeout(1500);
  await q.reload();await q.waitForTimeout(1800);
  const clockTxt=await q.locator('#sessRoot .dock-big').textContent().catch(()=>'');
  check('reload keeps the running unit and its elapsed time',/Stop/.test(await main().textContent().catch(()=>''))&&/^00:(3\d|4\d)/.test(clockTxt),clockTxt);
  await main().click();await q.waitForTimeout(300);
  // Skip for now moves down the list; finishing the next one does not go back to the skipped one
  await link('Skip for now ›').click();await q.waitForTimeout(300);ds=await dk();
  const afterSkip=ds.cur;
  for(let i=0;i<12&&(await dk()).cur===afterSkip;i++){await link('Done, no timing').click();await q.waitForTimeout(150)}
  ds=await dk();
  check('Skip for now moves on; after that item the next one below is suggested, not the skipped one',afterSkip==='pull-1-3'&&ds.cur==='pull-1-4',JSON.stringify({afterSkip,next:ds.cur}));
  // Restart an exercise from set 1 (with confirm), then Undo brings the sets back
  await pick('pull-1-1');await link('Restart…').click();await q.waitForTimeout(200);
  await q.getByRole('button',{name:/^Restart Lat pulldown from set 1/}).click();await q.waitForTimeout(200);
  await q.getByRole('button',{name:'Clear and restart'}).click();await q.waitForTimeout(300);
  dd=await day();const cleared=Object.keys(dd.entries).filter(k=>k.indexOf('pull-1-1|')===0).every(k=>dd.entries[k].deleted);
  ds=await dk();const u1=ds.unit&&ds.unit.n;
  await link('Undo').click();await q.waitForTimeout(300);dd=await day();
  const back3=Object.keys(dd.entries).filter(k=>k.indexOf('pull-1-1|')===0&&!dd.entries[k].deleted&&dd.entries[k].done).length;
  check('Restart exercise clears its sets and starts at set 1; Undo brings them back',cleared&&u1===1&&back3>=3,JSON.stringify({cleared,u1,back3}));
  // finish with items left
  ds=await dk();const untouched=ds.left.filter(id=>!Object.keys(dd.entries).some(k=>k.indexOf(id+'|')===0))[0];
  await q.getByRole('button',{name:'Finish session',exact:true}).click();await q.waitForTimeout(300);
  await q.getByRole('button',{name:'Finish',exact:true}).click();await q.waitForTimeout(1500);
  dd=await day();const itU=dd.items[untouched]||{};
  check('finish with items undone leaves them unticked',!!untouched&&dd.sessionCompleted===true&&itU.status!=='done'&&itU.tick!=='on'&&await q.locator('#sessRoot .dock-fin').count()===1,untouched+' '+JSON.stringify(itU));
  await ctx2.close();
  // home block on a fresh day: ctx "home", rotation untouched, sided exercises counted per side
  const ctx3=await b.newContext({viewport:{width:390,height:844}});await ctx3.route(/cdn\.jsdelivr|fonts\.googleapis|claude\.ai/,r=>r.fulfill({body:''}));await ctx3.clock.install();
  const q2=await ctx3.newPage();q2.on('pageerror',e=>errs.push('session home: '+e.message));
  await q2.goto('file://'+path.join(out,'harness.html'));await q2.waitForTimeout(1500);
  const st0=await q2.evaluate(()=>JSON.stringify(window.__MOCK.store['state/current']));
  await q2.getByRole('button',{name:'Home',exact:true}).click();await q2.waitForTimeout(300);
  await q2.locator('#tabs .tab').nth(1).click();await q2.waitForTimeout(400);
  const m2=()=>q2.locator('#sessRoot .dock-main');
  const lbl=await m2().textContent();
  await m2().click();await q2.waitForTimeout(300);
  await q2.locator('#sessRoot .srow[data-id="home-band-straight-arm-pulldown"] .srow-btn').click();await q2.waitForTimeout(200);
  const saLabel=await q2.locator('#sessRoot .dock-unit').textContent();
  for(let i=0;i<2;i++){await q2.locator('#sessRoot').getByRole('button',{name:'Done, no timing',exact:true}).click();await q2.waitForTimeout(200)}
  const saRow=await q2.locator('#sessRoot .srow[data-id="home-band-straight-arm-pulldown"]').textContent();
  check('sided exercise: label says "of 2 each side", list says "1/2 each"',/set 1 of 2 each side · Right/.test(saLabel)&&/1\/2 each/.test(saRow),JSON.stringify({saLabel,saRow:saRow.slice(0,80)}));
  await m2().click();await q2.clock.fastForward(20000);await m2().click();await q2.waitForTimeout(300);
  await q2.getByRole('button',{name:'Finish session',exact:true}).click();await q2.waitForTimeout(300);
  await q2.getByRole('button',{name:'Finish',exact:true}).click();await q2.waitForTimeout(1500);
  const hd=await q2.evaluate(t=>window.__MOCK.store['days/'+t],T);const st1=await q2.evaluate(()=>JSON.stringify(window.__MOCK.store['state/current']));
  const wev=Object.values(hd.events||{}).filter(e=>e&&/^workout-/.test(e.type));
  check('home day: Start block → Finish block writes ctx home, rotation untouched',lbl==='Start home block'&&wev.length===2&&wev.every(e=>e.ctx==='home')&&st0===st1,JSON.stringify(wev));
  await q2.goto('file://'+path.join(out,'harness.html')+'#progress/tl:'+T);await q2.waitForTimeout(1500);
  const sh2=await q2.evaluate(t=>{const s=window.__MOCK.store['sessionHistory/all'];return s&&s.days&&s.days[t]},T);
  check('timeline and sessionHistory list the home session',await q2.getByText(/^Home · \d\d:\d\d–/).count()===1&&!!sh2&&Object.values(sh2.sessions||{}).some(x=>x.ctx==='home'&&x.workS>=19),JSON.stringify(sh2&&sh2.sessions));
  await ctx3.close();
  // ---- after midnight (3.10.1): yesterday's session can still be timed
  {
    const ctx4=await b.newContext({viewport:{width:390,height:844}});await ctx4.route(/cdn\.jsdelivr|fonts\.googleapis|claude\.ai/,r=>r.fulfill({body:''}));
    await ctx4.clock.install({time:new Date(2027,2,2,0,1,0)});
    const m=await ctx4.newPage();m.on('pageerror',e=>errs.push('midnight: '+e.message));
    const mm=()=>m.locator('#sessRoot .dock-main');
    await m.goto('file://'+path.join(out,'harness.html'));await m.waitForTimeout(1500);
    await m.getByRole('button',{name:'Previous day'}).click();await m.waitForTimeout(300);
    await m.getByRole('button',{name:'Gym',exact:true}).click();await m.waitForTimeout(300);
    await m.locator('#tabs .tab').nth(1).click();await m.waitForTimeout(400);
    const lbl=await mm().textContent().catch(()=>'no timer');
    await mm().click();await m.waitForTimeout(200);
    await mm().click();await m.clock.fastForward(30000);await mm().click();
    await m.clock.fastForward(2000);await m.waitForTimeout(400);
    const yd=await m.evaluate(()=>window.__MOCK.store['days/2027-03-01']);
    const timed=yd&&Object.values(yd.entries||{}).some(e=>e&&e.startedAt&&e.endedAt);
    check('after midnight: yesterday shows the timer and times a set',lbl==='Start gym session'&&timed,lbl);
    await m.goto('file://'+path.join(out,'harness.html'));await m.waitForTimeout(1500);
    const ban=m.getByRole('button',{name:/^Open Mon/});const hasBan=await ban.count();
    if(hasBan)await ban.click();await m.waitForTimeout(400);
    await m.locator('#tabs .tab').nth(1).click();await m.waitForTimeout(400);
    const back=await mm().textContent().catch(()=>'no timer');
    await m.clock.fastForward(5*3600*1000);await m.waitForTimeout(1300);
    const at5=await m.locator('#sessRoot .sess-timer').isVisible().catch(()=>false);
    check('after midnight: banner reopens yesterday; a running session keeps its timer past 4 am',hasBan===1&&/Start/.test(back)&&at5,JSON.stringify({hasBan,back,at5}));
    await ctx4.close();
  }
  // ---- offline
  await p.goto('file://'+path.join(out,'harness.html')+'#import');await p.waitForTimeout(1000);
  await p.goto('file://'+path.join(out,'harness.html'));await p.waitForTimeout(1000);
  await p.getByRole('button',{name:'Library',exact:true}).click();await p.getByRole('button',{name:/Offline app/}).click();await p.waitForTimeout(300);
  await p.getByRole('button',{name:'Copy update for offline app'}).click();await p.waitForTimeout(300);
  const upd=await p.evaluate(()=>navigator.clipboard.readText());
  const o=await ctx.newPage();o.on('pageerror',e=>errs.push('offline: '+e.message));
  await o.goto('http://localhost:8799/');await o.waitForTimeout(1200);
  check('offline app asks for set-up',await o.getByText('Load your programme').count()===1);
  await o.getByRole('button',{name:'Go to Send'}).click();await o.fill('#upd-ta',upd);await o.getByRole('button',{name:'Load update'}).click();await o.waitForTimeout(600);
  await o.evaluate(()=>navigator.serviceWorker.ready);await o.reload();await o.waitForTimeout(800); // as on the phone: opened online once before going offline
  await ctx.setOffline(true);await o.reload();await o.waitForTimeout(1500);
  const bt=await o.evaluate(()=>{var e=document.querySelector('#barMain');return e?e.textContent:document.body.textContent.slice(0,120)});
  check('offline app opens with no connection',(await o.locator('#tabs .tab').count())===5,bt);
  await o.getByRole('button',{name:'Today',exact:true}).click();await o.waitForTimeout(300);
  if(await o.getByRole('button',{name:'Home',exact:true}).count())await o.getByRole('button',{name:'Home',exact:true}).click();await o.waitForTimeout(300);
  await o.locator('[data-id="home-floating-cobra"] .row-main .tick').first().click();await o.waitForTimeout(500);
  await o.locator('#tabs .tab').nth(1).click();await o.waitForTimeout(400);
  const om=()=>o.locator('#sessRoot .dock-main');
  if(/Start (home|gym|office)/.test(await om().textContent())){await om().click();await o.waitForTimeout(300)}
  await om().click();await o.waitForTimeout(1300);await om().click();await o.waitForTimeout(1800);
  const offDock=await o.locator('#sessRoot').innerText().catch(e=>'nodock '+e.message);
  await o.locator('#tabs .tab').nth(0).click();await o.waitForTimeout(400);
  const offTimed=await o.evaluate(t=>{const d=window.__LOCALDB.store['days/'+t]||{};return Object.keys(d.entries||{}).filter(k=>d.entries[k]&&d.entries[k].startedAt&&d.entries[k].endedAt)},T);
  await ctx.setOffline(false);
  await o.getByRole('button',{name:'Send',exact:true}).click();await o.waitForTimeout(300);
  const [pop]=await Promise.all([ctx.waitForEvent('page'),o.getByRole('button',{name:'Send to tracker'}).click()]);
  check('Send opens the tracker import screen',/#import$/.test(pop.url()));
  const log=await o.evaluate(()=>navigator.clipboard.readText());
  await p.goto('file://'+path.join(out,'harness.html')+'#import');await p.waitForTimeout(1200);
  await p.fill('#imp-ta',log);await p.waitForTimeout(1500);
  const d3=await p.evaluate(t=>window.__MOCK.store['days/'+t],T);
  check('offline log imports into the tracker',d3&&d3.importedFromOffline&&d3.items['home-floating-cobra'].status==='done');
  check('import warns about a day also logged in the tracker',await p.getByText(/also logged here in the tracker/).count()===1);
  check('import keeps tracker morning data',d3&&d3.morning&&d3.morning.pain===0);
  check('offline app: dock times a set with no connection and the timing imports',offTimed.length>0&&offTimed.every(k=>d3.entries[k]&&d3.entries[k].startedAt&&d3.entries[k].endedAt),JSON.stringify(offTimed)+(offTimed.length?'':' '+offDock));
  check('no script errors',!errs.length,errs.join(' | '));
  await b.close();srv.close();
  console.log(failures.length?'\n'+failures.length+' FAILED':'\nALL PASSED');process.exit(failures.length?1:0);
})();
