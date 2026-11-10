'use strict';
let records = [];
const el = id => document.getElementById(id);
const fields = ['timestamp','server_id','download_mbps','upload_mbps','idle_latency_ms','packet_loss_percent'];
const format = value => value == null ? 'Unknown' : typeof value === 'number' ? value.toFixed(2) : String(value);
function render() {
  el('rows').replaceChildren();
  for (const row of records) {
    const tr = document.createElement('tr');
    for (const field of fields) {
      const td = document.createElement('td');
      td.textContent = field === 'server_id' ? String(row[field] ?? 'Unknown') : format(row[field]);
      tr.append(td);
    }
    el('rows').append(tr);
  }
  const reference = Number(el('reference').value);
  const valid = Number.isFinite(reference) && reference > 0 && reference <= 100000;
  const below = valid ? records.filter(r => r.download_mbps < reference).length : null;
  el('summary').textContent = `${records.length} measurements${valid ? ` · ${below} below the selected download reference` : ' · Enter a reference from 1 to 100000 Mbps'}. Concurrent traffic and router load are not recorded yet.`;
  const ctx = el('chart').getContext('2d'), w = 1100, h = 280;
  ctx.clearRect(0,0,w,h);
  if (!records.length) return;
  const max = Math.max(1, valid ? reference : 0, ...records.map(r => r.download_mbps)) * 1.15;
  const times = records.map(r => Date.parse(r.timestamp));
  const first = times[0], span = times[times.length - 1] - first || 1;
  const x = i => 65 + (times[i] - first) / span * 1000;
  const y = speed => 240 - speed / max * 220;
  ctx.font = '14px system-ui'; ctx.fillStyle = '#374151';
  for(let i=0;i<=4;i++) { const v=max*i/4; ctx.fillText(v.toFixed(0),5,y(v)+5); ctx.strokeStyle='#e5e7eb';ctx.beginPath();ctx.moveTo(60,y(v));ctx.lineTo(1080,y(v));ctx.stroke(); }
  if(valid){ctx.strokeStyle='#7c3aed';ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(60,y(reference));ctx.lineTo(1080,y(reference));ctx.stroke();ctx.setLineDash([]);}
  ctx.strokeStyle='#185da8';ctx.beginPath();records.forEach((r,i)=>i ? ctx.lineTo(x(i),y(r.download_mbps)) : ctx.moveTo(x(i),y(r.download_mbps)));ctx.stroke();
  records.forEach((r,i)=>{ctx.fillStyle='#185da8';ctx.beginPath();ctx.arc(x(i),y(r.download_mbps),4,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle='#374151';ctx.fillText(records[0].timestamp,65,270);ctx.textAlign='right';ctx.fillText(records[records.length-1].timestamp,1065,270);ctx.textAlign='left';
}
async function refresh() {
  el('refresh').disabled = true;
  try {
    const response = await fetch('/api/measurements', {cache:'no-store'});
    if(!response.ok) throw new Error('History unavailable');
    const data = await response.json();
    records = data.measurements.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
    el('source').textContent = data.source === 'synthetic' ? 'SYNTHETIC DEMO — not your connection measurements' : 'LOCAL IMPORTED HISTORY — snapshot, not live monitoring';
    el('export').disabled = !records.length;
    render();
  } catch(error) {
    records = []; render(); el('source').textContent = 'Unable to load history. Check the local server.'; el('export').disabled=true;
  } finally {el('refresh').disabled=false;}
}
el('refresh').addEventListener('click',refresh);
el('reference').addEventListener('input',render);
el('export').addEventListener('click',()=>{
  const quote = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  const csv = [fields, ...records.map(r=>fields.map(f=>r[f]))].map(r=>r.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const a=document.createElement('a');a.href=url;a.download='wan-observer-preview.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
refresh();
