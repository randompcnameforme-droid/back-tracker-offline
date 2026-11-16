// Smoke tests for both builds. Run: node tests/smoke.js   (needs tests/seed.local.json and Playwright)
// Checks: tracker loads; tick hierarchy (set → exercise → block); side switch; a hanging save recovers;
// offline app loads, takes an update, logs while offline, and its log imports back into the tracker.
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
  check('tracker loads',await p.locator('#tabs .tab').count()===5);
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
  await p.evaluate(()=>{window.__MOCK.hang=true});
  await p.locator('[data-id="home-modified-dead-bug"] .row-main .tick').first().click();await p.waitForTimeout(17000);
  const waiting=await p.textContent('#saveTxt');
  await p.evaluate(()=>{window.__MOCK.hang=false});await p.waitForTimeout(8000);
  const d2=await p.evaluate(t=>window.__MOCK.store['days/'+t],T);
  check('hanging save recovers',/waiting/.test(waiting)&&d2.items['home-modified-dead-bug'].status==='done',waiting+' → '+await p.textContent('#saveTxt'));
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
  check('offline app opens with no connection',(await o.locator('#tabs .tab').count())===4,bt);
  await o.getByRole('button',{name:'Today',exact:true}).click();await o.waitForTimeout(300);
  if(await o.getByRole('button',{name:'Home',exact:true}).count())await o.getByRole('button',{name:'Home',exact:true}).click();await o.waitForTimeout(300);
  await o.locator('[data-id="home-floating-cobra"] .row-main .tick').first().click();await o.waitForTimeout(500);
  await ctx.setOffline(false);
  await o.getByRole('button',{name:'Send',exact:true}).click();await o.waitForTimeout(300);
  const [pop]=await Promise.all([ctx.waitForEvent('page'),o.getByRole('button',{name:'Send to tracker'}).click()]);
  check('Send opens the tracker import screen',/#import$/.test(pop.url()));
  const log=await o.evaluate(()=>navigator.clipboard.readText());
  await p.goto('file://'+path.join(out,'harness.html')+'#import');await p.waitForTimeout(1200);
  await p.fill('#imp-ta',log);await p.waitForTimeout(1500);
  const d3=await p.evaluate(t=>window.__MOCK.store['days/'+t],T);
  check('offline log imports into the tracker',d3&&d3.importedFromOffline&&d3.items['home-floating-cobra'].status==='done');
  check('no script errors',!errs.length,errs.join(' | '));
  await b.close();srv.close();
  console.log(failures.length?'\n'+failures.length+' FAILED':'\nALL PASSED');process.exit(failures.length?1:0);
})();
