const css = require('./view.css');
const {csvContent,reportData,quantile,labels,names,reasons,stamp,clock,day,mbps,usageEstimate,exampleMbPerTest,speedSeries} = require('./report-data');
const {createPDF} = require('./pdf');
const endpoint = '/cgi-bin/wan-observer';
const pollMs = 4000, pollLimit = 45; // bounded wait: 3 minutes covers the 130 s collector cap

function headers() {
    const sid = typeof window.$getCookie === 'function' && window.$getCookie('Admin-Token');
    if (typeof sid !== 'string' || !/^[A-Za-z0-9]{32}$/.test(sid)) throw Error('Sign in to the router to load WAN Observer.');
    return {'X-GL-Admin-Token':sid};
}
async function api(signal, body) {
    const options = { headers:headers(),credentials:'same-origin',cache:'no-store',signal };
    if (body) {
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const response = await fetch(endpoint,options);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Router request failed.');
    return data;
}
function wait(ms, signal) {
    return new Promise(resolve => { const id=setTimeout(resolve,ms); signal.addEventListener('abort',()=>{clearTimeout(id);resolve();},{once:true}); });
}
function downloadCsv(report) {
    const content = csvContent(report);
    const url = URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download='wan-observer-measurements.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const pad = n => String(n).padStart(2,'0');
const hours = c => c.start_hour===0&&c.end_hour===24 ? 'all day' : `${pad(c.start_hour)}:00–${pad(c.end_hour)}:00 UTC`;
const every = m => m>=60 ? `${m/60} ${m===60?'hour':'hours'}` : `${m} minutes`;

function renderSheet(vm, h, button) {
    const f=vm.form;
    const trap=event=>{if(event.key!=='Tab')return;const items=[...event.currentTarget.querySelectorAll('input,select,button:not(:disabled),summary')];
        if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
        else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}};
    const shell=(label,children)=>h('div',{class:'wo-sheet',on:{click:e=>{if(e.target===e.currentTarget)vm.close();}}},[
        h('div',{class:'wo-dialog',attrs:{role:'dialog','aria-modal':'true','aria-label':label},on:{keydown:trap}},[h('h3',{class:'wo-dialog-title'},label),...children])]);
    if(vm.sheet==='export') return shell('Export report',[
        h('p',{class:'wo-muted'},`${stamp(vm.report.start)} to ${stamp(vm.report.now)}`),
        h('label',{class:'wo-check'},[h('input',{attrs:{type:'checkbox'},domProps:{checked:vm.appendix},on:{change:e=>{vm.appendix=e.target.checked;}}}),'Include detailed test appendix']),
        vm.exportError?h('p',{class:'wo-error',attrs:{role:'status'}},vm.exportError):null,
        h('div',{class:'wo-dialog-actions'},[button('Close',{click:vm.close}),button('Download CSV',{click:()=>downloadCsv(vm.report)}),button('Download PDF',{type:'primary',click:vm.pdf})])]);
    const field=(label,input,hint)=>h('label',{class:'wo-field'},[h('span',[label,hint?h('small',hint):null]),input]);
    const number=(key,min,max)=>h('input',{attrs:{type:'number',min,max,step:1,inputmode:'numeric'},domProps:{value:f[key]},on:{input:e=>{f[key]=e.target.value;}}});
    const toggle=key=>h('input',{class:'wo-switch',attrs:{type:'checkbox',role:'switch'},domProps:{checked:f[key]},on:{change:e=>{f[key]=e.target.checked;}}});
    const u=vm.usage;
    return shell('Testing settings',[
        field('Scheduled tests',toggle('enabled')),
        field('Full speed test every',h('select',{on:{change:e=>{f.interval_minutes=Number(e.target.value);}}},[15,30,60,120].map(m=>h('option',{attrs:{value:String(m)},domProps:{selected:Number(f.interval_minutes)===m}},every(m))))),
        field('Start hour (UTC)',number('start_hour',0,23)),
        field('End hour (UTC)',number('end_hour',1,24),'0 to 24 = all day'),
        h('p',{class:'wo-usage',attrs:{'aria-live':'polite'}},u.tests?[h('b',`${u.tests} full tests/day ≈ ${u.gbDay} GB/day (~${u.gbMonth} GB/month)`),
            u.extras?` + up to ${u.extras} follow-ups (≈ ${u.extrasGb} GB) on bad days`:'',h('br'),`Illustration at an example ${exampleMbPerTest} MB per test; real use varies.`]
            :[h('b','No scheduled tests'),' · Run Speedtest uses data only when pressed.']),
        field('Adaptive follow-ups',toggle('adaptive'),'After a slow or failed test: up to 3, every 5 min, max 24/day'),
        h('details',{class:'wo-plan'},[h('summary','Plan speeds'),field('Plan download (Mbps)',number('download_mbps',1,100000)),field('Plan upload (Mbps)',number('upload_mbps',1,100000))]),
        vm.saveError?h('p',{class:'wo-error',attrs:{role:'status'}},vm.saveError):null,
        h('div',{class:'wo-dialog-actions'},[button('Cancel',{click:vm.close}),button('Save',{type:'primary',loading:vm.saving,click:()=>vm.save()})])]);
}

// SDK4 evaluates this CommonJS bundle and mounts the exported Vue 2 component in the admin layout.
// Native gl-* components are used when the host registers them; plain fallbacks keep the page usable otherwise.
module.exports = {
    name:'wan-observer',
    data:()=>({payload:null,error:'',days:7,loading:false,running:false,notice:null,version:0,
        showAll:false,issuesOnly:false,startedAt:0,tick:0,sheet:'',form:null,saveError:'',saving:false,appendix:false,exportError:'',accent:''}),
    computed:{
        report(){return this.payload&&this.payload.collector?reportData(this.payload,this.days):null;},
        config(){return this.payload&&this.payload.collector&&this.payload.collector.config;},
        busy(){return !!(this.payload&&this.payload.collector&&this.payload.collector.busy);},
        usage(){return this.form&&usageEstimate({...this.form,interval_minutes:Number(this.form.interval_minutes),start_hour:Number(this.form.start_hour),end_hour:Number(this.form.end_hour)});},
    },
    created(){this.abort=new AbortController();},
    mounted(){
        if(!document.getElementById('wan-observer-style')){const style=document.createElement('style');style.id='wan-observer-style';style.textContent=css;document.head.append(style);}
        this.accent=getComputedStyle(this.$el).getPropertyValue('--primary').trim()||'#3b6cf0';
        this.keys=event=>{if(event.key==='Escape'&&this.sheet)this.close();};
        document.addEventListener('keydown',this.keys);
        this.visibility=()=>{if(!document.hidden)this.backgroundRefresh();};
        document.addEventListener('visibilitychange',this.visibility);
        this.refreshTimer=setInterval(this.backgroundRefresh,30000);
        this.refresh();
    },
    beforeDestroy(){clearInterval(this.refreshTimer);document.removeEventListener('visibilitychange',this.visibility);clearInterval(this.timer);this.disposed=true;this.abort.abort();document.removeEventListener('keydown',this.keys);},
    methods:{
        native(name){return !!(this.$options.components&&this.$options.components[name]);},
        backgroundRefresh(){
            if(this.disposed||document.hidden||this.running||this.saving)return;
            return this.refresh();
        },
        refresh(){
            if(this.disposed)return Promise.resolve();
            if(this.refreshRequest)return this.refreshRequest;
            if(this.running)return Promise.resolve();
            this.loading=true;
            this.refreshRequest=(async()=>{
                try{
                    const payload=await api(this.abort.signal);
                    if(this.disposed)return;
                    this.payload=payload;this.version++;
                    this.error=payload.collector?'':'WAN Observer setup required: configuration is missing or invalid. See the installation guide.';
                    if(payload.collector&&payload.collector.manual_started&&!this.running)this.follow(null);
                }
                catch(error){if(!this.disposed)this.error=error.message;}
                finally{this.loading=false;this.refreshRequest=null;}
            })();
            return this.refreshRequest;
        },
        async runSpeedtest(){
            if(this.running||!this.payload||!this.payload.collector||this.busy)return;
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
            this.running=true;this.notice=null;this.startedAt=Date.now();this.tick=this.startedAt;
            clearInterval(this.timer);this.timer=setInterval(()=>{this.tick=Date.now();},1000);
            let event, data=this.payload;
            for(let i=0;i<pollLimit&&!this.disposed;i++){
                await wait(pollMs,this.abort.signal);
                if(this.disposed)return;
                try{const next=await api(this.abort.signal);if(this.disposed)return;if(!next.collector)continue;data=next;}catch(error){continue;}
                if(data.collector.busy)continue;
                event=data.collector.events.filter(e=>e.reason==='manual'&&!(known||new Set()).has(e.epoch)).at(-1);
                break;
            }
            clearInterval(this.timer);
            this.payload=data;this.version++;this.running=false;
            if(!event){this.notice=data.collector.busy?{kind:'info',text:'The test is taking longer than expected. Refresh in a minute.'}:{kind:'error',text:'The test ended without a recorded result.'};return;}
            if(event.outcome==='failed'){this.notice={kind:'error',text:`Speed test failed at ${clock(event.epoch*1000)} UTC. No speed was recorded; the cause is unknown.`};return;}
            const match=data.measurements.find(m=>{const t=Date.parse(m.timestamp);return t>=event.epoch*1000&&t<=event.epoch*1000+130000;});
            this.notice={kind:event.outcome==='healthy'?'ok':'warn',text:`Speed test complete: ${event.outcome==='healthy'?'good':'slow'} · ${match?`${mbps(match.download_mbps)} ↓ / ${mbps(match.upload_mbps)} ↑ Mbps`:'result saved'} · ${clock(event.epoch*1000)} UTC`};
        },
        openSettings(enable){
            const c=this.config;
            this.form={enabled:enable===true?true:c.enabled,adaptive:c.adaptive,interval_minutes:c.interval_minutes,start_hour:c.start_hour,end_hour:c.end_hour,download_mbps:c.download_mbps,upload_mbps:c.upload_mbps};
            this.saveError='';this.sheet='settings';
            this.$nextTick(()=>{const first=this.$el.querySelector('.wo-dialog input,.wo-dialog select');if(first)first.focus();});
        },
        // Enabling shows the illustrative cost first; pausing saves immediately.
        toggleSchedule(value){
            if(!this.config||this.saving||this.sheet||value===this.config.enabled){this.$forceUpdate();return;}
            if(value){this.openSettings(true);this.$forceUpdate();return;}
            this.save({...this.config,enabled:false});
        },
        async save(values){
            const f=values||this.form;
            const patch={enabled:!!f.enabled,adaptive:!!f.adaptive,interval_minutes:Number(f.interval_minutes),start_hour:Number(f.start_hour),end_hour:Number(f.end_hour),download_mbps:Number(f.download_mbps),upload_mbps:Number(f.upload_mbps)};
            if(patch.start_hour>=patch.end_hour){this.saveError='End hour must be later than start hour.';return;}
            if(![patch.download_mbps,patch.upload_mbps].every(v=>Number.isInteger(v)&&v>=1&&v<=100000)){this.saveError='Plan speeds must be whole numbers from 1 to 100000 Mbps.';return;}
            this.saving=true;
            try{if(this.refreshRequest)await this.refreshRequest;if(this.disposed)return;await api(this.abort.signal,patch);await this.refresh();if(!values)this.sheet='';
                this.notice={kind:'ok',text:patch.enabled?`Settings saved · full test every ${every(patch.interval_minutes)}`:'Scheduled tests paused · Run Speedtest still works'};}
            catch(error){if(values)this.notice={kind:'error',text:error.message};else this.saveError=error.message;}
            finally{this.saving=false;}
        },
        close(){this.sheet='';},
        pdf(){try{createPDF(this.report,this.appendix).save('wan-quality-report.pdf');}catch(error){this.exportError='PDF generation failed. Try again or download CSV.';}},
    },
    render(h){
        const vm=this, r=this.report, c=this.config;
        const card=(title,children,cls)=>vm.native('gl-card')
            ? h('gl-card',{class:['wo-card',cls],props:{title}},children)
            : h('section',{class:['wo-card','wo-card--plain',cls]},[title?h('h3',{class:'wo-card-title'},title):null,...children]);
        const button=(label,{type='default',plain=false,loading=false,disabled=false,click})=>vm.native('gl-button')
            ? h('gl-button',{props:{type,plain,loading,disabled},on:{click}},label)
            : h('button',{class:['wo-btn',`is-${type}`,{'is-plain':plain}],attrs:{type:'button',disabled:disabled||loading},on:{click}},label);
        const chip=(state,text)=>h('span',{class:['wo-chip',`is-${state}`]},[h('i',{attrs:{'aria-hidden':'true'}}),text||names[state]]);
        const mark=h('svg',{class:'wo-mark',attrs:{viewBox:'4 10.5 60 40',width:45,height:30,'aria-hidden':'true',focusable:'false'}},[
            h('path',{attrs:{d:'M8 18 20 46 32 24 44 46 52 28',fill:'none',stroke:'currentColor','stroke-width':5.5,'stroke-linecap':'round','stroke-linejoin':'round'}}),
            h('circle',{attrs:{cx:57,cy:17,r:5,fill:'var(--wo-primary)'}})]);
        const title=h('div',{class:'wo-brand'},[mark,vm.native('gl-title')?h('gl-title',{props:{title:'WAN Observer'}}):h('h1',{class:'wo-h1'},'WAN Observer')]);
        const head=h('div',{class:'wo-head'},[title,h('div',{class:'wo-head-actions'},c?[
            h('label',{class:'wo-switch-label'},[h('span','Scheduled tests'),vm.native('gl-switch')
                ? h('gl-switch',{props:{value:c.enabled,disabled:vm.saving},on:{input:vm.toggleSchedule,change:vm.toggleSchedule}})
                : h('input',{class:'wo-switch',attrs:{type:'checkbox',role:'switch'},domProps:{checked:c.enabled},on:{change:e=>vm.toggleSchedule(e.target.checked)}})]),
            button('Settings',{plain:true,click:()=>vm.openSettings()}),
            button(vm.running?'Testing…':'Run Speedtest',{type:'primary',loading:vm.running,disabled:vm.busy&&!vm.running,click:vm.runSpeedtest}),
        ]:[])]);
        if(!r)return h('div',{class:'wo'},[head,card('',[h('div',{class:'wo-state'},vm.error?[h('p',{class:'wo-error'},vm.error),vm.payload&&!vm.payload.collector?h('a',{attrs:{href:'https://github.com/ddedic/openwrt-wan-observer#install-on-a-glinet-flint-2',target:'_blank',rel:'noopener noreferrer'}},'Installation guide'):null,button('Try again',{plain:true,loading:vm.loading,click:vm.refresh})]:[h('p',{class:'wo-muted'},'Loading measurement history…')])])]);

        // 1. Current status: the latest test regardless of period, with inline Run/Save feedback.
        const done=r.latestDone, latest=r.latest, u=usageEstimate(c);
        const prerequisite = {
            scheduler_stopped:'Scheduled testing is unavailable: the scheduler is not running. Start the scheduler using the installation guide.',
            scheduler_missing:'Scheduled testing is unavailable: the scheduler entry is not installed. Repair setup using the installation guide.',
            binary_missing:'Speed testing is unavailable: the Speedtest binary is not installed. Complete setup using the installation guide.',
            collector_unavailable:'Testing status is unavailable. Repair the collector using the installation guide.',
        }[vm.payload.readiness && vm.payload.readiness.status];
        const warnings = [vm.error ? 'Could not refresh. Displayed history may be stale; retry when the router is reachable.' : '', prerequisite,
            r.integrityWarning ? (r.storageIssue ? 'A storage issue prevented attempt finalization. Saved readings are retained; attempt coverage is incomplete.' : 'Attempt history was not finalized. Saved readings are retained; attempt coverage is incomplete.') : ''].filter(Boolean);
        const reading=(value,unit,label)=>h('div',{class:'wo-reading'},[h('div',{class:'wo-value'},[String(value),h('small',` ${unit}`)]),h('div',{class:'wo-label'},label)]);
        const elapsed=Math.max(0,Math.round((vm.tick-vm.startedAt)/1000));
        const status=vm.running
            ? h('div',{class:'wo-status is-info',attrs:{role:'status'}},[h('span',{class:'wo-spinner',attrs:{'aria-hidden':'true'}}),`Running speed test · ${elapsed} s · uses the full connection for about a minute`])
            : vm.busy?h('div',{class:'wo-status is-info',attrs:{role:'status'}},'A speed test is running. Results refresh automatically.'):vm.notice?h('div',{class:['wo-status',`is-${vm.notice.kind}`],attrs:{role:'status'}},vm.notice.text):null;
        const current=card('Latest test',[
            done?h('div',{class:'wo-readings'},[
                reading(mbps(done.down),'Mbps','Download'),
                reading(mbps(done.up),'Mbps','Upload'),
                reading(done.latency==null?'—':Math.round(done.latency),'ms','Idle latency'),
                h('div',{class:'wo-reading wo-latest'},[chip(latest.state),h('div',{class:'wo-label'},`${day(latest.time)}, ${clock(latest.time)} UTC${reasons[latest.reason]?` · ${reasons[latest.reason].toLowerCase()}`:''}`),
                    latest.state==='cn'&&done!==latest?h('div',{class:'wo-label'},`Readings from ${day(done.time)}, ${clock(done.time)}`):null]),
            ]):h('div',{class:'wo-state'},[h('p',latest?'The latest test failed, so there is no speed reading yet.':'No speed test recorded yet.'),h('p',{class:'wo-muted'},'Press Run Speedtest for a first reading.')]),
            status,
            warnings.length?h('div',{class:'wo-status is-warn',attrs:{role:'status'}},warnings.join(' ')):null,
            h('div',{class:'wo-schedule'},[h('span',prerequisite?'Scheduled testing needs attention':c.enabled?`Full test every ${every(c.interval_minutes)}, ${hours(c)}${c.adaptive?', with follow-ups':''}`:'Scheduled tests paused'),
                h('span',{class:'wo-muted'},prerequisite?'See the installation guide':c.enabled?`About ${u.gbDay} GB/day, assuming an example ${exampleMbPerTest} MB per test`:'No scheduled data use')]),
        ],'wo-current');

        // 2. History: one period selector governs the summary, both charts, the test list and Export.
        const periodName=vm.days===1?'24 hours':`${vm.days} days`;
        const periods=h('div',{class:'wo-periods',attrs:{role:'group','aria-label':'History period'}},[[1,'24 hours'],[7,'7 days'],[30,'30 days']].map(([d,label])=>
            h('button',{class:{'is-on':vm.days===d},attrs:{type:'button','aria-pressed':String(vm.days===d)},on:{click:()=>{vm.days=d;vm.showAll=false;vm.version++;}}},label)));
        const toolbar=h('div',{class:'wo-toolbar'},[h('div',{class:'wo-toolbar-title'},[h('h2',{class:'wo-h2'},'History'),
            h('div',{class:'wo-counts'},r.selected.length?[h('b',`${r.selected.length} ${r.selected.length===1?'test':'tests'}`),chip('ok',`${r.counts.ok} good`),chip('sp',`${r.counts.sp} slow`),chip('cn',`${r.counts.cn} failed`)]:[h('span',{class:'wo-muted'},`No tests in the last ${periodName}`)])]),
            h('div',{class:'wo-toolbar-actions'},[periods,button('Export',{plain:true,disabled:!r.selected.length,click:()=>{vm.exportError='';vm.sheet='export';}})])]);

        const chart=(key,label)=>{
            const s=speedSeries(r,key), median=quantile(r.completed.map(t=>t[key]),.5);
            const text=s.times.map(t=>vm.days===1?clock(t):`${day(t).replace(/^\w+ /,'')} ${clock(t)}`);
            const tip={callbacks:{label:ctx=>ctx.datasetIndex===1?`Plan ${s.plan} Mbps`:ctx.raw==null?'':`${mbps(ctx.raw)} Mbps · ${names[s.states[ctx.dataIndex]]}${s.counts[ctx.dataIndex]>1?` · median of ${s.counts[ctx.dataIndex]}`:''}`}};
            const few=r.completed.slice(-4).reverse();
            const drawn=s.measured-s.isolated>=2&&vm.native('gl-line-chart');
            // Too few connected points for a trend line: show the readings themselves instead of an empty or misleading chart.
            const body=!s.measured?h('div',{class:'wo-state'},[h('p','No completed tests in this period.'),h('p',{class:'wo-muted'},'Choose a longer period or run a test.')])
                : s.measured-s.isolated<2||!vm.native('gl-line-chart')
                ? h('div',{class:'wo-few'},[h('p',{class:'wo-muted'},vm.native('gl-line-chart')?'Too few tests to draw a trend. Latest readings:':'Chart unavailable on this firmware. Latest readings:'),
                    h('ul',few.map(t=>h('li',[h('span',`${day(t.time)}, ${clock(t.time)}`),chip(t.state,`${mbps(t[key])} Mbps`)])))])
                : h('gl-line-chart',{key:`${key}-${vm.version}`,props:{labels:text,values:[s.values,s.values.map(()=>s.plan)],datasetLabels:[`${label} (Mbps)`,'Plan (Mbps)'],
                    borderColor:[vm.accent,'#a9adbd'],backgroundColor:['transparent','transparent'],borderWidth:2,fill:false,height:200,
                    x:{display:true,ticks:{maxTicksLimit:vm.days===1?7:6,maxRotation:0,autoSkip:true}},
                    y:{display:true,min:0,suggestedMax:Math.ceil(s.plan*1.15),ticks:{maxTicksLimit:5},title:{display:true,text:'Mbps'}},
                    plugins:{legend:{display:false},tooltip:tip}}});
            return card(label,[
                h('div',{class:'wo-chart-head'},[h('div',{class:'wo-value is-small'},median==null?'—':[mbps(median),h('small',' Mbps median')]),
                    h('div',{class:'wo-label'},median==null?`Plan ${s.plan} Mbps`:`${Math.round(median/s.plan*100)}% of ${s.plan} Mbps plan`)]),
                h('div',{class:['wo-chart',{'is-chart':drawn}]},[body]),
                drawn&&h('div',{class:'wo-chart-foot'},[h('span',{class:'wo-key'},[h('i',{style:{background:vm.accent}}),'Measured']),h('span',{class:'wo-key'},[h('i',{class:'is-plan'}),'Plan']),
                    h('span',{class:'wo-muted'},s.isolated&&s.measured-s.isolated>=2?`${s.isolated} single ${s.isolated===1?'test':'tests'} not drawn · see list`:'Gaps mean no completed measurement')]),
            ],'wo-chart-card');
        };

        const pool=[...r.selected].reverse().filter(t=>!vm.issuesOnly||t.state!=='ok'), shown=vm.showAll?pool:pool.slice(0,5);
        const table=h('table',{class:'wo-table'},[h('thead',[h('tr',['Time (UTC)','Result','Download','Upload','Latency','Type'].map(x=>h('th',x)))]),
            h('tbody',shown.map(t=>h('tr',{key:t.time+t.state},[h('td',`${day(t.time)}, ${clock(t.time)}`),h('td',[chip(t.state)]),
                h('td',t.down==null?'—':`${mbps(t.down)} Mbps`),h('td',t.up==null?'—':`${mbps(t.up)} Mbps`),
                h('td',t.latency==null?'—':`${Math.round(t.latency)} ms`),h('td',{class:'wo-muted'},reasons[t.reason]||'—')])))]);
        const tests=card(`Tests in the last ${periodName}`,[
            h('div',{class:'wo-list-tools'},[h('label',{class:'wo-check'},[h('input',{attrs:{type:'checkbox'},domProps:{checked:vm.issuesOnly},on:{change:e=>{vm.issuesOnly=e.target.checked;vm.showAll=false;}}}),'Slow and failed only'])]),
            pool.length?h('div',{class:['wo-table-wrap',{'is-all':vm.showAll}]},[table]):h('div',{class:'wo-state'},[h('p',vm.issuesOnly?'No slow or failed tests in this period.':'No tests in this period.')]),
            pool.length>5?h('div',{class:'wo-more'},[button(vm.showAll?'Show fewer':`Show all ${pool.length}`,{plain:true,click:()=>{vm.showAll=!vm.showAll;}})]):null,
        ],'wo-tests');

        const about=h('details',{class:'wo-about'},[h('summary','How to read these results'),h('ul',[
            h('li',`Good means download and upload reached at least ${c.threshold_percent}% of the ${c.download_mbps}/${c.upload_mbps} Mbps plan. Slow means either did not. Failed means no result was recorded; the cause is unknown.`),
            h('li','Charts connect consecutive measured slots only. Speed between tests is not measured. Empty slots can include failed attempts.'),
            h('li','Full tests use real bandwidth, so an occasional schedule is enough to show patterns. Times are UTC.'),
        ])]);

        return h('div',{class:'wo'},[head,current,h('section',{class:'wo-history',attrs:{'aria-label':'History'}},[toolbar,
            h('div',{class:'wo-pair'},[chart('down','Download'),chart('up','Upload')]),tests]),about,vm.sheet?renderSheet(vm,h,button):null]);
    },
};
