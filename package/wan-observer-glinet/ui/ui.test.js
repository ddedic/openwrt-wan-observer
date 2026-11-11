const assert=require('node:assert/strict');
const test=require('node:test');
const vmModule=require('node:vm');
const fs=require('node:fs');
const {createRequire}=require('node:module');
const {reportData}=require('./report-data');
const {speedGeometry,niceAxis,chartItems}=require('./chart');
const {timeModel}=require('./time');

const now=Date.parse('2026-11-11T09:40:00Z');
const config={enabled:true,adaptive:false,interval_minutes:120,start_hour:0,end_hour:24,download_mbps:400,upload_mbps:40,threshold_percent:80,
    monthly_budget_bytes:0,quality_history_enabled:false,window_timezone:'UTC'};
const rec=(min,down,extra={})=>({timestamp:new Date(now-min*60000).toISOString(),download_mbps:down,upload_mbps:41,idle_latency_ms:8,...extra});
const fail=(min,code='timeout')=>({epoch:(now-min*60000)/1000,reason:'scheduled',outcome:'failed',failure_code:code});

function harness(fetcher,payload){
    const timers=new Map(),listeners=new Map();let id=0;
    const document={hidden:false,getElementById:()=>true,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),activeElement:null};
    const context={require:p=>p==='./view.css'?'':createRequire(__filename)(p),module:{exports:{}},AbortController,Date:class extends Date{static now(){return now;}constructor(...a){super(...(a.length?a:[now]));}},
        Intl,fetch:fetcher,window:{$getCookie:()=>'a'.repeat(32)},document,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:n=>timers.delete(n),setInterval:()=>++id,clearInterval:()=>{}};
    vmModule.runInNewContext(fs.readFileSync(__dirname+'/index.js','utf8'),context);
    const component=context.module.exports,vm={...component.data(),$el:{},$options:{components:{}},...component.methods};
    for(const k of Object.keys(component.methods))vm[k]=component.methods[k].bind(vm);
    for(const [k,fn] of Object.entries(component.computed))Object.defineProperty(vm,k,{configurable:true,get:()=>fn.call(vm)});
    component.created.call(vm);
    if(payload)vm.payload=payload;
    // Minimal virtual DOM: keeps attrs so links and ARIA can be asserted.
    const h=(tag,data,children)=>{if(children===undefined&&(Array.isArray(data)||typeof data!=='object'||data===null))return {tag,data:{},children:data};return {tag,data:data||{},children};};
    const render=()=>component.render.call(vm,h);
    const text=node=>node==null||node===false?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.children):String(node);
    const find=(node,pred,out=[])=>{if(Array.isArray(node))node.forEach(n=>find(n,pred,out));else if(node&&typeof node==='object'){if(pred(node))out.push(node);find(node.children,pred,out);}return out;};
    return {vm,component,timers,render,text:()=>text(render()),find:pred=>find(render(),pred)};
}
const base=(over={})=>({collector:{config:{...config,...over.config},events:over.events||[],busy:false,usage:over.usage},measurements:over.measurements||[],
    quality:over.quality||{status:{state:'disabled',source_freshness:'unknown'},series:null},readiness:{status:'ready',router_timezone:{zonename:'Europe/Berlin'},...over.readiness}});

