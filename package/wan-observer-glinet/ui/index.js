const css = require('./view.css');
const {csvContent,reportData,quantile,names,reasons,mbps,usageEstimate,exampleMbPerTest,measuredTestBytes,failureMessage,failureShort,attemptRecord} = require('./report-data');
const {createPDF} = require('./pdf');
const {timeModel} = require('./time');
const {speedGeometry,qualityGeometry,renderChart,chartItems} = require('./chart');
const {markGithub16} = require('./octicon');
const endpoint = '/cgi-bin/wan-observer';
const pollMs = 4000, pollLimit = 45; // bounded wait: 3 minutes covers the 130 s collector cap
const repository = 'https://github.com/ddedic/openwrt-wan-observer';
const guide = repository + '#install-on-a-glinet-flint-2';
const ooklaCli = 'https://www.speedtest.net/apps/cli';
const intervals = [15,30,60,120,180,240,360,720];

function headers() {
    const sid = typeof window.$getCookie === 'function' && window.$getCookie('Admin-Token');
    if (typeof sid !== 'string' || !/^[A-Za-z0-9]{32}$/.test(sid)) throw Error('Sign in to the router to load WAN Observer.');
    return {'X-GL-Admin-Token':sid};
}
async function api(signal, body, query = '') {
    const options = { headers:headers(),credentials:'same-origin',cache:'no-store',signal };
    if (body) {
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const response = await fetch(endpoint + query,options);
    let data;
    try { data = await response.json(); } catch (error) { throw Error(response.ok ? 'The router sent an unreadable reply. Try again.' : `Router request failed (${response.status}).`); }
    if (!response.ok) throw Error(data.error || 'Router request failed.');
    return data;
}
function wait(ms, signal) {
    return new Promise(resolve => { const id=setTimeout(resolve,ms); signal.addEventListener('abort',()=>{clearTimeout(id);resolve();},{once:true}); });
}
function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content],{type}));
    const link = document.createElement('a');link.href=url;link.download=name;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const pad = n => String(n).padStart(2,'0');
const every = m => m>=60 ? `${m/60} ${m===60?'hour':'hours'}` : `${m} minutes`;
const allDay = c => c.start_hour===0&&c.end_hour===24;
const zoneName = (c,t) => c.window_timezone==='router' ? (t.router?t.label:'router time') : 'UTC';
const hours = (c,t) => allDay(c) ? 'all day' : `${pad(c.start_hour)}:00–${pad(c.end_hour)}:00 ${zoneName(c,t)}`;
const mb = bytes => `${Math.round(bytes/1e6)} MB`;
const gb = bytes => { const v=bytes/1e9; return v>=10?String(Math.round(v)):String(+v.toFixed(1)); };
const ms = v => v==null||!Number.isFinite(v)?'—':v>=10?String(Math.round(v)):String(+v.toFixed(1));
const ago = delta => { const m=Math.round(delta/60000); return m<60?`${m} min earlier`:m<2880?`${Math.round(m/60)} ${Math.round(m/60)===1?'hour':'hours'} earlier`:`${Math.round(m/1440)} days earlier`; };
const supports = (c,key) => !!c && Object.prototype.hasOwnProperty.call(c,key);
const finite = v => typeof v==='number'&&Number.isFinite(v);
const read = (r,key) => r ? (r[key] !== undefined ? r[key] : r.checks && r.checks[key]) : undefined;

// Field rules shared by blur and Save. Messages say what to enter (WCAG 3.3.1/3.3.3).
// A cap set outside the UI's entry range (e.g. 0.5 GB via CLI) stays valid while untouched; it is
// neither re-validated nor re-sent. Only an edited entry must meet the entry rules.
function validate(f, initial = {}) {
    const errors = {};
    const whole = (v,min,max) => { const n=Number(v); return String(v).trim()!==''&&Number.isInteger(n)&&n>=min&&n<=max; };
    if (f.mode==='custom'&&Number(f.start_hour)===Number(f.end_hour)) errors.end_hour='Start and end must differ. Choose All day for 24 hours.';
    for (const key of ['download_mbps','upload_mbps']) if (!whole(f[key],1,100000)) errors[key]='Enter a whole number from 1 to 100000 Mbps.';
    if (f.threshold_percent!==undefined&&!whole(f.threshold_percent,1,100)) errors.threshold_percent='Enter a percentage from 1 to 100.';
    if (f.limit_gb!==undefined&&String(f.limit_gb).trim()!==''&&String(f.limit_gb).trim()!==String(initial.limit_gb??'').trim()) {
        const n=Number(f.limit_gb);
        if (!Number.isFinite(n)||n<1) errors.limit_gb='Enter 1 GB or more, or leave empty for no limit.';
        else if (!Number.isInteger(n)||n>10000) errors.limit_gb='Use a whole number up to 10000 GB.';
    }
    return errors;
}
const fieldOrder = ['end_hour','limit_gb','download_mbps','upload_mbps','threshold_percent'];

