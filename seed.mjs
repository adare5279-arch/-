import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const url = 'https://mrfcwyfpkreicemwxhrv.supabase.co';
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZmN3eWZwa3JlaWNlbXd4aHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzYxMzksImV4cCI6MjA5NTk1MjEzOX0.dVmvEp32hYoydnrluwJMeJ9-RvTjVL_N5BB8pViCY0Q';
const sb = createClient(url, anon);

const d = JSON.parse(fs.readFileSync(new URL('../extracted_data.json', import.meta.url), 'utf8'));

// meetings (dedupe)
const seen = new Set();
const meetings = [];
for (const m of d.MEETINGS) { if (!seen.has(m.id)) { seen.add(m.id); meetings.push({ id: m.id, committee: m.comm, date: m.date, year: m.year }); } }

const members = [];
for (const [comm, list] of Object.entries(d.MEMBERS)) for (const m of list) members.push({ committee: comm, name: m.name, role: m.role, party: m.party, district: m.district, photo_url: m.photoUrl });

const departments = [];
for (const [comm, list] of Object.entries(d.DEPTS)) for (const dep of list) departments.push({ committee: comm, name: dep.name, url: dep.url });

async function run() {
  let r;
  r = await sb.from('meetings').upsert(meetings, { onConflict: 'id' });
  if (r.error) throw r.error; console.log('meetings ok:', meetings.length);

  // members/departments: clear then insert to avoid dups on re-run
  await sb.from('members').delete().neq('id', -1);
  r = await sb.from('members').insert(members);
  if (r.error) throw r.error; console.log('members ok:', members.length);

  await sb.from('departments').delete().neq('id', -1);
  r = await sb.from('departments').insert(departments);
  if (r.error) throw r.error; console.log('departments ok:', departments.length);
}
run().then(() => { console.log('SEED DONE'); process.exit(0); }).catch(e => { console.error('SEED ERROR', e); process.exit(1); });
