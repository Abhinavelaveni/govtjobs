import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, role, token, waCfg, sendNotification } from './api.js';

const useLoad = (path, deps = []) => {
  const [s, set] = useState({ d: null, e: null, l: true });
  const load = () => { set(x => ({ ...x, l: true })); api(path).then(d => set({ d, e: null, l: false })).catch(e => set({ d: null, e: e.message, l: false })); };
  useEffect(load, deps); return [s, load];
};
const Async = ({ s, children }) => s.l ? <p className="p-4 text-gray-500">Loading…</p> : s.e ? <p className="card text-red-600">{s.e}</p> : s.d?.length === 0 ? <p className="card text-gray-500">Nothing here yet.</p> : children(s.d);
const Badge = ({ t }) => <span className={'rounded-full px-2 py-0.5 text-xs ' + ({ Sent: 'bg-green-100 text-green-700', Failed: 'bg-red-100 text-red-700' }[t] || 'bg-amber-100 text-amber-700')}>{t}</span>;
const toastErr = e => alert(e.message);

function Login() {
  const nav = useNavigate(); const [m, setM] = useState('login'); const [f, setF] = useState({}); const [err, setErr] = useState('');
  const go = async () => { try { const r = await api('/auth/' + m, 'POST', f); localStorage.setItem('tok', r.token); nav('/'); } catch (e) { setErr(e.message); } };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return <div className="mx-auto mt-20 max-w-sm space-y-3 card"><h1 className="text-xl font-semibold">🔔 GovJobs Alerts</h1>
    {m === 'register' && <input className="inp" placeholder="Name" onChange={set('name')} />}
    <input className="inp" placeholder="Email" onChange={set('email')} /><input className="inp" type="password" placeholder="Password (8+ chars)" onChange={set('password')} />
    {err && <p className="text-sm text-red-600">{err}</p>}<button className="btn w-full" onClick={go}>{m === 'login' ? 'Log in' : 'Create account'}</button>
    <button className="w-full text-sm text-primary" onClick={() => setM(m === 'login' ? 'register' : 'login')}>{m === 'login' ? 'New here? Register' : 'Have an account? Log in'}</button></div>;
}
function Jobs() {
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [lv, setLv] = useState('');
  const [s] = useLoad(`/jobs?search=${encodeURIComponent(q)}&category=${cat}&level=${lv}`, [q, cat, lv]); const [cats] = useLoad('/categories');
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><input className="inp max-w-xs" placeholder="Search title or organization" value={q} onChange={e => setQ(e.target.value)} />
    <select className="inp max-w-[10rem]" onChange={e => setCat(e.target.value)}><option value="">All categories</option>{cats.d?.map(c => <option key={c.id}>{c.name}</option>)}</select>
    <select className="inp max-w-[10rem]" onChange={e => setLv(e.target.value)}><option value="">Any level</option><option>Central</option><option>State</option></select></div>
    <Async s={s}>{jobs => <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{jobs.map(j => <NavLink key={j.id} to={'/jobs/' + j.id} className="card block hover:border-primary">
      <b>{j.title}</b><p className="text-sm text-gray-500">{j.organization}</p><p className="mt-2 text-xs">{j.category} · {j.gov_level || '—'} {j.verified && '· ✓ verified'}</p></NavLink>)}</div>}</Async></div>;
}
function JobDetail() {
  const { id } = useParams(); const [s] = useLoad('/jobs/' + id, [id]);
  return <Async s={s}>{j => <div className="card space-y-2"><h1 className="text-xl font-semibold">{j.title}</h1><p>{j.organization}</p>
    <dl className="grid gap-2 sm:grid-cols-2 text-sm">{[['Vacancies', j.vacancies], ['Qualification', j.qualification?.join(', ')], ['Salary', j.salary], ['Location', j.location], ['Last date', j.last_date?.slice(0, 10)], ['Age limit', j.age_limit], ['Fee', j.fee], ['Selection', j.selection_process], ['Source', j.source_url]].map(([k, v]) => <div key={k}><dt className="text-gray-500">{k}</dt><dd>{v || 'Not stated in notification'}</dd></div>)}</dl>
    <div className="flex gap-2 pt-2"><a className="btn" href={j.application_url || j.notification_url} target="_blank" rel="noreferrer noopener">Apply Now</a><a className="btn !bg-gray-600" href={j.notification_url} target="_blank" rel="noreferrer noopener">Official Notification</a></div></div>}</Async>;
}
function Prefs() {
  const [s] = useLoad('/users/preferences'); const [f, setF] = useState(null); useEffect(() => { s.d && setF(s.d); }, [s.d]);
  if (!f) return <Async s={{ ...s, d: s.d || [1] }}>{() => null}</Async>;
  const list = k => ({ value: (f[k] || []).join(', '), onChange: e => setF({ ...f, [k]: e.target.value.split(',').map(x => x.trim()).filter(Boolean) }) });
  const val = k => ({ value: f[k] ?? '', onChange: e => setF({ ...f, [k]: e.target.value }) });
  const save = () => api('/users/preferences', 'PUT', f).then(() => alert('Saved')).catch(toastErr);
  return <div className="card grid gap-3 sm:grid-cols-2">{[['WhatsApp number (10 digits)', 'whatsapp'], ['State', 'state'], ['District', 'district'], ['Education', 'education'], ['Age', 'age'], ['Experience (yrs)', 'experience'], ['Min salary', 'min_salary']].map(([l, k]) => <label key={k} className="text-sm">{l}<input className="inp mt-1" {...val(k)} /></label>)}
    <label className="text-sm">Government level<select className="inp mt-1" {...val('gov_level')}><option>Both</option><option>Central</option><option>State</option></select></label>
    {[['Categories', 'categories'], ['Departments', 'departments'], ['Locations', 'locations'], ['Keywords', 'keywords']].map(([l, k]) => <label key={k} className="text-sm">{l} (comma separated)<input className="inp mt-1" {...list(k)} /></label>)}
    <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={!!f.whatsapp_optin} onChange={e => setF({ ...f, whatsapp_optin: e.target.checked })} /> Enable WhatsApp Job Alerts (I consent to receive alerts; reply STOP to opt out)</label>
    {f.opted_out && <p className="text-sm text-amber-600 sm:col-span-2">You opted out via STOP. Re-enabling consent above will resume alerts.</p>}<button className="btn sm:col-span-2" onClick={save}>Save preferences</button></div>;
}
function Notifs({ admin }) {
  const [s, reload] = useLoad(admin ? '/admin/notifications' : '/notifications'); const [busy, setBusy] = useState(false);
  const sendAll = async () => { setBusy(true); try { for (const n of s.d.filter(n => ['Queued', 'Pending', 'Retrying'].includes(n.status))) { await sendNotification(n); await new Promise(r => setTimeout(r, 1500)); } } catch (e) { toastErr(e); } setBusy(false); reload(); };
  return <div className="space-y-3">{admin && <button className="btn" disabled={busy} onClick={sendAll}>{busy ? 'Sending…' : 'Send queued notifications'}</button>}
    <Async s={s}>{rows => <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-gray-500"><th>ID</th><th>Job</th><th>Number</th><th>Status</th><th>Sent</th>{admin && <th />}</tr></thead><tbody>
      {rows.map(n => <tr key={n.id} className="border-t dark:border-slate-700"><td>{n.id}</td><td>{n.title}</td><td>{n.whatsapp}</td><td><Badge t={n.status} />{n.error && <div className="text-xs text-gray-500">{n.error}</div>}</td><td>{n.sent_at?.slice(0, 16).replace('T', ' ')}</td>
        {admin && <td>{n.status === 'Failed' && <button className="text-primary" onClick={() => api(`/admin/notifications/${n.id}/retry`, 'POST').then(reload).catch(toastErr)}>Retry</button>}</td>}</tr>)}</tbody></table></div>}</Async></div>;
}
function WhatsApp() {
  const c = waCfg(); const [f, setF] = useState(c);
  const save = () => { localStorage.setItem('wa_url', f.url); localStorage.setItem('wa_tpl', f.tpl); sessionStorage.setItem('wa_key', f.key); alert('Saved (API key kept for this browser session only)'); };
  return <div className="card max-w-xl space-y-3"><p className="text-sm text-amber-600">The API key is visible to anyone using this browser. Use only on an admin machine you control.</p>
    {[['API URL (includes session ID)', 'url'], ['API key', 'key'], ['Default template ID', 'tpl']].map(([l, k]) => <label key={k} className="block text-sm">{l}<input className="inp mt-1" type={k === 'key' ? 'password' : 'text'} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>)}<button className="btn" onClick={save}>Save</button></div>;
}
function AdminDash() {
  const [s] = useLoad('/admin/dashboard');
  return <Async s={{ ...s, d: s.d && [s.d] }}>{([d]) => <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(d).map(([k, v]) => <div key={k} className="card"><p className="text-sm capitalize text-gray-500">{k.replace('_', ' ')}</p><p className="text-2xl font-semibold">{v}</p></div>)}</div>}</Async>;
}
function AdminSources() {
  const [s, reload] = useLoad('/admin/scrapers'); const [src, rl] = useLoad('/admin/sources'); const [f, setF] = useState({ name: '', url: '', config: '{}' });
  const add = () => { try { api('/admin/sources', 'POST', { ...f, config: JSON.parse(f.config) }).then(() => { rl(); reload(); }).catch(toastErr); } catch { alert('Config must be valid JSON'); } };
  return <div className="space-y-4"><Async s={src}>{rows => <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-gray-500"><th>Source</th><th>Enabled</th><th>Status</th><th>Last run</th><th>Found/New/Dup/Err</th><th /></tr></thead><tbody>
    {rows.map(r => { const st = s.d?.find(x => x.id === r.id) || {}; return <tr key={r.id} className="border-t dark:border-slate-700"><td>{r.name}</td>
      <td><input type="checkbox" checked={r.enabled} onChange={e => api('/admin/sources/' + r.id, 'PUT', { enabled: e.target.checked }).then(() => { rl(); reload(); })} /></td><td>{st.status}</td><td>{st.last_run?.slice(0, 16).replace('T', ' ')}</td>
      <td>{st.found ?? '-'}/{st.new_jobs ?? '-'}/{st.duplicates ?? '-'}/{st.errors ?? '-'}</td><td><button className="text-primary" onClick={() => api(`/admin/sources/${r.id}/scrape`, 'POST').then(() => { rl(); reload(); }).catch(toastErr)}>Run</button></td></tr>; })}</tbody></table></div>}</Async>
    <div className="card space-y-2"><b>Add source</b><input className="inp" placeholder="Name" onChange={e => setF({ ...f, name: e.target.value })} /><input className="inp" placeholder="URL" onChange={e => setF({ ...f, url: e.target.value })} />
      <textarea className="inp font-mono text-xs" rows="4" placeholder='{"item":"tr","title":"td a","link":"td a","organization":"…"}' onChange={e => setF({ ...f, config: e.target.value })} /><button className="btn" onClick={add}>Add</button></div></div>;
}
function Users() { const [s] = useLoad('/admin/users'); return <Async s={s}>{rows => <div className="card overflow-x-auto"><table className="w-full text-sm"><tbody>{rows.map(u => <tr key={u.id} className="border-t dark:border-slate-700"><td>{u.name}</td><td>{u.email}</td><td>{u.whatsapp}</td><td>{u.opted_out ? 'Opted out' : u.whatsapp_optin ? 'Subscribed' : 'Off'}</td></tr>)}</tbody></table></div>}</Async>; }

