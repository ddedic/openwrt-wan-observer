const css = require('./view.css');
const {reportData,quantile,labels,stamp} = require('./report-data');
const {createPDF} = require('./pdf');
const endpoint = '/cgi-bin/wan-observer';

function headers() {
    const sid = typeof window.$getCookie === 'function' && window.$getCookie('Admin-Token');
    if (typeof sid !== 'string' || !/^[A-Za-z0-9]{32}$/.test(sid)) throw Error('Sign in to the router to load WAN Observer.');
    return {'X-GL-Admin-Token':sid};
}
async function api(signal, patch) {
    const options = { headers:headers(),credentials:'same-origin',cache:'no-store',signal };
    if (patch) {
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(patch);
    }
    const response = await fetch(endpoint,options);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Router request failed.');
    return data;
}
function element(tag, name, content) {
    const node = document.createElement(tag);
    if (name) node.className = name;
    if (content != null) node.textContent = content;
    return node;
}
function downloadCsv(report) {
    const rows = [['timestamp_utc','result','reason','download_mbps','upload_mbps','idle_latency_ms','server_id']];
    for(const t of report.selected) rows.push([new Date(t.time).toISOString(),labels[t.state],t.reason,t.down,t.up,t.latency,t.server]);
    const content = rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
    const link = element('a');link.href=url;link.download='wan-observer-measurements.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const markup = `
<div class="app">
<header><h1>WAN Observer</h1><span class="pill" id="status" role="status">Loading…</span><button class="ic" id="refresh">Refresh</button><button class="ic" id="exports" disabled>Export</button><button class="ic" id="settings" disabled>Settings</button></header>
<div class="card head"><b id="headline">Reading router history…</b><span class="mut" id="summary"></span></div>
<div class="tabs" id="period" aria-label="Reporting period"><button data-days="1">24 hours</button><button class="on" data-days="7">7 days</button><button data-days="30">30 days</button></div>
<div class="card"><div class="mut" id="grid-label"></div><div class="grid" id="grid"></div><div class="leg"><span><i class="ok"></i>Passed</span><span><i class="sp"></i>Slow</span><span><i class="cn"></i>Test failed</span><span><i class="na"></i>Not measured</span></div><p class="mut" id="cell-detail" role="status"></p></div>
<div class="card"><b>Speed vs your plan</b><div id="bars"></div><div class="mut">Marker = median · band = 10th–90th percentile · white line = plan</div></div>
<div class="card"><b>Problems</b> <span class="mut">Newest first · expand for evidence</span><div id="incidents"></div></div>
<p class="mut" id="foot"></p>
<div class="sheet" id="settings-sheet"><div class="pane" role="dialog" aria-modal="true" aria-label="Testing settings"><b>Testing settings</b><form id="form">
<label class="fr">Collection <input id="enabled" type="checkbox"></label>
<label class="fr">Test every <select id="interval"><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 hour</option><option value="120">2 hours</option></select></label>
<label class="fr">Start hour (UTC) <input id="start" type="number" min="0" max="23" required></label>
<label class="fr">End hour (UTC) <input id="end" type="number" min="1" max="24" required></label>
<p class="mut">Use 0–24 for all day.</p>
<label class="fr"><span>Adaptive follow-ups<br><span class="mut">Every 5 min, up to 3 per burst and 24 extras per UTC day.</span></span><input id="adaptive" type="checkbox"></label>
<details><summary>Plan and bandwidth use</summary><p class="mut" id="baseline"></p><p class="mut" id="budget"></p></details>
<p class="mut" id="save-status" role="status"></p><button class="ic" type="button" id="cancel">Cancel</button> <button class="ic" id="save" type="submit">Save schedule</button>
</form></div></div>
<div class="sheet" id="export-sheet"><div class="pane" role="dialog" aria-modal="true" aria-label="Export report"><b>Export report</b><p class="mut" id="export-range"></p><label><input type="checkbox" id="appendix"> Include detailed test appendix</label><p><button class="ic" id="pdf">Download PDF</button> <button class="ic" id="csv">Download CSV</button> <button class="ic" id="export-close">Close</button></p><p class="mut" id="export-status" role="status"></p></div></div>
</div>`;

function mount(host) {
    const root = host.attachShadow({mode:'open'});
    root.append(element('style','',css));
    const template = element('template');
    template.innerHTML = markup;
    root.append(template.content.cloneNode(true));
    const get = id=>root.getElementById(id);
    let data, report, days=7, loading=false, disposed=false;
    const abort = new AbortController();
    let activeSheet, trigger;
    function close() {
        if (!activeSheet) return;
        activeSheet.classList.remove('on');activeSheet=null;trigger.focus();
    }
    function open(id, from) {
        trigger=get(from);activeSheet=get(id);activeSheet.classList.add('on');
        activeSheet.querySelector('input,button').focus();
    }
    root.addEventListener('keydown',event=>{
        if(event.key==='Escape')close();
        if(event.key==='Tab' && activeSheet){
            const controls=[...activeSheet.querySelectorAll('button:not(:disabled), input, select, summary')];
            if(event.shiftKey && root.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
            if(!event.shiftKey && root.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}
        }
    });
    function render() {
        if(!data) return;
        report=reportData(data,days);
        const c=report.config;
        get('status').textContent=c.enabled ? `Collecting · every ${c.interval_minutes} min` : 'Paused';
        get('headline').textContent=report.headline;
        get('headline').parentElement.style.borderLeftColor=`var(--${report.counts.cn?'cn':report.counts.sp?'sp':report.selected.length?'ok':'na'})`;
        get('summary').textContent=`${report.selected.length} recorded tests · ${stamp(report.start)} to ${stamp(report.now)}`;
        get('grid-label').textContent=`UTC · each cell covers ${days===30?'2 hours':'30 minutes'} · dot indicates a follow-up`;
        get('grid').replaceChildren();get('cell-detail').textContent='';
        for(const row of report.rows){
            const line=element('div','row');
            const date=element('span','mut',new Date(row.day).toISOString().slice(5,10));
            const cells=element('div','cells');cells.style.gridTemplateColumns=`repeat(${row.cells.length},minmax(0,1fr))`;
            for(const cell of row.cells){
                const title=`${stamp(cell.time)} · ${labels[cell.state]}`;
                const mark=element(cell.samples.length?'button':'span',`c ${cell.state}${cell.followup?' f':''}`);
                mark.title=title;
                if(cell.samples.length){
                    mark.type='button';mark.setAttribute('aria-label',title);
                    mark.onclick=()=>{get('cell-detail').textContent=cell.samples.map(t=>`${stamp(t.time)} · ${labels[t.state]}${t.down==null?'':` · ${t.down.toFixed(1)} down / ${t.up.toFixed(1)} up Mbps`}`).join(' | ');};
                }
                cells.append(mark);
            }
            line.append(date,cells);get('grid').append(line);
        }
        get('bars').replaceChildren();
        for(const [key,name,plan] of [['down','Download',c.download_mbps],['up','Upload',c.upload_mbps]]){
            const values=report.completed.map(test=>test[key]);
            const median=quantile(values,.5), lo=quantile(values,.1), hi=quantile(values,.9);
            const bar=element('div','bar',`${name} `);
            bar.append(element('span','mut',median==null?`No completed tests · ${plan} Mbps plan`:`Median ${median.toFixed(1)} / ${plan} Mbps (${Math.round(median/plan*100)}%)`));
            const track=element('div','track');const pct=v=>v/Math.max(plan*1.2,hi||0)*100;
            if(median!=null){const band=element('span','band');band.style.left=`${pct(lo)}%`;band.style.width=`${pct(hi)-pct(lo)}%`;const med=element('span','med');med.style.left=`${pct(median)}%`;track.append(band,med);}
            const ref=element('span','plan');ref.style.left=`${pct(plan)}%`;track.append(ref);bar.append(track);get('bars').append(bar);
        }
        get('incidents').replaceChildren();
        for(const episode of report.incidents){
            const panel=element('details','inc');const first=episode.tests[0];
            const summary=element('summary','t');summary.append(element('i',`k ${episode.tests.some(t=>t.state==='cn')?'cn':'sp'}`),element('span','',`${stamp(first.time)} · ${episode.tests.length} slow or failed ${episode.tests.length===1?'test':'tests'}`));
            panel.append(summary,element('div','mut',episode.recovered?`Later passing test at ${stamp(episode.recovered)}`:'No later passing test recorded for this group'));
            const table=element('table');const head=table.insertRow();
            for(const title of ['Time','Result','Down / up Mbps','Idle ms','Server'])head.append(element('th','',title));
            for(const t of episode.tests){const row=table.insertRow();for(const value of [stamp(t.time),labels[t.state],t.down==null?'—':`${t.down.toFixed(1)} / ${t.up.toFixed(1)}`,t.latency??'—',t.server??'—'])row.insertCell().textContent=value;}
            panel.append(table);get('incidents').append(panel);
        }
        if(!report.incidents.length)get('incidents').append(element('p','mut','No slow or failed tests recorded in this period.'));
        get('foot').textContent=`Current comparison: below ${c.threshold_percent}% of either plan speed. Grey slots have no retained measurement. Test failures have an unknown cause.`;
        get('exports').disabled=false;get('settings').disabled=false;
    }
    async function refresh() {
        if(loading)return;
        loading=true;get('refresh').disabled=true;
        try{data=await api(abort.signal);if(!disposed)render();}
        catch(error){if(!disposed){get('status').textContent='History unavailable';get('headline').textContent=error.message;get('exports').disabled=true;get('settings').disabled=true;}}
        finally{loading=false;get('refresh').disabled=false;}
    }
    get('refresh').onclick=refresh;
    get('period').onclick=event=>{const button=event.target.closest('button[data-days]');if(!button)return;days=Number(button.dataset.days);for(const tab of get('period').children)tab.classList.toggle('on',tab===button);render();};
    get('settings').onclick=()=>{
        const c=data.collector.config;
        get('enabled').checked=c.enabled;get('adaptive').checked=c.adaptive;get('interval').value=c.interval_minutes;
        get('start').value=c.start_hour;get('end').value=c.end_hour;get('save-status').textContent='';
        get('baseline').textContent=`Configured plan: ${c.download_mbps}/${c.upload_mbps} Mbps · adaptive threshold ${c.threshold_percent}%.`;
        get('budget').textContent='Full speed tests compete with normal traffic. At 500 MB per test, a 30-minute schedule uses about 24 GB/day before follow-ups.';
        open('settings-sheet','settings');
    };
    get('cancel').onclick=close;
    get('form').onsubmit=async event=>{
        event.preventDefault();
        const patch={enabled:get('enabled').checked,adaptive:get('adaptive').checked,interval_minutes:Number(get('interval').value),start_hour:Number(get('start').value),end_hour:Number(get('end').value)};
        if(patch.start_hour>=patch.end_hour){get('save-status').textContent='End hour must be later than start hour.';return;}
        get('save').disabled=true;
        try{await api(abort.signal,patch);await refresh();close();}
        catch(error){get('save-status').textContent=error.message;}
        finally{get('save').disabled=false;}
    };
    get('exports').onclick=()=>{get('export-range').textContent=`${stamp(report.start)} to ${stamp(report.now)}`;get('export-status').textContent='';open('export-sheet','exports');};
    get('export-close').onclick=close;
    get('csv').onclick=()=>downloadCsv(report);
    get('pdf').onclick=()=>{try{createPDF(report,get('appendix').checked).save('wan-quality-report.pdf');}catch(error){get('export-status').textContent='PDF generation failed. Try again or download CSV.';}};
    refresh();
    return ()=>{disposed=true;abort.abort();};
}

// SDK4 evaluates the CommonJS bundle and mounts its exported Vue component.
module.exports = {
    name:'wan-observer',
    render(create){return create('div');},
    mounted(){this.disposeWanObserver=mount(this.$el);},
    beforeDestroy(){if(this.disposeWanObserver)this.disposeWanObserver();},
};
