const assert = require('node:assert/strict');
const test = require('node:test');
const {reportData} = require('./report-data');
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