export default function App() {
  const r = role(); const nav = useNavigate();
  if (!token()) return <Routes><Route path="*" element={<Login />} /></Routes>;
  const links = [['/', 'Government Jobs'], ['/preferences', 'Preferences'], ['/notifications', 'Notifications'], ...(r === 'admin' ? [['/admin', 'Admin Dashboard'], ['/admin/sources', 'Sources & Scrapers'], ['/admin/users', 'Users'], ['/admin/notifications', 'Send Queue'], ['/admin/whatsapp', 'WhatsApp']] : [])];
  return <div className="flex min-h-screen flex-col md:flex-row"><aside className="border-b bg-white p-3 dark:border-slate-700 dark:bg-slate-800 md:w-56 md:border-b-0 md:border-r"><h1 className="mb-3 font-semibold">🔔 GovJobs</h1>
    <nav className="flex flex-wrap gap-1 md:flex-col">{links.map(([to, l]) => <NavLink key={to} to={to} end className={({ isActive }) => 'rounded-lg px-3 py-1.5 text-sm ' + (isActive ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700')}>{l}</NavLink>)}</nav>
    <div className="mt-3 flex gap-2 text-sm"><button onClick={() => document.documentElement.classList.toggle('dark')}>🌓</button><button onClick={() => { localStorage.removeItem('tok'); nav('/'); location.reload(); }}>Log out</button></div></aside>
    <main className="flex-1 p-4"><Routes><Route path="/" element={<Jobs />} /><Route path="/jobs/:id" element={<JobDetail />} /><Route path="/preferences" element={<Prefs />} /><Route path="/notifications" element={<Notifs />} />
      {r === 'admin' && <><Route path="/admin" element={<AdminDash />} /><Route path="/admin/sources" element={<AdminSources />} /><Route path="/admin/users" element={<Users />} /><Route path="/admin/notifications" element={<Notifs admin />} /><Route path="/admin/whatsapp" element={<WhatsApp />} /></>}
      <Route path="*" element={<Navigate to="/" />} /></Routes></main></div>;
}