test('sparse history uses a time-proportional axis from the first record and breaks lines at failures',()=>{
    const r=reportData({measurements:[rec(600,420),rec(480,410),rec(240,236),rec(120,415)],collector:{config,events:[fail(360)]}},7,now);
    const g=speedGeometry(r,'down',{width:600,first:r.first});
    assert.equal(g.start,now-600*60000);
    const xs=g.points.map(p=>p.x);
    assert.ok(Math.abs((xs[1]-xs[0])-(xs[3]-xs[2]))<0.01,'equal time gaps map to equal distances');
    assert.equal(g.rail.length,1);
    assert.deepEqual(g.segments.map(s=>s.length),[2,2],'failure between results splits the line');
    assert.equal(g.points.find(p=>p.value===236).state,'sp');
    assert.equal(chartItems(g).length,5);
});
test('dense history is capped at 400 marks while keeping every slow and failed test counted',()=>{
    const measurements=[],events=[];
    for(let i=0;i<2880;i++){if(i%97===13)events.push(fail(i*15));else measurements.push(rec(i*15,i%97===40?200:405));}
    const r=reportData({measurements,collector:{config:{...config,interval_minutes:15},events}},30,now);
    for(const width of [340,1400]){
        const g=speedGeometry(r,'down',{width,first:r.first});
        assert.ok(g.aggregated&&g.points.length<=400&&g.rail.length<=400);
        assert.equal(g.points.reduce((n,p)=>n+p.n,0),r.completed.length);
        assert.equal(g.points.reduce((n,p)=>n+p.slow,0),r.counts.sp);
        assert.equal(g.rail.reduce((n,p)=>n+p.n,0),r.counts.cn);
        assert.ok(g.points.filter(p=>p.slow).every(p=>p.state==='sp'));
    }
    assert.deepEqual(niceAxis(460),{max:500,ticks:[0,100,200,300,400,500]});
    assert.equal(niceAxis(46).max,50);
});
test('router time needs a valid IANA zone; otherwise times stay UTC',()=>{
    const berlin=timeModel({readiness:{router_timezone:{zonename:'Europe/Berlin'}},collector:{router_timezone:{label:'CET',utc_offset:'+0100'}}});
    assert.equal(berlin.router,true);
    assert.equal(berlin.clock(Date.parse('2026-07-01T10:00:00Z')),'12:00','historical summer time applied');
    assert.equal(berlin.clock(Date.parse('2026-01-01T10:00:00Z')),'11:00');
    assert.equal(timeModel({readiness:{router_timezone:{zonename:'Europe/Berlin'}},collector:{router_timezone:{label:'router',utc_offset:null}}}).label,'CET','placeholder label falls back to Intl');
    for(const payload of [{readiness:{router_timezone:{zonename:null,posix:'CET-1CEST'}},collector:{router_timezone:{label:'CET',utc_offset:'+0100'}}},{readiness:{router_timezone:{zonename:'Not/AZone'}}},{}]){
        const t=timeModel(payload);assert.equal(t.router,false);assert.equal(t.label,'UTC');assert.equal(t.clock(Date.parse('2026-07-01T10:00:00Z')),'10:00');
    }
});
test('status separates the failed latest attempt from the last successful readings',()=>{
    const h=harness(null,base({measurements:[rec(140,422,{download_loaded_latency_ms:18,upload_loaded_latency_ms:31,idle_jitter_ms:1.1,packet_loss_percent:0})],events:[fail(40)]}));
    const text=h.text();
    assert.match(text,/Latest test failed/);assert.match(text,/Test timed out\. Retry or check the test server\./);
    assert.match(text,/Last successful test/);assert.match(text,/Wed 11 Nov, 08:20/);assert.match(text,/31/);assert.match(text,/Under load/);
    assert.match(text,/Jitter 1\.1 ms/);assert.match(text,/router time \(CET\)/);
    assert.doesNotMatch(text,/connection may|down or very slow|uptime|outage/i);
});
test('an unmodified save preserves stored settings; changed fields are sent explicitly',async()=>{
    const posts=[];const h=harness(async(url,o)=>{if(o.method==='POST')posts.push(JSON.parse(o.body));return {ok:true,json:async()=>base()};},base());
    h.vm.$nextTick=fn=>fn&&fn();h.vm.$refs={};
    h.vm.openSettings();await h.vm.save();
    assert.deepEqual(posts[0],{enabled:true,adaptive:false,interval_minutes:120,start_hour:0,end_hour:24,download_mbps:400,upload_mbps:40});
    h.vm.payload=base({config:{monthly_budget_bytes:300e9}});
    h.vm.openSettings();Object.assign(h.vm.form,{mode:'custom',start_hour:22,end_hour:6,window_timezone:'router',limit_gb:'',threshold_percent:'75',quality_history_enabled:true,interval_minutes:360});
    await h.vm.save();
    assert.deepEqual(posts[1],{enabled:true,adaptive:false,interval_minutes:360,start_hour:22,end_hour:6,download_mbps:400,upload_mbps:40,
        threshold_percent:75,quality_history_enabled:true,window_timezone:'router',monthly_budget_bytes:0});
});
test('invalid fields are reported inline with ARIA and nothing is saved',async()=>{
    let posts=0;const h=harness(async(url,o)=>{if(o.method==='POST')posts++;return {ok:true,json:async()=>base()};},base());
    h.vm.$nextTick=()=>{};h.vm.openSettings();
    Object.assign(h.vm.form,{limit_gb:'0',mode:'custom',start_hour:5,end_hour:5,download_mbps:'abc'});await h.vm.save();
    assert.equal(posts,0);
    const invalid=h.find(n=>n.tag==='input'&&n.data.attrs&&n.data.attrs['aria-invalid']==='true').map(n=>n.data.attrs.id);
    assert.ok(invalid.includes('wo-f-limit_gb')&&invalid.includes('wo-f-download_mbps'));
    const limit=h.find(n=>n.data&&n.data.attrs&&n.data.attrs.id==='wo-f-limit_gb')[0];
    assert.match(limit.data.attrs['aria-describedby'],/wo-f-limit_gb-err/);
    const text=h.text();
    assert.match(text,/Enter 1 GB or more, or leave empty for no limit\./);assert.match(text,/Start and end must differ/);assert.match(text,/3 fields need attention/);
});
test('unsaved settings are not discarded without confirmation',()=>{
    const h=harness(null,base());h.vm.$nextTick=()=>{};
    h.vm.openSettings();h.vm.form.download_mbps='500';h.vm.close();
    assert.equal(h.vm.sheet,'settings');assert.equal(h.vm.confirmDiscard,true);assert.match(h.text(),/Discard unsaved changes\?/);
    h.vm.close(true);assert.equal(h.vm.sheet,'');
    h.vm.openSettings();h.vm.close();assert.equal(h.vm.sheet,'','clean form closes directly');
});
test('footer links only to the repository with no referrer, and external links are safe',()=>{
    const h=harness(null,base());
    const links=h.find(n=>n.tag==='a');
    const footer=links.find(n=>/Source on GitHub/.test(JSON.stringify(n.children)));
    assert.deepEqual(JSON.parse(JSON.stringify(footer.data.attrs)),{href:'https://github.com/ddedic/openwrt-wan-observer',target:'_blank',rel:'noopener noreferrer',referrerpolicy:'no-referrer'});
    assert.match(h.text(),/© 2026 Danijel Dedic/);
    for(const a of links)assert.equal(a.data.attrs.rel,'noopener noreferrer');
});
test('quality card appears only when history is enabled and never claims downtime',()=>{
    const off=harness(null,base());assert.doesNotMatch(off.text(),/Connection quality/);assert.match(off.text(),/Quality history off/);
    const points=Array.from({length:180},(_,i)=>({epoch:now/1000-7*86400+i*3360,sample_count:56,valid_count:i<150?0:56,latency_median_ms:i<150?null:9+i%3,jitter_median_ms:i<150?null:1.2,loss_max_percent:i<150?null:(i===170?2:0),dns_median_ms:i<150?null:14}));
    const obs={sampled_at:now/1000-30,responsiveness:{internet_latency:9,jitter_latency:1.1,dns_lookup_latency:14},reliability:{packet_loss_percent:0}};
    const on=harness(null,base({config:{quality_history_enabled:true},quality:{status:{state:'available',source_freshness:'unknown',current_observation:obs},
        series:{source:'gl-inet-network-quality',source_freshness:'unknown',start_epoch:now/1000-7*86400,end_epoch:now/1000+1,observed_since_epoch:now/1000-30*3360,available_count:1680,points}}}));
    const text=on.text();
    assert.match(text,/Connection quality/);assert.match(text,/Source: GL Network Quality/);assert.match(text,/1680 samples/);assert.match(text,/latest snapshot 10:39/);
    assert.doesNotMatch(text,/uptime|outage|no response|down for/i);
});
test('a reached or unknown start guard blocks new starts and explains the limit',async()=>{
    let posts=0;const usage={budget_state:'reached',known_bytes:301e9,budget_bytes:300e9,unknown_attempts:0,limit_semantics:'start_guard',partial:true};
    const h=harness(async(url,o)=>{if(o.method==='POST')posts++;return {ok:true,json:async()=>base({usage})};},base({usage,measurements:[rec(30,420)]}));
    await h.vm.runSpeedtest();assert.equal(posts,0);
    const run=h.find(n=>n.tag==='button'&&/Run Speedtest/.test(JSON.stringify(n.children)))[0];assert.equal(run.data.attrs.disabled,true);
    assert.match(h.text(),/Data limit reached: new tests won't start/);assert.match(h.text(),/one running test can go over/);
    h.vm.payload=base({usage:{...usage,budget_state:'unknown',unknown_attempts:2},measurements:[rec(30,420)]});
    assert.match(h.text(),/Data use of 2 tests is unknown, so new tests won't start while a limit is set/);
});
test('unchanged CLI caps outside the entry range never block other edits; edited caps are validated',async()=>{
    for(const stored of [500000000,10001e9]){
        const posts=[];const h=harness(async(url,o)=>{if(o.method==='POST')posts.push(JSON.parse(o.body));return {ok:true,json:async()=>base({config:{monthly_budget_bytes:stored}})};},base({config:{monthly_budget_bytes:stored}}));
        h.vm.$nextTick=fn=>fn&&fn();h.vm.$refs={};
        h.vm.openSettings();assert.deepEqual(Object.keys(h.vm.fieldErrors),[]);
        h.vm.form.download_mbps='450';await h.vm.save();
        assert.equal(posts.length,1,`saved with stored cap ${stored}`);assert.equal(posts[0].download_mbps,450);assert.equal('monthly_budget_bytes' in posts[0],false,'exact stored cap preserved');
        for(const [entry,message] of [['20000',/Use a whole number up to 10000 GB\./],['0.25',/Enter 1 GB or more/]]){
            h.vm.openSettings();h.vm.form.limit_gb=entry;await h.vm.save();
            assert.equal(posts.length,1,`edited cap ${entry} rejected`);assert.match(h.text(),message);
        }
    }
});
test('quality points stay inside the plot and never before the first observation',()=>{
    const {qualityGeometry}=require('./chart');
    for(const days of [1,7,30]){
        const end=1762854000+1, step=Math.ceil(days*1440/180)*60, start=end-days*86400;
        const points=Array.from({length:180},(_,i)=>({epoch:start+i*step,sample_count:i===179?1:0,valid_count:i===179?1:0,latency_median_ms:i===179?12:null,jitter_median_ms:i===179?1:null,loss_max_percent:i===179?2:null,dns_median_ms:null}));
        const series={start_epoch:start,end_epoch:end,observed_since_epoch:end-1,available_count:1,points};
        const g=qualityGeometry(series,{width:900});
        assert.equal(g.points.length,1);
        for(const p of [...g.points,...g.rail])assert.ok(p.x>=44&&p.x<=890,`x ${p.x} within plot for ${days} days`);
        for(const p of g.rail)assert.ok(p.x0>=44&&p.x0+p.w<=890.5);
        assert.ok(g.points[0].time>=(end-1)*1000,'not placed before the first sample');
        assert.ok(g.start<g.end&&g.end-g.start>=step*1000-1);
    }
});
test('manual completion notice uses only the record with the same attempt ID, never a nearby guess',async()=>{
    const {attemptRecord}=require('./report-data');
    const a='a'.repeat(32),b='b'.repeat(32),epoch=now/1000-120;
    const at=s=>new Date((epoch+s)*1000).toISOString();
    const wrong={timestamp:at(1),download_mbps:1,upload_mbps:1,attempt_id:a},right={timestamp:at(60),download_mbps:400,upload_mbps:40,attempt_id:b};
    assert.equal(attemptRecord({epoch,attempt_id:b},[wrong,right]),right,'matching ID chosen');
    assert.equal(attemptRecord({epoch,attempt_id:b},[wrong]),null,'nearby record with another ID ignored');
    assert.equal(attemptRecord({epoch},[wrong,right]),null,'event without ID is not tied to identified records');
    assert.equal(attemptRecord({epoch},[{timestamp:at(5),download_mbps:9,upload_mbps:9},{timestamp:at(9),download_mbps:8,upload_mbps:8}]),null,'ambiguous legacy window');
    // End to end: the notice shows the matched speeds, or a generic result when unmatched.
    for(const [events,measurements,expect] of [
        [[{epoch,reason:'manual',outcome:'healthy',attempt_id:b}],[wrong,right],/good · 400 ↓ \/ 40\.0 ↑ Mbps/],
        [[{epoch,reason:'manual',outcome:'healthy'}],[wrong,right],/good · result saved/]]){
        const h=harness(async()=>({ok:true,json:async()=>base({events,measurements})}),base());
        const done=h.vm.follow(new Set());
        for(let i=0;i<5&&!h.vm.notice;i++){await new Promise(r=>setImmediate(r));const pending=[...h.timers.values()].filter(t=>t.ms===4000);h.timers.clear();pending.forEach(t=>t.fn());}
        await done;
        assert.match(h.vm.notice.text,expect);assert.doesNotMatch(h.vm.notice.text,/1\.0 ↓/);
    }
});
test('modal placement survives host CSS resets (desktop centred, mobile bottom sheet)',()=>{
    const css=fs.readFileSync(__dirname+'/view.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const rule=(sel,src=css)=>{const m=src.match(new RegExp(sel.replace(/[.[\]]/g,'\\$&')+'\\{([^}]*)\\}'));return m?m[1]:'';};
    const desktop=rule('dialog.wo-dialog');
    for(const d of ['position:fixed','inset:0','margin:auto'])assert.ok(desktop.includes(d),`desktop declares ${d}`);
    const mobile=css.slice(css.indexOf('@media (max-width:640px)'));
    const sheet=rule('dialog.wo-dialog',mobile);
    for(const d of ['inset:auto 0 0 0','margin:0'])assert.ok(sheet.includes(d),`mobile declares ${d}`);
});
test('layout containment and select styling survive host resets',()=>{
    const css=fs.readFileSync(__dirname+'/view.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const root=css.match(/\.wo\{([^}]*)\}/)[1];
    assert.match(root,/position:relative/,'visually hidden spans stay inside the page container');
    assert.match(css,/\.wo-vh\{[^}]*position:absolute/);
    const select=css.match(/\.wo-field select\{([^}]*)\}/)[1];
    for(const d of ['appearance:none','padding:0 34px 0 12px','background-repeat:no-repeat'])assert.ok(select.includes(d),`select declares ${d}`);
    assert.doesNotMatch(select,/url\(/,'no external or embedded image asset');
});

test('first load shows the brand once with busy/status semantics; loaded, error and setup states keep the head',()=>{
    const brand=h=>h.find(n=>n.tag==='svg'&&n.data.class==='wo-mark').length;
    const names=h=>(h.text().match(/WAN Observer/g)||[]).length;
    for(const components of [{},{'gl-card':{},'gl-title':{},'gl-button':{}}]){
        const h=harness(null);h.vm.$options.components=components;
        const root=h.render();
        assert.equal(root.data.attrs['aria-busy'],'true');
        assert.equal(h.find(n=>n.data.class==='wo-head').length,0,'head row withheld while loading');
        assert.equal(h.find(n=>n.tag==='gl-card'||n.tag==='gl-title').length,0,'no native card title bar or second title');
        assert.equal(brand(h),1);assert.equal(names(h),1);
        const status=h.find(n=>n.data.attrs&&n.data.attrs.role==='status');
        assert.equal(status.length,1);assert.match(JSON.stringify(status[0].children),/Loading measurement history/);
        assert.doesNotMatch(h.text(),/%|\d+ of \d+/,'no fake progress');
        assert.equal(h.find(n=>n.tag==='footer').length,1);
    }
    const err=harness(null);err.vm.error='Router request failed (502).';
    assert.equal(err.render().data.attrs,undefined,'error is not busy');
    assert.equal(err.find(n=>n.data.class==='wo-head').length,1);assert.equal(err.find(n=>n.data.class==='wo-splash').length,0);
    assert.match(err.text(),/Try again/);assert.equal(names(err),1);
    const setup=harness(null,{collector:null,measurements:[],readiness:{status:'config_missing'}});
    assert.equal(setup.find(n=>n.data.class==='wo-head').length,1);assert.equal(setup.find(n=>n.data.class==='wo-splash').length,0);
    const loaded=harness(null,base({measurements:[rec(30,420)]}));
    assert.equal(loaded.render().data.attrs,undefined);assert.equal(loaded.find(n=>n.data.class==='wo-splash').length,0);
    assert.equal(loaded.find(n=>n.data.class==='wo-head').length,1);assert.equal(brand(loaded),1);
});

test('loading dot stops under reduced motion',()=>{
    const css=fs.readFileSync(__dirname+'/view.css','utf8');
    const reduced=[...css.matchAll(/@media \(prefers-reduced-motion:reduce\)\{([^@]*)\}/g)].map(m=>m[1]).join('');
    assert.match(reduced,/\.wo-splash \.wo-mark circle\{animation:none\}/);
});