function renderDialog(vm, h, button, t) {
    const id = key => `wo-f-${key}`;
    const shell=(label,children,actions)=>h('dialog',{ref:'dialog',class:'wo-dialog',attrs:{'aria-labelledby':'wo-dialog-title','aria-modal':'true'},
        on:{cancel:e=>{e.preventDefault();vm.close();},keydown:e=>{
            if(e.key==='Escape'){e.preventDefault();e.stopPropagation();vm.close();return;}
            // Keep Tab inside the dialog (APG modal pattern); the native modal alone lets focus reach browser chrome.
            if(e.key!=='Tab')return;
            const items=[...e.currentTarget.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(el=>el.offsetParent!==null);
            if(!items.length)return;
            const first=items[0],last=items[items.length-1],active=document.activeElement;
            if(e.shiftKey&&(active===first||!e.currentTarget.contains(active))){e.preventDefault();last.focus();}
            else if(!e.shiftKey&&active===last){e.preventDefault();first.focus();}},
            click:e=>{if(e.target===e.currentTarget)vm.close();}}},[
        h('div',{class:'wo-dialog-box'},[h('h3',{class:'wo-dialog-title',attrs:{id:'wo-dialog-title'}},label),h('div',{class:'wo-dialog-body'},children),h('div',{class:'wo-dialog-actions'},actions)])]);
    if(vm.sheet==='export'){
        const r=vm.report, period=r.days===1?'Last 24 hours':`Last ${r.days} days`;
        return shell('Export report',[
            h('p',{class:'wo-muted'},`${period} · ${t.stamp(r.start)} – ${t.stamp(r.now)} ${t.label}`),
            r.coverage.complete?null:h('p',{class:'wo-note'},r.coverage.since?`Complete attempt history starts ${t.stamp(r.coverage.since)}. Earlier failed tests may be missing, so the report marks the period as incomplete.`:'Attempt history for this period is incomplete, so the report marks it as incomplete.'),
            h('label',{class:'wo-check wo-check--block'},[h('input',{attrs:{type:'checkbox',id:id('appendix')},domProps:{checked:vm.appendix},on:{change:e=>{vm.appendix=e.target.checked;}}}),
                h('span',[h('b','Test appendix'),h('small','Every test: server, speeds, latency idle and under load, jitter, loss, data used, failure type')])]),
            h('p',{class:'wo-muted wo-small'},`${vm.fileName()}.pdf · .csv (CSV times in UTC)`),
            vm.exportError?h('p',{class:'wo-error',attrs:{role:'alert'}},vm.exportError):null,
        ],[button('Close',{click:()=>vm.close()}),button('Download CSV',{click:()=>download(vm.fileName()+'.csv',csvContent(r),'text/csv;charset=utf-8')}),button('Download PDF',{type:'primary',click:vm.pdf})]);
    }
    const f=vm.form, c=vm.config, errors=vm.fieldErrors;
    const described=(key,hint)=>[hint?id(key)+'-hint':'',errors[key]?id(key)+'-err':''].filter(Boolean).join(' ')||null;
    const field=(key,label,control,hint)=>h('div',{class:['wo-field',{'is-invalid':!!errors[key]}]},[
        h('div',{class:'wo-field-row'},[h('div',{class:'wo-field-text'},[h('label',{attrs:{for:id(key)}},label),hint?h('small',{attrs:{id:id(key)+'-hint'}},hint):null]),control]),
        errors[key]?h('p',{class:'wo-field-error',attrs:{id:id(key)+'-err'}},errors[key]):null]);
    const blur=key=>()=>{vm.touched={...vm.touched,[key]:true};};
    const number=(key,{suffix,placeholder,hint}={})=>h('span',{class:'wo-input'},[h('input',{attrs:{id:id(key),type:'text',inputmode:'numeric',autocomplete:'off',placeholder:placeholder||null,
        'aria-invalid':errors[key]?'true':null,'aria-describedby':described(key,hint)},domProps:{value:f[key]},on:{input:e=>{f[key]=e.target.value;},blur:blur(key)}}),suffix?h('span',{class:'wo-suffix',attrs:{'aria-hidden':'true'}},suffix):null]);
    const toggle=(key,hint)=>h('input',{class:'wo-switch',attrs:{id:id(key),type:'checkbox',role:'switch','aria-describedby':described(key,hint)},domProps:{checked:!!f[key]},on:{change:e=>{f[key]=e.target.checked;}}});
    const select=(key,options,{hint,label}={})=>h('select',{attrs:{id:id(key),'aria-describedby':described(key,hint),'aria-label':label||null,'aria-invalid':errors[key]?'true':null},
        on:{change:e=>{f[key]=/^\d+$/.test(e.target.value)?Number(e.target.value):e.target.value;},blur:blur(key)}},
        options.map(([value,text])=>h('option',{attrs:{value:String(value)},domProps:{selected:String(f[key])===String(value)}},text)));
    const group=(title,children)=>h('fieldset',{class:'wo-group'},[h('legend',title),...children]);
    const hoursList=Array.from({length:24},(_,i)=>[i,`${pad(i)}:00`]);
    const overnight=f.mode==='custom'&&Number(f.start_hour)>Number(f.end_hour);
    const zones=supports(c,'window_timezone');
    const routerName=t.router?`Router time (${t.label})`:'Router time';
    const zoneHint=f.window_timezone==='router'?(t.router?t.zone:`Router zone not reported${t.offset?`; router clock is UTC${t.offset} now`:''}`):'Hours in UTC';
    const measured=measuredTestBytes(vm.payload.measurements);
    const size=measured?measured.bytes/1e6:exampleMbPerTest;
    const plan={...f,interval_minutes:Number(f.interval_minutes),start_hour:f.mode==='all'?0:Number(f.start_hour),end_hour:f.mode==='all'?24:Number(f.end_hour)};
    const u=usageEstimate(plan,size);
    const errorCount=Object.keys(errors).length;
    const segment=h('div',{class:'wo-seg',attrs:{role:'group','aria-labelledby':'wo-hours-label'}},[['all','All day'],['custom','Custom']].map(([v,label])=>
        h('button',{class:{'is-on':f.mode===v},attrs:{type:'button','aria-pressed':String(f.mode===v)},on:{click:()=>{f.mode=v;}}},label)));
    return shell('Testing settings',[
        group('Full speed tests',[
            field('enabled','Scheduled tests',toggle('enabled')),
            field('interval_minutes','Test every',select('interval_minutes',intervals.map(m=>[m,every(m)]))),
            h('div',{class:'wo-field'},[h('div',{class:'wo-field-row'},[h('div',{class:'wo-field-text'},[h('span',{attrs:{id:'wo-hours-label'}},'Testing hours')]),segment])]),
            f.mode==='custom'?field('end_hour','From – to',h('span',{class:'wo-pair-input'},[select('start_hour',hoursList,{label:'From'}),h('span',{attrs:{'aria-hidden':'true'}},'–'),
                select('end_hour',[...hoursList.slice(1),[24,'24:00']],{label:'To',hint:overnight})]),overnight?`Overnight: ends ${pad(f.end_hour)}:00 next day`:null):null,
            f.mode==='custom'&&zones?field('window_timezone','Time zone',select('window_timezone',[['router',routerName],['UTC','UTC']],{hint:zoneHint}),zoneHint):null,
        ]),
        group('Data use',[
            h('div',{class:'wo-field'},[h('div',{class:'wo-field-row'},[h('div',{class:'wo-field-text'},[h('span','Data per test')]),
                h('span',{class:'wo-readout'},measured?[mb(measured.bytes),h('small',`measured, last ${measured.tests} ${measured.tests===1?'test':'tests'}`)]:[h('span','Not measured yet'),h('small',`example ${exampleMbPerTest} MB`)])])]),
            h('p',{class:'wo-usage',attrs:{'aria-live':'polite'}},u.tests?[h('b',`${u.tests} tests/day ≈ ${u.gbDay} GB/day · ≈ ${u.gbMonth} GB/month`),measured?' at the measured size':` at an example ${exampleMbPerTest} MB per test`,
                u.extras?` · follow-ups can add up to ${u.extras} tests a day`:'']:[h('b','No scheduled tests'),' · Run Speedtest uses data only when pressed']),
            supports(c,'monthly_budget_bytes')?field('limit_gb','Monthly data limit',number('limit_gb',{suffix:'GB',placeholder:'No limit',hint:true}),'Leave empty for no limit. Stops new tests once known use reaches it; one test can go over.'):null,
            field('adaptive','Follow-up tests',toggle('adaptive',true),'After a slow or failed test: up to 3, 5 min apart, max 24 a day'),
        ]),
        supports(c,'quality_history_enabled')?group('Quality history',[
            field('quality_history_enabled','Quality history',toggle('quality_history_enabled',true),'Records GL Network Quality locally every minute · kept 30 days · no extra WAN tests'),
            h('p',{class:'wo-muted wo-small'},"Shows latency, jitter and loss. It can't see a slowdown that affects only speed."),
        ]):null,
        group('Plan',[
            field('download_mbps','Plan download',number('download_mbps',{suffix:'Mbps'})),
            field('upload_mbps','Plan upload',number('upload_mbps',{suffix:'Mbps'})),
            supports(c,'threshold_percent')?field('threshold_percent','Slow below',number('threshold_percent',{suffix:'% of plan'})):null,
        ]),
    ],[
        vm.confirmDiscard?h('p',{class:'wo-dialog-message',attrs:{role:'alert'}},'Discard unsaved changes?')
            :errorCount&&vm.submitted?h('p',{class:'wo-dialog-message is-error',attrs:{role:'alert'}},`${errorCount} ${errorCount===1?'field needs':'fields need'} attention`)
            :vm.saveError?h('p',{class:'wo-dialog-message is-error',attrs:{role:'alert'}},vm.saveError):null,
        ...(vm.confirmDiscard?[button('Keep editing',{click:()=>{vm.confirmDiscard=false;}}),button('Discard',{type:'primary',click:()=>vm.close(true)})]
            :[button('Cancel',{click:()=>vm.close()}),button('Save',{type:'primary',loading:vm.saving,click:()=>vm.save()})]),
    ]);
}

// SDK4 evaluates this CommonJS bundle and mounts the exported Vue 2 component in the admin layout.
// Native gl-* components are used when the host registers them; plain fallbacks keep the page usable otherwise.
module.exports = {
    name:'wan-observer',
    data:()=>({payload:null,error:'',days:7,loading:false,running:false,notice:null,version:0,
        showAll:false,issuesOnly:false,startedAt:0,tick:0,sheet:'',form:null,saveError:'',saving:false,appendix:false,exportError:'',
        touched:{},submitted:false,confirmDiscard:false,focusTarget:'',initialForm:'',active:{down:-1,up:-1,quality:-1},widths:{}}),
    computed:{
        report(){return this.payload&&this.payload.collector?reportData(this.payload,this.days):null;},
        config(){return this.payload&&this.payload.collector&&this.payload.collector.config;},
        busy(){return !!(this.payload&&this.payload.collector&&this.payload.collector.busy);},
        time(){return timeModel(this.payload);},
        // A configured limit with reached or unknown accounting stops every new start in the collector.
        guarded(){const u=this.payload&&this.payload.collector&&this.payload.collector.usage;return !!u&&(u.budget_state==='reached'||u.budget_state==='unknown');},
        fieldErrors(){if(!this.form)return {};const all=validate(this.form,JSON.parse(this.initialForm||'{}'));return Object.fromEntries(Object.entries(all).filter(([k])=>this.submitted||this.touched[k]||(k==='end_hour'&&this.touched.start_hour)));},
        dirty(){return !!this.form&&JSON.stringify(this.form)!==this.initialForm;},
    },
    watch:{
        sheet(value){
            if(!value)return;
            this.$nextTick(()=>{
                const dialog=this.$refs.dialog;if(!dialog)return;
                if(!dialog.open){try{dialog.showModal();}catch(error){dialog.setAttribute('open','');}}
                const target=this.focusTarget&&dialog.querySelector('#wo-f-'+this.focusTarget);
                const first=target||dialog.querySelector('input:not([disabled]),select,button:not([disabled])');
                if(first)first.focus();
            });
        },
    },
    created(){this.abort=new AbortController();},
    mounted(){
        if(!document.getElementById('wan-observer-style')){const style=document.createElement('style');style.id='wan-observer-style';style.textContent=css;document.head.append(style);}
        this.visibility=()=>{if(!document.hidden)this.backgroundRefresh();};
        document.addEventListener('visibilitychange',this.visibility);
        this.refreshTimer=setInterval(this.backgroundRefresh,30000);
        if(typeof ResizeObserver==='function')this.resize=new ResizeObserver(entries=>{
            const next={...this.widths};let changed=false;
            for(const entry of entries){const key=entry.target.dataset.chart,w=Math.floor(entry.contentRect.width);if(key&&w>0&&Math.abs((next[key]||0)-w)>2){next[key]=w;changed=true;}}
            if(changed)this.widths=next;
        });
        this.refresh();
    },
    updated(){
        if(!this.resize||!this.$el||!this.$el.querySelectorAll)return;
        for(const box of this.$el.querySelectorAll('[data-chart]'))if(!box.woObserved){box.woObserved=true;this.resize.observe(box);}
    },
    beforeDestroy(){clearTimeout(this.busyRetry);clearInterval(this.refreshTimer);document.removeEventListener('visibilitychange',this.visibility);clearInterval(this.timer);if(this.resize)this.resize.disconnect();this.disposed=true;this.abort.abort();},
    methods:{
        native(name){return !!(this.$options.components&&this.$options.components[name]);},
        fileName(){const r=this.report;return `wan-observer-${r.days===1?'24h':r.days+'d'}-${this.time.ymd(r.now)}`;},
        backgroundRefresh(){
            if(this.disposed||document.hidden||this.running||this.saving)return;
            return this.refresh();
        },
        refresh(){
            if(this.disposed)return Promise.resolve();
            if(this.refreshRequest)return this.refreshRequest;
            if(this.running)return Promise.resolve();
            clearTimeout(this.busyRetry);this.busyRetry=null;
            let retryBusy=false;
            this.loading=true;
            this.refreshRequest=(async()=>{
                try{
                    const payload=await api(this.abort.signal,null,`?period=${this.days}`);
                    if(this.disposed)return;
                    this.payload=payload;this.version++;
                    this.busyRefreshCount=payload.collector&&payload.collector.busy?(this.busyRefreshCount||0)+1:0;
                    retryBusy=!!(payload.collector&&payload.collector.busy);
                    this.error=payload.collector?'':'WAN Observer setup required: configuration is missing or invalid. See the installation guide.';
                    if(payload.collector&&payload.collector.manual_started&&!this.running)this.follow(null);
                }
                catch(error){if(!this.disposed)this.error=error.message;}
                finally{
                    this.loading=false;this.refreshRequest=null;
                    if(retryBusy&&!this.disposed&&!this.running&&!document.hidden&&this.busyRefreshCount<pollLimit){
                        this.busyRetry=setTimeout(()=>{clearTimeout(this.busyRetry);this.busyRetry=null;this.backgroundRefresh();},pollMs);
                    }
                }
            })();
            return this.refreshRequest;
        },
        setPeriod(days){
            if(days===this.days)return;
            this.days=days;this.showAll=false;this.active={down:-1,up:-1,quality:-1};this.version++;
            // Quality series are period-specific; read again once any in-flight read settles.
            (this.refreshRequest||Promise.resolve()).then(()=>this.backgroundRefresh());
        },
        async runSpeedtest(){
            if(this.running||!this.payload||!this.payload.collector||this.busy||this.guarded)return;
            if(this.refreshRequest)await this.refreshRequest;
            if(this.disposed||this.running||!this.payload||!this.payload.collector||this.busy)return;
            const known=new Set(this.payload.collector.events.filter(e=>e.reason==='manual').map(e=>e.epoch));
            this.running=true;this.notice={kind:'info',text:'Starting speed test…'};
            try{await api(this.abort.signal,{action:'run_speedtest'});}
            catch(error){this.running=false;this.notice={kind:'error',text:error.message};return;}
            this.follow(known);
        },
        async follow(known){
            if(this.refreshRequest)await this.refreshRequest;
            if(this.disposed)return;
            const started=this.payload&&this.payload.collector&&this.payload.collector.manual_started;
            this.running=true;this.notice=null;
            // Resume the elapsed count of a test started before this page loaded.
            this.startedAt=finite(started)&&started>1e9&&started*1000<=Date.now()?started*1000:Date.now();this.tick=Date.now();
            clearInterval(this.timer);this.timer=setInterval(()=>{this.tick=Date.now();},1000);
            let event, data=this.payload;
            for(let i=0;i<pollLimit&&!this.disposed;i++){
                await wait(pollMs,this.abort.signal);
                if(this.disposed)return;
                try{const next=await api(this.abort.signal,null,`?period=${this.days}`);if(this.disposed)return;if(!next.collector)continue;data=next;}catch(error){continue;}
                if(data.collector.busy)continue;
                event=data.collector.events.filter(e=>e.reason==='manual'&&!(known||new Set()).has(e.epoch)).at(-1);
                break;
            }
            clearInterval(this.timer);
            this.payload=data;this.version++;this.running=false;
            const t=this.time;
            if(!event){this.notice=data.collector.busy?{kind:'info',text:'The test is taking longer than expected. Refresh in a minute.'}:{kind:'error',text:'The test ended without a recorded result.'};return;}
            if(event.outcome==='failed'){this.notice={kind:'error',text:`Speed test failed · ${t.clock(event.epoch*1000)} · ${failureMessage(event.failure_code)}`};return;}
            const match=attemptRecord(event,data.measurements);
            this.notice={kind:event.outcome==='healthy'?'ok':'warn',text:`Speed test complete: ${event.outcome==='healthy'?'good':'slow'} · ${match?`${mbps(match.download_mbps)} ↓ / ${mbps(match.upload_mbps)} ↑ Mbps`:'result saved'} · ${t.clock(event.epoch*1000)}`};
        },
        openSettings(enable,focus){
            const c=this.config;if(!c)return;
            const budget=finite(c.monthly_budget_bytes)&&c.monthly_budget_bytes>0?c.monthly_budget_bytes:0;
            this.form={enabled:enable===true?true:c.enabled,adaptive:c.adaptive,interval_minutes:c.interval_minutes,mode:allDay(c)?'all':'custom',
                start_hour:allDay(c)?8:c.start_hour,end_hour:allDay(c)?20:c.end_hour,download_mbps:String(c.download_mbps),upload_mbps:String(c.upload_mbps),
                ...(supports(c,'threshold_percent')?{threshold_percent:String(c.threshold_percent)}:{}),
                // An all-day schedule has no time basis yet, so a new custom window defaults to router time when the zone is known;
                // an existing custom UTC window keeps UTC unless the user changes it.
                ...(supports(c,'window_timezone')?{window_timezone:c.window_timezone==='router'||(allDay(c)&&this.time.router)?'router':'UTC'}:{}),
                ...(supports(c,'monthly_budget_bytes')?{limit_gb:budget?gb(budget):''}:{}),
                ...(supports(c,'quality_history_enabled')?{quality_history_enabled:!!c.quality_history_enabled}:{})};
            this.initialForm=JSON.stringify(this.form);
            this.touched={};this.submitted=false;this.confirmDiscard=false;this.saveError='';this.focusTarget=focus||'';
            this.opener=typeof document!=='undefined'?document.activeElement:null;
            this.sheet='settings';
        },
        openExport(){this.exportError='';this.focusTarget='';this.opener=document.activeElement;this.sheet='export';},
        // Enabling shows the data use first; pausing saves immediately.
        toggleSchedule(value){
            if(!this.config||this.saving||this.sheet||value===this.config.enabled){this.$forceUpdate();return;}
            if(value){this.openSettings(true);this.$forceUpdate();return;}
            this.save({...this.config,enabled:false});
        },
        // Builds the POST body. Optional fields are sent only when the user changed them, so an
        // unmodified save preserves the stored time basis, cap, threshold and quality choice.
        patch(f){
            const c=this.config||{}, form=f===this.form;
            const start=form&&f.mode==='all'?0:Number(f.start_hour), end=form&&f.mode==='all'?24:Number(f.end_hour);
            const body={enabled:!!f.enabled,adaptive:!!f.adaptive,interval_minutes:Number(f.interval_minutes),start_hour:start,end_hour:end,download_mbps:Number(f.download_mbps),upload_mbps:Number(f.upload_mbps)};
            if(!form)return body;
            const initial=JSON.parse(this.initialForm||'{}');
            if(f.threshold_percent!==undefined&&String(f.threshold_percent).trim()!==initial.threshold_percent)body.threshold_percent=Number(f.threshold_percent);
            if(f.quality_history_enabled!==undefined&&f.quality_history_enabled!==initial.quality_history_enabled)body.quality_history_enabled=f.quality_history_enabled;
            // The time basis is only sent when chosen for a custom window; a legacy UTC window never switches silently.
            if(f.window_timezone!==undefined&&f.mode==='custom'&&f.window_timezone!==(c.window_timezone==='router'?'router':'UTC'))body.window_timezone=f.window_timezone;
            if(f.limit_gb!==undefined&&String(f.limit_gb).trim()!==String(initial.limit_gb).trim())body.monthly_budget_bytes=String(f.limit_gb).trim()===''?0:Number(f.limit_gb)*1e9;
            return body;
        },
        async save(values){
            const f=values||this.form;
            if(!values){
                this.submitted=true;this.saveError='';
                const errors=validate(f,JSON.parse(this.initialForm||'{}')), first=fieldOrder.find(k=>errors[k]);
                if(first){if(this.$nextTick)this.$nextTick(()=>{const el=this.$refs.dialog&&this.$refs.dialog.querySelector('#wo-f-'+first);if(el)el.focus();});return;}
            }
            const patch=this.patch(f);
            if(patch.start_hour===patch.end_hour){this.saveError='Start and end must differ.';return;}
            if(![patch.download_mbps,patch.upload_mbps].every(v=>Number.isInteger(v)&&v>=1&&v<=100000)){this.saveError='Plan speeds must be whole numbers from 1 to 100000 Mbps.';return;}
            this.saving=true;
            try{if(this.refreshRequest)await this.refreshRequest;if(this.disposed)return;await api(this.abort.signal,patch);await this.refresh();if(!values)this.close(true);
                this.notice={kind:'ok',text:patch.enabled?`Settings saved · full test every ${every(patch.interval_minutes)}`:'Scheduled tests paused · Run Speedtest still works'};}
            catch(error){if(values)this.notice={kind:'error',text:error.message};else this.saveError=error.message;}
            finally{this.saving=false;}
        },
        // Unsaved settings are never discarded by Escape, Cancel or a backdrop click without confirmation.
        close(force){
            if(this.sheet==='settings'&&!force&&this.dirty){this.confirmDiscard=true;return;}
            const dialog=this.$refs&&this.$refs.dialog;
            if(dialog&&dialog.open&&dialog.close)dialog.close();
            this.sheet='';this.confirmDiscard=false;
            const opener=this.opener;this.opener=null;
            if(opener&&opener.focus&&this.$nextTick)this.$nextTick(()=>{if(opener.isConnected!==false)opener.focus();});
        },
        pdf(){try{createPDF(this.report,this.appendix).save(this.fileName()+'.pdf');}catch(error){this.exportError='PDF generation failed. Try again or download CSV.';}},
        pick(key,index){this.active={...this.active,[key]:index};},
    },
    render(h){
        const vm=this, r=this.report, c=this.config, t=this.time, readiness=vm.payload&&vm.payload.readiness||{};
        const card=(title,children,cls)=>vm.native('gl-card')
            ? h('gl-card',{class:['wo-card',cls],props:{title}},children)
            : h('section',{class:['wo-card','wo-card--plain',cls]},[title?h('h3',{class:'wo-card-title'},title):null,h('div',{class:'wo-card-body'},children)]);
        const button=(label,{type='default',plain=false,loading=false,disabled=false,click,size})=>vm.native('gl-button')
            ? h('gl-button',{class:{'wo-gl-small':size==='small'},props:{type,plain,loading,disabled},on:{click}},label)
            : h('button',{class:['wo-btn',`is-${type}`,{'is-plain':plain,'is-small':size==='small'}],attrs:{type:'button',disabled:disabled||loading},on:{click}},label);
        const chip=(state,text)=>h('span',{class:['wo-chip',`is-${state}`]},[h('i',{attrs:{'aria-hidden':'true'}}),text||names[state]]);
        const link=(href,text)=>h('a',{class:'wo-link',attrs:{href,target:'_blank',rel:'noopener noreferrer',referrerpolicy:'no-referrer'}},[text,h('span',{class:'wo-vh'},' (opens in new tab)')]);
        const mark=h('svg',{class:'wo-mark',attrs:{viewBox:'4 10.5 60 40',width:45,height:30,'aria-hidden':'true',focusable:'false'}},[
            h('path',{attrs:{d:'M8 18 20 46 32 24 44 46 52 28',fill:'none',stroke:'currentColor','stroke-width':5.5,'stroke-linecap':'round','stroke-linejoin':'round'}}),
            h('circle',{attrs:{cx:57,cy:17,r:5,fill:'var(--wo-primary)'}})]);
        const footer=h('footer',{class:'wo-foot'},[h('span','© 2026 Danijel Dedic'),h('span',{attrs:{'aria-hidden':'true'}},'·'),
            h('a',{attrs:{href:repository,target:'_blank',rel:'noopener noreferrer',referrerpolicy:'no-referrer'}},[
                h('svg',{attrs:{width:16,height:16,viewBox:'0 0 16 16',fill:'currentColor','aria-hidden':'true',focusable:'false'}},[h('path',{attrs:{d:markGithub16}})]),
                'Source on GitHub',h('span',{class:'wo-vh'},' (opens in new tab)')])]);
        const title=h('div',{class:'wo-brand'},[mark,vm.native('gl-title')?h('gl-title',{props:{title:'WAN Observer'}}):h('h1',{class:'wo-h1'},'WAN Observer')]);
        const head=h('div',{class:'wo-head'},[title,h('div',{class:'wo-head-actions'},c?[
            h('label',{class:'wo-switch-label'},[h('span','Scheduled tests'),vm.native('gl-switch')
                ? h('gl-switch',{props:{value:c.enabled,disabled:vm.saving},on:{input:vm.toggleSchedule,change:vm.toggleSchedule}})
                : h('input',{class:'wo-switch',attrs:{type:'checkbox',role:'switch'},domProps:{checked:c.enabled},on:{change:e=>vm.toggleSchedule(e.target.checked)}})]),
            button('Settings',{plain:true,click:()=>vm.openSettings()}),
            button(vm.running?'Testing…':'Run Speedtest',{type:'primary',loading:vm.running,disabled:(vm.busy||vm.guarded)&&!vm.running,click:vm.runSpeedtest}),
        ]:[])]);
        const step=(state,label,detail,action)=>h('li',{class:['wo-step',`is-${state}`]},[h('span',{class:'wo-step-icon',attrs:{'aria-hidden':'true'}}),
            h('div',{class:'wo-step-text'},[h('b',label),h('span',{class:'wo-vh'},state==='ok'?' (ready)':state==='bad'?' (needs attention)':' (not checked)'),detail?h('small',[detail]):null]),action||null]);
        const checks=readiness.checks||{};
        const engine=read(readiness,'engine_available'), clockOk=read(readiness,'clock_initialized'), storage=read(readiness,'free_storage_kb');
        const found=checks.binary==='available'||engine===true, missing=checks.binary==='unavailable'||engine===false;
        const baseSteps=()=>[
            checks.config?step(checks.config==='valid'?'ok':'bad','Configuration',checks.config==='valid'?'Valid':checks.config==='invalid'?'Present but invalid':'Not created yet'):null,
            step(found?'ok':missing?'bad':'unknown','Speedtest program',found?'Found at the configured path':missing?'Not found at the configured path. Install the Ookla CLI as described in the guide.':'Checked once the configuration is valid'),
            checks.scheduler?step(checks.scheduler==='installed'&&checks.scheduler_service!=='stopped'?'ok':'bad','Scheduler',
                checks.scheduler!=='installed'?'Cron entry not installed':checks.scheduler_service==='stopped'?'Cron service is not running':checks.scheduler_service==='running'?'Cron entry installed and running':'Cron entry installed'):null,
            typeof clockOk==='boolean'?step(clockOk?'ok':'bad','Router clock',clockOk?'Set':'Not set yet. Test times would be wrong.'):null,
            finite(storage)?step(storage>=1024?'ok':'bad','Storage',storage>=1024?`${Math.round(storage/1024)} MB free`:`Low: ${Math.round(storage)} KB free`):null,
            step('unknown','Ookla licence',h('span',["Not checked here. Ookla's CLI asks you to accept its terms; see ",link(ooklaCli,'Ookla CLI'),'.'])),
        ].filter(Boolean);

        if(!r){
            if(vm.payload&&!vm.payload.collector)return h('div',{class:'wo'},[head,card('Set up WAN Observer',[
                h('p',{class:'wo-muted'},'The collector configuration is missing or invalid, so nothing can be tested yet. Follow the installation guide, then check again.'),
                h('ul',{class:'wo-steps'},baseSteps()),
                h('div',{class:'wo-actions'},[link(guide,'Installation guide'),button('Check again',{plain:true,loading:vm.loading,click:vm.refresh})]),
            ],'wo-setup'),footer]);
            if(vm.error)return h('div',{class:'wo'},[head,card('',[h('div',{class:'wo-state'},[h('p',{class:'wo-error'},vm.error),button('Try again',{plain:true,loading:vm.loading,click:vm.refresh})])]),footer]);
            // First load: the brand appears once, centred, and the head row waits for data. A scoped card is used
            // instead of gl-card because an untitled native card's header rendering is not verified.
            return h('div',{class:'wo',attrs:{'aria-busy':'true'}},[h('section',{class:['wo-card','wo-card--plain']},[h('div',{class:'wo-splash'},[mark,
                h('p',{class:'wo-splash-name'},'WAN Observer'),h('p',{class:'wo-splash-text',attrs:{role:'status'}},'Loading measurement history…')])]),footer]);
        }

        // 1. Status: the latest attempt, then the latest successful readings, labelled separately.
        const done=r.latestDone, latest=r.latest;
        const usage=vm.payload.collector.usage;
        const measured=measuredTestBytes(vm.payload.measurements);
        const prerequisite = {
            scheduler_stopped:'Scheduled testing is unavailable: the scheduler is not running. Start the scheduler using the installation guide.',
            scheduler_missing:'Scheduled testing is unavailable: the scheduler entry is not installed. Repair setup using the installation guide.',
            binary_missing:'Speed testing is unavailable: the Speedtest binary is not installed. Complete setup using the installation guide.',
            collector_unavailable:'Testing status is unavailable. Repair the collector using the installation guide.',
            clock_uninitialized:"Scheduled testing is unavailable: the router clock is not set yet, so test times would be wrong. Check the router's time settings; see the installation guide.",
        }[readiness.status];
        const guard = usage&&usage.budget_state==='reached'?"Data limit reached: new tests won't start until next month, or until you raise or clear the limit in Settings."
            : usage&&usage.budget_state==='unknown'?`Data use of ${usage.unknown_attempts||'some'} ${usage.unknown_attempts===1?'test':'tests'} is unknown, so new tests won't start while a limit is set. Clear the limit in Settings to keep testing.`:'';
        const warnings = [vm.error ? 'Could not refresh. Displayed history may be stale; retry when the router is reachable.' : '', prerequisite,
            r.integrityWarning ? (r.storageIssue ? 'A storage issue prevented attempt finalization. Saved readings are retained; attempt coverage is incomplete.' : 'Attempt history was not finalized. Saved readings are retained; attempt coverage is incomplete.') : '', guard].filter(Boolean);
        const elapsed=Math.max(0,Math.round((vm.tick-vm.startedAt)/1000));
        const status=vm.running
            ? h('div',{class:'wo-status is-info',attrs:{role:'status'}},[h('span',{class:'wo-spinner',attrs:{'aria-hidden':'true'}}),`Running speed test · ${elapsed} s · uses the full connection for about a minute`])
            : vm.busy?h('div',{class:'wo-status is-info',attrs:{role:'status'}},'Please wait. Results refresh automatically.'):vm.notice?h('div',{class:['wo-status',`is-${vm.notice.kind}`],attrs:{role:'status'}},vm.notice.text):null;
        const when=test=>`${t.stamp(test.time)}${reasons[test.reason]?` · ${reasons[test.reason]}`:''}`;
        const slowDetail=test=>[['down','Download',c.download_mbps],['up','Upload',c.upload_mbps]].filter(([k,,plan])=>test[k]<plan*c.threshold_percent/100)
            .map(([k,name,plan])=>`${name} ${mbps(test[k])} of ${plan} Mbps (${Math.round(test[k]/plan*100)}%)`).join(' · ');
        const attempt=latest?h('div',{class:['wo-attempt',`is-${latest.state}`]},[
            chip(latest.state,h('b',latest.state==='cn'?'Latest test failed':latest.state==='sp'?'Latest test slow':'Latest test good')),
            h('span',{class:'wo-attempt-text'},[when(latest),latest.state==='cn'?` · ${failureMessage(latest.failureCode)}`:latest.state==='sp'?` · ${slowDetail(latest)}`:'']),
            latest.state==='cn'?button('Run again',{plain:true,size:'small',disabled:vm.busy||vm.running||vm.guarded,click:vm.runSpeedtest}):null]):null;
        const loaded=done?[done.loadedDown,done.loadedUp].filter(finite):[];
        const reading=(value,unit,label)=>h('div',{class:'wo-reading'},[h('div',{class:'wo-value'},[String(value),h('small',` ${unit}`)]),h('div',{class:'wo-label'},label)]);
        const detail=done?[finite(done.jitter)?`Jitter ${ms(done.jitter)} ms`:'',finite(done.loss)?`Packet loss ${+done.loss.toFixed(1)}%`:'',
            Number.isSafeInteger(done.downloadBytes)&&Number.isSafeInteger(done.uploadBytes)?`${mb(done.downloadBytes+done.uploadBytes)} used`:''].filter(Boolean):[];
        const qOn=supports(c,'quality_history_enabled')&&c.quality_history_enabled===true;
        const quality=vm.payload.quality||{}, qs=quality.status||{}, obs=qs.current_observation||qs.latest_observation;
        const metric=(label,value,unit)=>finite(value)?h('span',[label+' ',h('b',`${ms(value)}${unit}`)]):null;
        const qualityRow=!supports(c,'quality_history_enabled')?null:!qOn
            ? h('div',{class:'wo-qnow'},[h('span',{class:'wo-muted'},'Quality history off'),h('button',{class:'wo-text-btn',attrs:{type:'button'},on:{click:()=>vm.openSettings(false,'quality_history_enabled')}},'Turn on')])
            : qs.state==='available'&&obs&&finite(obs.sampled_at)
            ? h('div',{class:'wo-qnow'},[h('span',{class:'wo-muted'},`GL Network Quality · latest snapshot ${t.clock(obs.sampled_at*1000)}`),
                metric('Latency',obs.responsiveness&&obs.responsiveness.internet_latency,' ms'),metric('Jitter',obs.responsiveness&&obs.responsiveness.jitter_latency,' ms'),
                metric('Loss',obs.reliability&&obs.reliability.packet_loss_percent,'%'),metric('DNS',obs.responsiveness&&obs.responsiveness.dns_lookup_latency,' ms')])
            : h('div',{class:'wo-qnow'},[h('span',{class:'wo-muted'},qs.state==='unsupported'?'GL Network Quality is not available on this firmware.'
                :qs.state==='disabled'?'GL Network Quality is off. Turn it on in the GL admin (Network Quality) to record history.'
                :qs.state==='available'?'Waiting for the first GL Network Quality snapshot.':"Couldn't read GL Network Quality. History resumes when it responds.")]);
        const perTest=measured?`${mb(measured.bytes)} per test (measured)`:c.enabled?`≈ ${usageEstimate(c).gbDay} GB/day (est. ${exampleMbPerTest} MB/test)`:'';
        const limitText=!usage||!usage.budget_state?'':usage.budget_state==='unset'?'no data limit set'
            :usage.budget_state==='available'?`${gb(usage.known_bytes||0)} of ${gb(usage.budget_bytes)} GB used${finite(usage.accounting_since_epoch)?` since ${t.date(usage.accounting_since_epoch*1000)}`:' so far'}`
            :usage.budget_state==='reached'?'data limit reached':'data use unknown';
        const dataLine=[perTest,limitText].filter(Boolean).join(' · ')||(c.enabled?'':'No scheduled data use');
        const current=card('Status',[
            attempt,
            !latest?h('div',{class:'wo-first'},[h('p',[h('b','No test recorded yet.'),c.enabled?' Scheduled tests are on; the first runs at the next interval. You can also run one now.':' Nothing runs automatically until you turn on scheduled tests. You can run one test now.']),
                h('ul',{class:'wo-steps'},[...baseSteps(),step('unknown','Plan speeds',`${c.download_mbps} / ${c.upload_mbps} Mbps · used to mark tests as slow`,button('Change',{plain:true,size:'small',click:()=>vm.openSettings(false,'download_mbps')}))])])
            : h('p',{class:'wo-last'},done?(latest!==done?['Last successful test · ',h('b',t.stamp(done.time)),` · ${ago(latest.time-done.time)}`]:['Readings from this test']):[h('b','No successful test yet.'),' Press Run Speedtest for a first reading.']),
            done?h('div',{class:'wo-readings'},[
                reading(mbps(done.down),'Mbps','Download'),
                reading(mbps(done.up),'Mbps','Upload'),
                reading(done.latency==null?'—':ms(done.latency),'ms','Idle latency'),
                reading(loaded.length?ms(Math.max(...loaded)):'—','ms','Under load'),
            ]):null,
            detail.length?h('p',{class:'wo-detail'},detail.join(' · ')):null,
            qualityRow,
            status,
            warnings.length?h('div',{class:'wo-status is-warn',attrs:{role:'status'}},warnings.join(' ')):null,
            h('div',{class:'wo-schedule'},[h('span',prerequisite?'Scheduled testing needs attention':c.enabled?`Full test every ${every(c.interval_minutes)}, ${hours(c,t)}${c.adaptive?', with follow-ups':''}`:'Scheduled tests paused'),
                h('span',{class:'wo-muted'},prerequisite?[link(guide,'Installation guide')]:dataLine)]),
        ],'wo-current');

        // 2. History: one period selector governs the summary, charts, the test list and Export.
        const periodName=vm.days===1?'24 hours':`${vm.days} days`;
        const periods=h('div',{class:'wo-periods',attrs:{role:'group','aria-label':'History period'}},[[1,'24 hours'],[7,'7 days'],[30,'30 days']].map(([d,label])=>
            h('button',{class:{'is-on':vm.days===d},attrs:{type:'button','aria-pressed':String(vm.days===d)},on:{click:()=>vm.setPeriod(d)}},label)));
        const counts=[['ok','good'],['sp','slow'],['cn','failed']].filter(([k])=>r.counts[k]).map(([k,w])=>chip(k,`${r.counts[k]} ${w}`));
        const toolbar=h('div',{class:'wo-toolbar'},[h('div',{class:'wo-toolbar-title'},[h('h2',{class:'wo-h2'},'History'),
            h('div',{class:'wo-counts'},r.selected.length?[h('b',`${r.selected.length} ${r.selected.length===1?'test':'tests'}`),...counts]:[h('span',{class:'wo-muted'},`No tests in the last ${periodName}`)])]),
            h('div',{class:'wo-toolbar-actions'},[periods,button('Export',{plain:true,disabled:!r.selected.length,click:vm.openExport})])]);
        const caption=h('p',{class:'wo-since'},`${r.first&&r.first>r.start?`Recorded since ${t.stamp(r.first)} · `:''}Times are ${t.router?`router time (${t.label})`:'UTC'}`);
        const axis={x:time=>vm.days===1?t.clock(time):`${t.date(time)} ${t.clock(time)}`,y:v=>String(Math.round(v))};
        const key=(cls,text)=>h('span',{class:'wo-key'},[h('i',{class:cls,attrs:{'aria-hidden':'true'}}),text]);
        const detailLine=(kind,item)=>h('p',{class:'wo-chart-detail',attrs:{'aria-live':'polite'}},item?(kind==='quality'
            ? `${t.stamp(item.time)} · median latency ${ms(item.value)} ms${finite(item.jitter)?` · jitter ${ms(item.jitter)} ms`:''}${finite(item.loss)?` · loss up to ${+item.loss.toFixed(1)}%`:''} · ${item.n} ${item.n===1?'sample':'samples'}`
            : item.failed?`${t.stamp(item.time)} · Failed${item.n>1?` · ${item.n} tests`:` · ${failureShort[item.failureCode]||'no result'}`}`
            : `${t.stamp(item.time)} · ${mbps(item.value)} Mbps · ${item.n>1?`median of ${item.n} tests${item.slow?`, ${item.slow} slow (lowest ${mbps(item.low)} Mbps)`:''}`:`${names[item.state]}${reasons[item.reason]?` · ${reasons[item.reason]}`:''}`}`)
            :'');
        const chart=(k,label)=>{
            const median=quantile(r.completed.map(x=>x[k]),.5), plan=k==='down'?c.download_mbps:c.upload_mbps;
            const g=speedGeometry(r,k,{width:vm.widths[k]||560,first:r.first});
            const items=chartItems(g), active=vm.active[k];
            const body=!g.points.length&&!g.rail.length?h('div',{class:'wo-state'},[h('p','No tests in this period.'),h('p',{class:'wo-muted'},'Choose a longer period or run a test.')])
                : h('div',{class:'wo-chart',attrs:{'data-chart':k}},[renderChart(h,g,{label:`${label} per test, ${t.stamp(g.start)} to ${t.stamp(g.end)}: ${r.completed.length} completed, ${r.counts.cn} failed${median==null?'':`, median ${mbps(median)} Mbps`}. Exact values are in the test list. Use arrow keys for details.`,
                    active,format:axis,onPick:i=>vm.pick(k,i)}),detailLine('speed',items[active])]);
            return card(label,[
                h('div',{class:'wo-chart-head'},[h('div',{class:'wo-value is-small'},median==null?'—':[mbps(median),h('small',' Mbps median')]),
                    h('div',{class:'wo-label'},median==null?`Plan ${plan} Mbps`:`${Math.round(median/plan*100)}% of ${plan} Mbps plan`)]),
                body,
                h('div',{class:'wo-chart-foot'},[key('is-dot','Test'),key('is-sq','Slow'),key('is-dia','Failed'),key('is-plan','Plan'),
                    h('span',{class:'wo-muted wo-push'},g.aggregated?`Each point combines up to ${g.perPoint} tests; the list has every test`:'Lines join tests; between tests is not measured')]),
            ],'wo-chart-card');
        };
        const series=quality.series;
        const qualityCard=qOn&&series&&Array.isArray(series.points)&&series.points.length?(()=>{
            const g=qualityGeometry(series,{width:vm.widths.quality||900});
            const med=quantile(g.points.map(p=>p.value),.5), jit=quantile(g.points.map(p=>p.jitter).filter(finite),.5);
            const losses=series.points.map(p=>p.loss_max_percent).filter(finite), items=chartItems(g), active=vm.active.quality;
            return card('Connection quality',[
                h('div',{class:'wo-chart-head'},[h('div',{class:'wo-value is-small'},med==null?'—':[ms(med),h('small',' ms median latency')]),
                    h('div',{class:'wo-label'},[finite(jit)?`Jitter ${ms(jit)} ms`:'',losses.length?`Loss up to ${+Math.max(...losses).toFixed(1)}%`:'',`${series.available_count||0} samples`].filter(Boolean).join(' · '))]),
                g.points.length?h('div',{class:'wo-chart',attrs:{'data-chart':'quality'}},[renderChart(h,g,{label:`Median latency and packet loss from GL Network Quality, ${series.available_count||0} samples. Values per interval appear in the details line. Use arrow keys for details.`,
                    active,format:axis,onPick:i=>vm.pick('quality',i)}),detailLine('quality',items[active])])
                    :h('div',{class:'wo-state'},[h('p','No quality samples in this period yet.')]),
                h('div',{class:'wo-chart-foot'},[key('is-line','Latency (ms)'),key('is-loss','Packet loss'),h('span',{class:'wo-muted wo-push'},'Source: GL Network Quality · shows responsiveness, not speed')]),
            ],'wo-quality');
        })():null;

        const pool=[...r.selected].reverse().filter(x=>!vm.issuesOnly||x.state!=='ok'), shown=vm.showAll?pool:pool.slice(0,5);
        const bytes=x=>Number.isSafeInteger(x.downloadBytes)&&Number.isSafeInteger(x.uploadBytes)?mb(x.downloadBytes+x.uploadBytes):'—';
        const lat=x=>{const l=[x.loadedDown,x.loadedUp].filter(finite);return x.latency==null?'—':`${ms(x.latency)}${l.length?` / ${ms(Math.max(...l))}`:''} ms`;};
        const result=x=>[chip(x.state),x.state==='cn'?h('small',{class:'wo-sub'},failureShort[x.failureCode]||'No result'):null];
        const table=h('table',{class:'wo-table'},[h('thead',[h('tr',[`Time (${t.label})`,'Result','Download','Upload','Latency idle / load','Data','Type'].map(x=>h('th',{attrs:{scope:'col'}},x)))]),
            h('tbody',shown.map(x=>h('tr',{key:x.time+x.state},[h('td',t.stamp(x.time)),h('td',result(x)),
                h('td',x.down==null?'—':`${mbps(x.down)} Mbps`),h('td',x.up==null?'—':`${mbps(x.up)} Mbps`),
                h('td',lat(x)),h('td',bytes(x)),h('td',{class:'wo-muted'},reasons[x.reason]||'—')])))]);
        const list=h('ul',{class:'wo-list'},shown.map(x=>h('li',{key:'l'+x.time+x.state},[
            h('span',[t.stamp(x.time),h('small',[reasons[x.reason]||'Unknown type',x.state==='cn'?` · ${failureShort[x.failureCode]||'No result'}`:bytes(x)!=='—'?` · ${bytes(x)}`:''].join(''))]),
            h('span',{class:'wo-list-end'},[chip(x.state),h('small',x.down==null?'—':`${mbps(x.down)} ↓ · ${mbps(x.up)} ↑ Mbps`)])])));
        const tests=card(`Tests in the last ${periodName}`,[
            h('div',{class:'wo-list-tools'},[h('label',{class:'wo-check'},[h('input',{attrs:{type:'checkbox'},domProps:{checked:vm.issuesOnly},on:{change:e=>{vm.issuesOnly=e.target.checked;vm.showAll=false;}}}),'Slow and failed only'])]),
            pool.length?h('div',{class:['wo-table-wrap',{'is-all':vm.showAll}]},[table,list]):h('div',{class:'wo-state'},[h('p',vm.issuesOnly?'No slow or failed tests in this period.':'No tests in this period.')]),
            pool.length>5?h('div',{class:'wo-more'},[button(vm.showAll?'Show fewer':`Show all ${pool.length}`,{plain:true,click:()=>{vm.showAll=!vm.showAll;}})]):null,
        ],'wo-tests');

        const about=h('details',{class:'wo-about'},[h('summary','How to read these results'),h('ul',[
            h('li',`Good means download and upload reached at least ${c.threshold_percent}% of the ${c.download_mbps}/${c.upload_mbps} Mbps plan. Slow means either did not. Failed means no result was recorded; the message shows what was observed, not the cause.`),
            h('li','Each point is one test at its time. Lines join consecutive results; a failure or a long gap breaks the line. Speed between tests is not measured.'),
            qOn?h('li','Quality history stores the values GL Network Quality reports when WAN Observer reads them each minute. When GL last measured them is not known. It does not measure speed or downtime.'):null,
            usage&&usage.limit_semantics==='start_guard'?h('li','The data limit counts the transfer of tests since accounting began, not all router traffic. It stops new tests from starting; one running test can go over.'):null,
            h('li',`Full tests use real bandwidth, so an occasional schedule is enough to show patterns. Times are ${t.router?`router time (${t.zone})`:'UTC'}; CSV exports use UTC.`),
        ])]);

        return h('div',{class:'wo'},[head,current,h('section',{class:'wo-history',attrs:{'aria-label':'History'}},[toolbar,caption,qualityCard,
            h('div',{class:'wo-pair'},[chart('down','Download'),chart('up','Upload')]),tests]),about,footer,vm.sheet?renderDialog(vm,h,button,t):null]);
    },
};
