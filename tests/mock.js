(function(){
  // the store survives page reloads in the same tab, like the real database
  var store=(function(){try{var x=sessionStorage.getItem("__mockStore");if(x)return JSON.parse(x)}catch(e){}return window.__SEED||{}})();
  var subs=[];var M=window.__MOCK={store:store,hang:false,fail:null,writes:0,calls:[]};
  function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
  function isObj(o){return o&&typeof o==="object"&&!Array.isArray(o)}
  function merge(a,b){for(var k in b){var v=b[k];if(isObj(v)&&isObj(a[k]))merge(a[k],v);else a[k]=clone(v)}return a}
  function notify(){try{sessionStorage.setItem("__mockStore",JSON.stringify(store))}catch(e){}subs.forEach(function(s){try{s()}catch(e){console.error(e)}})}
  function delay(v){return new Promise(function(res,rej){if(M.hang)return; if(M.fail){var f=M.fail;return setTimeout(function(){rej({code:f,message:"mock fail"})},50)} setTimeout(function(){res(v)},30)})}
  function snapOf(path){var d=store[path];return {id:path.split("/").pop(),exists:!!d,data:function(){return clone(d)},metadata:{fromCache:false,hasPendingWrites:false}}}
  function docRef(path){return {id:path.split("/").pop(),path:path,
    get:function(){M.calls.push("get "+path);return delay(snapOf(path))},
    set:function(d){M.calls.push("set "+path);if(M.hang)return new Promise(function(){});if(M.fail)return delay();store[path]=clone(d);M.writes++;notify();return delay()},
    update:function(d){M.calls.push("update "+path);if(M.hang)return new Promise(function(){});if(M.fail)return delay();if(!store[path])return Promise.reject({code:"invalid_argument",message:"missing"});merge(store[path],d);M.writes++;notify();return delay()},
    onSnapshot:function(next,err){var last=null;function fire(){var s=JSON.stringify(store[path]||null);if(s===last)return;last=s;next(snapOf(path))}subs.push(fire);setTimeout(fire,40);return function(){var i=subs.indexOf(fire);if(i>=0)subs.splice(i,1)}}}}
  function query(col,filters){return {where:function(f,op,v){return query(col,filters.concat([[f,op,v]]))},orderBy:function(){return this},limit:function(){return this},
    get:function(){return delay(qs(col,filters))},
    onSnapshot:function(next){var last=null;function fire(){var q=qs(col,filters),s=JSON.stringify(q.docs.map(function(d){return [d.id,d.data()]}));if(s===last)return;last=s;next(q)}subs.push(fire);setTimeout(fire,40);return function(){}}}}
  function qs(col,filters){var docs=Object.keys(store).filter(function(p){var s=p.split("/");return s.length===2&&s[0]===col}).sort().map(function(p){return snapOf(p)}).filter(function(sn){var d=sn.data();return filters.every(function(f){var v=d[f[0]];return f[1]===">="?v>=f[2]:f[1]==="=="?v===f[2]:true})});return {docs:docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false}}}
  var db={doc:docRef,collection:function(c){var q=query(c,[]);q.doc=function(id){return docRef(c+"/"+id)};return q}};
  window.claude={use:function(n){return Promise.resolve(n==="db"?db:n==="user"?{id:function(){return Promise.resolve("u_test")}}:n==="downloads"?{save:function(){return Promise.resolve({})}}:n==="sample"?window.__SAMPLE||null:null)}};
})();
