/* Offline build only: a database stored on the phone with the same calls as Claude's. */
if(window.__OFFLINE){(function(){
  var KEY="bp-local-db",store={};try{store=JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(e){store={}}
  var subs=[];
  function cl(o){return o==null?o:JSON.parse(JSON.stringify(o))}
  function isO(o){return o&&typeof o==="object"&&!Array.isArray(o)}
  function merge(a,b){for(var k in b){var v=b[k];if(isO(v)&&isO(a[k]))merge(a[k],v);else a[k]=cl(v)}return a}
  var saveT=null;function persist(){clearTimeout(saveT);saveT=setTimeout(function(){try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}},50)}
  function flushNow(){clearTimeout(saveT);try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}}
  document.addEventListener("visibilitychange",flushNow);window.addEventListener("pagehide",flushNow);
  function notify(){subs.forEach(function(f){try{f()}catch(e){console.error(e)}})}
  function snap(path){var d=store[path];return {id:path.split("/").pop(),exists:!!d,data:function(){return cl(d)},metadata:{fromCache:false,hasPendingWrites:false}}}
  function ok(v){return Promise.resolve(v)}
  function doc(path){return {id:path.split("/").pop(),path:path,
    get:function(){return ok(snap(path))},
    set:function(d){store[path]=cl(d);persist();notify();return ok()},
    update:function(d){if(!store[path])return Promise.reject({code:"invalid_argument",message:"missing"});merge(store[path],d);persist();notify();return ok()},
    onSnapshot:function(next){var last=null;function f(){var s=JSON.stringify(store[path]||null);if(s===last)return;last=s;next(snap(path))}subs.push(f);setTimeout(f,0);return function(){var i=subs.indexOf(f);if(i>=0)subs.splice(i,1)}}}}
  function qs(col,filters){var docs=Object.keys(store).filter(function(p){var s=p.split("/");return s.length===2&&s[0]===col}).sort().map(snap).filter(function(sn){var d=sn.data();return filters.every(function(f){var v=d[f[0]];return f[1]===">="?v>=f[2]:f[1]==="=="?v===f[2]:true})});return {docs:docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false}}}
  function query(col,filters){return {where:function(f,op,v){return query(col,filters.concat([[f,op,v]]))},orderBy:function(){return this},limit:function(){return this},
    get:function(){return ok(qs(col,filters))},
    onSnapshot:function(next){var last=null;function f(){var q=qs(col,filters),s=JSON.stringify(q.docs.map(function(d){return [d.id,d.data()]}));if(s===last)return;last=s;next(q)}subs.push(f);setTimeout(f,0);return function(){}}}}
  var db={doc:doc,collection:function(c){var q=query(c,[]);q.doc=function(id){return doc(c+"/"+id)};return q}};
  // direct put used when loading an update (no updatedAt bump, so it doesn't count as unsent)
  window.__LOCALDB={store:store,db:db,put:function(path,d){store[path]=cl(d);persist();notify()}};
  window.claude={use:function(n){return Promise.resolve(n==="db"?db:null)}};
  // Ask Chrome to keep this app's storage when space runs low (installed apps are usually granted this).
  window.__PERSIST=null;
  try{if(navigator.storage&&navigator.storage.persist){navigator.storage.persisted().then(function(p){if(p){window.__PERSIST=true;return}return navigator.storage.persist().then(function(g){window.__PERSIST=!!g})}).catch(function(){})}}catch(e){}
})()}
