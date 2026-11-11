const assert = require('node:assert/strict');
const test = require('node:test');
const {reportData,speedSeries} = require('./report-data');
const {createPDF} = require('./pdf');

const now = Date.parse('2026-01-02T12:00:00Z');
const config = {download_mbps:100, upload_mbps:20, threshold_percent:80, interval_minutes:30};
const row = (minutes, down) => ({timestamp:new Date(now - minutes * 60000).toISOString(),
    download_mbps:down, upload_mbps:20, idle_latency_ms:8, server_id:123});

test('records failed attempts without assigning zero speeds or outage duration', () => {
    const report = reportData({measurements:[row(60,40),row(20,100),row(1500,100)],
        collector:{config,events:[{epoch:now/1000-55*60,outcome:'failed',reason:'degradation_followup'}]}},1,now);
    assert.equal(report.selected.length,3);
    assert.equal(report.counts.cn,1);
    assert.equal(report.counts.sp,1);
    assert.equal(report.completed.length,2);
    assert.equal(report.selected[1].down,undefined);
    assert.equal(report.incidents[0].recovered,now-20*60000);
    assert.ok(report.counts.na > 0);
});

test('dedicated A4 document paginates a long appendix', () => {
    const report = reportData({measurements:Array.from({length:96},(_,i)=>row(i*30,100)),collector:{config,events:[]}},7,now);
    const pdf = createPDF(report,true);
    assert.ok(pdf.getNumberOfPages()>4);
    assert.equal(Math.round(pdf.internal.pageSize.getWidth()),210);
    assert.equal(pdf.output().slice(0,5),'%PDF-');
});

test('chart series keeps gaps and failures empty instead of bridging them', () => {
    const report = reportData({measurements:[row(30,60),row(35,100),row(300,100)],
        collector:{config:{...config,interval_minutes:120},events:[{epoch:now/1000-9*3600,outcome:'failed',reason:'scheduled'}]}},1,now);
    const series = speedSeries(report,'down');
    assert.equal(series.slotMinutes,120);
    assert.equal(series.plan,100);
    const filled = series.values.map((v,i)=>[v,series.states[i],series.counts[i]]).filter(([v,,n])=>n);
    assert.deepEqual(filled,[[null,'cn',1],[100,'ok',1],[80,'sp',2]]);
    assert.ok(series.values.filter(v=>v===null).length >= 9);
    assert.equal(series.measured,2);
    assert.equal(series.isolated,2);
    assert.equal(report.latest.time,now-30*60000);
    assert.equal(report.latestDone.down,60);
    const narrow = reportData({measurements:[row(3000,90)],collector:{config,events:[]}},1,now);
    assert.equal(narrow.selected.length,0);
    assert.equal(narrow.latestDone.down,90);
    const month = speedSeries(reportData({measurements:[],collector:{config:{...config,interval_minutes:15},events:[]}},30,now),'up');
    assert.equal(month.slotMinutes,240);
    assert.ok(month.values.every(v=>v===null));
});

test('data-use illustration follows frequency, hours, pause and adaptive choice', () => {
    const {usageEstimate} = require('./report-data');
    assert.deepEqual(usageEstimate({enabled:true,adaptive:false,interval_minutes:120,start_hour:0,end_hour:24}),{tests:12,gbDay:6,gbMonth:180,extras:0,extrasGb:0});
    assert.deepEqual(usageEstimate({enabled:true,adaptive:true,interval_minutes:30,start_hour:8,end_hour:20}),{tests:24,gbDay:12,gbMonth:360,extras:24,extrasGb:12});
    assert.equal(usageEstimate({enabled:false,adaptive:true,interval_minutes:15,start_hour:0,end_hour:24}).tests,0);
});
