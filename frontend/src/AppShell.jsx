import React, { createContext, useContext, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp, ArrowLeft, ArrowRight, Bell, Bookmark, BriefcaseBusiness, Building2, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, ExternalLink, FileText,
  Filter, LayoutDashboard, LogIn, LogOut, MapPin, Menu, Moon, Pause, Pencil, Play, Plus, Search, Send,
  Settings2, ShieldCheck, Sun, Trash2, UserRound, Users, Wallet, X, Zap
} from 'lucide-react';
import { api, role, saveWaCfg, testWhatsApp, token, waCfg } from './api.js';

const ToastContext = createContext(() => {});
const useToast = () => useContext(ToastContext);
const inputClass = 'field';
const buttonClass = 'button';
const mutedButtonClass = 'button button-muted';

function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);
  return <ToastContext.Provider value={(message, type = 'success') => setToast({ message, type })}>
    {children}
    {toast && <div className={`toast toast-${toast.type}`} role="status"><CheckCircle2 size={18} />{toast.message}<button aria-label="Dismiss" onClick={() => setToast(null)}><X size={16} /></button></div>}
  </ToastContext.Provider>;
}

function useLoad(path, keepDataOnReload = false) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) {
      setState({ data: [], error: '', loading: false });
      return undefined;
    }
    let live = true;
    setState(current => ({ ...current, loading: !keepDataOnReload || current.data === null, error: '' }));
    api(path).then(data => live && setState({ data, error: '', loading: false }))
      .catch(error => live && setState({ data: null, error: error.message, loading: false }));
    return () => { live = false; };
  }, [path, version, keepDataOnReload]);
  return { ...state, reload: () => setVersion(current => current + 1) };
}

function Loading({ label = 'Loading records' }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

function ErrorState({ message, retry }) {
  return <div className="empty-state"><CircleAlert size={24} /><strong>Could not load this view</strong><span>{message}</span>{retry && <button className={mutedButtonClass} onClick={retry}>Try again</button>}</div>;
}

function EmptyState({ icon: Icon = BriefcaseBusiness, title, detail, action }) {
  return <div className="empty-state"><Icon size={26} strokeWidth={1.6} /><strong>{title}</strong><span>{detail}</span>{action}</div>;
}

function PageHeader({ eyebrow, title, description, action }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>;
}

function SectionHeading({ title, detail, action }) {
  return <div className="section-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function StatusBadge({ status }) {
  const tone = status === 'Sent' || status === 'ok' ? 'good' : status === 'Failed' || status === 'error' ? 'bad' : status === 'running' || status === 'Sending' ? 'blue' : status === 'Queued' ? 'gold' : 'neutral';
  return <Badge tone={tone}>{status || 'Idle'}</Badge>;
}

const prettyDate = value => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not specified';
const prettyDateTime = value => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Not specified';
const relativeTime = value => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'not yet';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
const dateInput = value => value ? String(value).slice(0, 10) : '';
const parseCsv = value => value.split(',').map(item => item.trim()).filter(Boolean);

function AuthPage({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const notify = useToast();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', password: '', whatsapp: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = mode === 'register' ? form : { email: form.email, password: form.password };
      const result = await api(`/auth/${mode}`, 'POST', payload);
      localStorage.setItem('tok', result.token);
      notify(mode === 'register' ? 'Account created. Set your job-alert preferences next.' : 'Welcome back.');
      navigate(mode === 'register' ? '/preferences' : '/', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };
  return <main className="auth-screen">
    <section className="auth-story"><div className="brand-lockup"><span className="brand-mark"><Building2 size={22} /></span><span>GovJobs<span className="brand-dot">.</span></span></div>
      <div className="auth-story-copy"><p className="eyebrow">Verified opportunities</p><h1>Find the public service role that fits your next chapter.</h1><p>Official recruitment notices, clear deadlines, and job alerts shaped around your preferences.</p></div>
      <div className="auth-proof"><span><ShieldCheck size={17} /> Official-source links</span><span><Bell size={17} /> Alerts with consent</span></div>
    </section>
    <section className="auth-form-wrap"><form className="auth-form" onSubmit={submit}>
      <p className="eyebrow">{mode === 'login' ? 'Your workspace' : 'Get started'}</p>
      <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
      <p className="form-intro">{mode === 'login' ? 'Continue to your jobs and alerts.' : 'Create your account, then choose the opportunities you want to see.'}</p>
      {mode === 'register' && <><label>Full name<input className={inputClass} autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>WhatsApp number<input className={inputClass} type="tel" inputMode="numeric" maxLength={10} value={form.whatsapp} onChange={event => setForm({ ...form, whatsapp: event.target.value.replace(/\D/g, '').slice(0, 10) })} required /><small>10-digit Indian mobile number without the country code.</small></label></>}
      <label>Email address<input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label>
      <label>Password<input className={inputClass} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required /><small>Use at least 8 characters.</small></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className={buttonClass} type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={17} /></button>
      <p className="auth-toggle">{mode === 'login' ? 'New to GovJobs?' : 'Already registered?'} <button type="button" onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
    </form><Link className="auth-browse" to="/jobs">Browse current job notices <ArrowRight size={15} /></Link></section>
  </main>;
}

function JobCard({ job, savedIds = [], onSave }) {
  const saved = savedIds.includes(Number(job.id));
  return <article className="job-card">
    <div className="job-card-top"><div className="job-tags">{job.featured ? <Badge tone="gold">Featured</Badge> : null}{job.verified ? <Badge tone="good">Verified</Badge> : <Badge>Source listed</Badge>}</div>
      {onSave && <button className={`icon-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove saved job' : 'Save job'} title={saved ? 'Remove saved job' : 'Save job'} onClick={() => onSave(job, saved)}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button>}</div>
    <Link className="job-title-link" to={`/jobs/${job.id}`}><h3>{job.title}</h3></Link>
    <p className="job-org"><Building2 size={15} />{job.organization}</p>
    <div className="job-source-line"><span>Imported from</span>{job.source_url ? <a href={job.source_url} target="_blank" rel="noreferrer noopener">{job.source_name || 'Recruitment source'} <ExternalLink size={12} /></a> : <strong>{job.source_name || 'Manual entry'}</strong>}{job.source_tier && <Badge tone={job.source_tier === 'tier2' ? 'gold' : 'good'}>{job.source_tier === 'tier2' ? 'Tier 2 · Aggregator' : 'Tier 1 · Primary'}</Badge>}</div>
    <div className="job-facts"><span><MapPin size={14} />{job.location || 'Location in notice'}</span><span><BriefcaseBusiness size={14} />{job.category || 'Government role'}</span></div>
    <div className="job-card-bottom"><div className="job-card-dates"><span><CalendarDays size={14} />Closes {prettyDate(job.last_date)}</span><span><Clock3 size={14} />Updated {prettyDate(job.updated_at || job.created_at)}</span></div><Link to={`/jobs/${job.id}`} aria-label={`View ${job.title}`}><ArrowRight size={18} /></Link></div>
  </article>;
}

function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="pagination"><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 results'}</span><div><button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button><span>Page {page} of {pages}</span><button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button></div></div>;
}

function SaveAction({ job, saved, onChange }) {
  const notify = useToast();
  const navigate = useNavigate();
  const toggle = async () => {
    if (!token()) { notify('Sign in to save jobs.', 'error'); navigate('/login'); return; }
    try {
      await api(`/jobs/${job.id}/save`, saved ? 'DELETE' : 'POST');
      onChange?.();
      notify(saved ? 'Removed from saved jobs.' : 'Saved to your jobs.');
    } catch (error) { notify(error.message, 'error'); }
  };
  return <button type="button" className={`${mutedButtonClass} save-action`} onClick={toggle}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Saved' : 'Save job'}</button>;
}

function DashboardPage() {
  const state = useLoad('/users/dashboard');
  const saved = useLoad(token() ? '/saved-jobs' : null);
  const notify = useToast();
  if (state.loading) return <Loading label="Loading your dashboard" />;
  if (state.error) return <ErrorState message={state.error} retry={state.reload} />;
  const data = state.data || {};
  const savedIds = (saved.data || []).map(job => Number(job.id));
  return <div className="page-stack">
    <PageHeader eyebrow="Your workspace" title="Good opportunities, in one place." description="Recent official notices and the deadlines worth keeping an eye on." action={<Link className={buttonClass} to="/jobs"><Search size={16} />Find a job</Link>} />
    <div className="metric-grid user-metrics"><Metric icon={Bookmark} label="Saved jobs" value={data.saved || 0} /><Metric icon={Bell} label="Alert history" value={data.notifications || 0} /><Metric icon={Zap} label="WhatsApp alerts" value={data.alerts_enabled ? 'On' : 'Off'} tone={data.alerts_enabled ? 'green' : 'gold'} /></div>
    <section className="content-section"><SectionHeading title="Recently posted" detail="The latest jobs added to the board." action={<Link className="text-link" to="/jobs">All jobs <ArrowRight size={15} /></Link>} />
      {data.latest?.length ? <div className="job-grid">{data.latest.map(job => <JobCard key={job.id} job={job} savedIds={savedIds} onSave={(record, isSaved) => api(`/jobs/${record.id}/save`, isSaved ? 'DELETE' : 'POST').then(() => saved.reload()).then(() => notify(isSaved ? 'Removed from saved jobs.' : 'Saved to your jobs.')).catch(error => notify(error.message, 'error'))} />)}</div> : <EmptyState title="No job notices yet" detail="Browse by category or check back after official notices are added." action={<Link className={mutedButtonClass} to="/categories">Explore categories</Link>} />}
    </section>
    <section className="content-section"><SectionHeading title="Upcoming deadlines" detail="Application closing dates currently on the board." action={<Link className="text-link" to="/jobs">Browse notices <ArrowRight size={15} /></Link>} />
      {data.upcoming?.length ? <div className="deadline-list">{data.upcoming.map(job => <Link key={job.id} to={`/jobs/${job.id}`} className="deadline-row"><span className="deadline-date">{prettyDate(job.last_date)}</span><span className="deadline-main"><strong>{job.title}</strong><small>{job.organization}</small></span><ArrowRight size={17} /></Link>)}</div> : <p className="inline-empty">No upcoming application deadlines are listed.</p>}
    </section>
  </div>;
}

function JobsPage() {
    const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [level, setLevel] = useState(searchParams.get('level') || '');
  const [stateName, setStateName] = useState(searchParams.get('state') || '');
  const [qualification, setQualification] = useState(searchParams.get('qualification') || '');
  const [salary, setSalary] = useState(searchParams.get('salary') || '');
  const [publishedFrom, setPublishedFrom] = useState(searchParams.get('publishedFrom') || '');
  const [deadlineTo, setDeadlineTo] = useState(searchParams.get('deadlineTo') || '');
  const [page, setPage] = useState(1);
  useEffect(() => {
    setSearch(searchParams.get('search') || '');
    setCategory(searchParams.get('category') || '');
    setLevel(searchParams.get('level') || '');
    setStateName(searchParams.get('state') || '');
    setQualification(searchParams.get('qualification') || '');
    setSalary(searchParams.get('salary') || '');
    setPublishedFrom(searchParams.get('publishedFrom') || '');
    setDeadlineTo(searchParams.get('deadlineTo') || '');
    setPage(1);
  }, [searchParams]);
  const deferredSearch = useDeferredValue(search);
  const categories = useLoad('/categories');
  const saved = useLoad(token() ? '/saved-jobs' : null);
  const params = new URLSearchParams({ page: String(page), pageSize: '12' });
  if (deferredSearch.trim()) params.set('search', deferredSearch.trim());
  if (category) params.set('category', category);
  if (level) params.set('level', level);
  if (stateName.trim()) params.set('state', stateName.trim());
  if (qualification.trim()) params.set('qualification', qualification.trim());
  if (salary.trim()) params.set('salary', salary.trim());
  if (publishedFrom) params.set('publishedFrom', publishedFrom);
  if (deadlineTo) params.set('deadlineTo', deadlineTo);
  const state = useLoad(`/jobs?${params}`);
  const resetPage = setter => value => { setter(value); setPage(1); };
  const clearFilters = () => { setSearch(''); setCategory(''); setLevel(''); setStateName(''); setQualification(''); setSalary(''); setPublishedFrom(''); setDeadlineTo(''); setPage(1); setSearchParams({}); };
  const notify = useToast();
  const savedIds = (saved.data || []).map(job => Number(job.id));
  const saveJob = async (job, isSaved) => {
    if (!token()) { notify('Sign in to save jobs.', 'error'); navigate('/login'); return; }
    try { await api(`/jobs/${job.id}/save`, isSaved ? 'DELETE' : 'POST'); await saved.reload(); notify(isSaved ? 'Removed from saved jobs.' : 'Saved to your jobs.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="page-stack">
    <PageHeader eyebrow="Recruitment board" title="Government jobs" description="Browse notices with their original sources and application links. Always confirm details in the official notification." />
    <section className="filter-panel" aria-label="Job search and filters">
      <label className="search-field"><Search size={18} /><input value={search} onChange={event => resetPage(setSearch)(event.target.value)} placeholder="Search job title, department, organization" /></label>
      <label className="filter-control"><span>Category</span><select value={category} onChange={event => resetPage(setCategory)(event.target.value)}><option value="">All categories</option>{categories.data?.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
      <label className="filter-control"><span>Government level</span><select value={level} onChange={event => resetPage(setLevel)(event.target.value)}><option value="">Any level</option><option value="Central">Central</option><option value="State">State</option></select></label>
      <label className="filter-control"><span>Location</span><input value={stateName} onChange={event => resetPage(setStateName)(event.target.value)} placeholder="State or city" /></label>
      <label className="filter-control"><span>Qualification</span><input value={qualification} onChange={event => resetPage(setQualification)(event.target.value)} placeholder="e.g. B.Tech" /></label>
      <label className="filter-control"><span>Salary / pay</span><input value={salary} onChange={event => resetPage(setSalary)(event.target.value)} placeholder="Search pay scale" /></label>
      <label className="filter-control"><span>Closes by</span><input type="date" value={deadlineTo} onChange={event => resetPage(setDeadlineTo)(event.target.value)} /></label>
      <label className="filter-control"><span>Published after</span><input type="date" value={publishedFrom} onChange={event => resetPage(setPublishedFrom)(event.target.value)} /></label>
      <button className="filter-reset" onClick={clearFilters}><X size={15} />Clear filters</button>
    </section>
    <div className="results-meta"><span><Filter size={15} />{state.data?.total ?? '…'} matching notices</span><span>Sorted by newest and featured</span></div>
    {state.loading ? <Loading label="Searching official notices" /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : state.data?.items?.length ? <>
      <div className="job-grid">{state.data.items.map(job => <JobCard key={job.id} job={job} savedIds={savedIds} onSave={saveJob} />)}</div>
      <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onPage={setPage} />
    </> : <EmptyState icon={Search} title="No matching notices" detail="Try removing a filter or broadening your search." action={<button className={mutedButtonClass} onClick={clearFilters}>Clear filters</button>} />}
  </div>;
}

function JobDetailPage() {
  const { id } = useParams();
  const state = useLoad(`/jobs/${id}`);
  const saved = useLoad('/saved-jobs');
  const job = state.data;
  if (state.loading) return <Loading label="Loading notice" />;
  if (state.error) return <ErrorState message={state.error} retry={state.reload} />;
  const isSaved = (saved.data || []).some(item => Number(item.id) === Number(id));
  const fields = [
    ['Department', job.department], ['Recruitment number', job.recruitment_no], ['Notification number', job.notification_no],
    ['Vacancies', job.vacancies], ['Qualification', Array.isArray(job.qualification) ? job.qualification.join(', ') : job.qualification],
    ['Age limit', job.age_limit], ['Salary / pay scale', job.salary], ['Experience', job.experience], ['Location', job.location],
    ['Application opens', prettyDate(job.start_date)], ['Application deadline', prettyDate(job.last_date)], ['Application fee', job.fee],
    ['Selection process', job.selection_process], ['Exam date', prettyDate(job.exam_date)], ['Published', prettyDate(job.published_at)]
  ];
  return <div className="page-stack">
    <Link className="back-link" to="/jobs"><ArrowLeft size={16} />Back to jobs</Link>
    <section className="job-detail-heading"><div className="job-tags">{job.featured ? <Badge tone="gold">Featured</Badge> : null}{job.verified ? <Badge tone="good">Verified notice</Badge> : <Badge>Verification pending</Badge>}<Badge>{job.category || 'Government job'}</Badge></div><h1>{job.title}</h1><p><Building2 size={17} />{job.organization}</p><div className="job-detail-actions"><a className={buttonClass} href={job.application_url || job.notification_url} target="_blank" rel="noreferrer noopener">Apply online <ExternalLink size={16} /></a><a className={mutedButtonClass} href={job.notification_url} target="_blank" rel="noreferrer noopener"><FileText size={16} />Official notification</a><SaveAction job={job} saved={isSaved} onChange={saved.reload} /></div></section>
    <section className="detail-section"><SectionHeading title="Recruitment details" detail="Information recorded from the published notice. Confirm eligibility and dates with the official source." />
      <dl className="detail-grid">{fields.map(([label, value]) => <div key={label} className="detail-item"><dt>{label}</dt><dd>{value || 'Not stated in notification'}</dd></div>)}</dl>
    </section>
    <section className="source-strip"><div><ShieldCheck size={20} /><div><strong>Imported from {job.source_name || 'Recruitment website'} {job.source_tier && <Badge tone={job.source_tier === 'tier2' ? 'gold' : 'good'}>{job.source_tier === 'tier2' ? 'Tier 2 · Aggregator' : 'Tier 1 · Primary'}</Badge>}</strong><p>Added {prettyDate(job.created_at)}. Confirm the details against the original notice.</p></div></div><a href={job.source_url} target="_blank" rel="noreferrer noopener">Open original source page <ExternalLink size={15} /></a></section>
  </div>;
}

function SavedJobsPage() {
  const state = useLoad('/saved-jobs');
  const notify = useToast();
  const remove = async job => {
    try { await api(`/jobs/${job.id}/save`, 'DELETE'); state.reload(); notify('Removed from saved jobs.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Your shortlist" title="Saved jobs" description="Notices you have bookmarked to review or apply for later." action={<Link className={mutedButtonClass} to="/jobs"><Search size={16} />Browse jobs</Link>} />
    {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : state.data?.length ? <div className="job-grid">{state.data.map(job => <JobCard key={job.id} job={job} savedIds={state.data.map(item => Number(item.id))} onSave={remove} />)}</div> : <EmptyState icon={Bookmark} title="Your shortlist is empty" detail="Save a notice from the jobs board to keep it here." action={<Link className={buttonClass} to="/jobs">Browse jobs <ArrowRight size={16} /></Link>} />}
  </div>;
}

function CategoriesPage() {
  const state = useLoad('/categories');
  return <div className="page-stack"><PageHeader eyebrow="Explore by field" title="Job categories" description="Browse recruitment notices by their listed category." />
    {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : <div className="category-grid">{state.data?.map(category => <Link className="category-row" to={`/jobs?category=${encodeURIComponent(category.name)}`} key={category.id}><span className="category-icon"><BriefcaseBusiness size={19} /></span><span><strong>{category.name}</strong><small>Browse notices in this field</small></span><ArrowRight size={18} /></Link>)}</div>}
  </div>;
}

function PreferencesPage() {
  const state = useLoad('/users/preferences');
  const categories = useLoad('/categories');
  const notify = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state.data && form === null) setForm({ ...state.data, categories: state.data.categories || [], departments: state.data.departments || [], locations: state.data.locations || [], keywords: state.data.keywords || [] }); }, [state.data, form]);
  if (state.loading || !form) return <Loading label="Loading your preferences" />;
  if (state.error) return <ErrorState message={state.error} retry={state.reload} />;
  const change = key => event => setForm(current => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const toggleCategory = name => setForm(current => ({ ...current, categories: current.categories.includes(name) ? current.categories.filter(item => item !== name) : [...current.categories, name] }));
  const save = async event => {
    event.preventDefault(); setBusy(true);
    try { await api('/users/preferences', 'PUT', form); notify('Preferences saved.'); state.reload(); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Personalize your board" title="Job preferences" description="Choose the roles and locations that matter. Alerts are only sent after you opt in." />
    <form className="preferences-form" onSubmit={save}>
      <section className="form-section"><SectionHeading title="Your profile" detail="Used to match notices to your experience and location." /><div className="form-grid">
        <label>WhatsApp mobile<input className={inputClass} type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number" value={form.whatsapp || ''} onChange={change('whatsapp')} /><small>Indian mobile number, without country code.</small></label>
        <label>Education / qualification<input className={inputClass} value={form.education || ''} onChange={change('education')} placeholder="e.g. B.Tech in Computer Science" /></label>
        <label>State<input className={inputClass} value={form.state || ''} onChange={change('state')} placeholder="Telangana" /></label>
        <label>District<input className={inputClass} value={form.district || ''} onChange={change('district')} placeholder="Hyderabad" /></label>
        <label>Age<input className={inputClass} type="number" min="18" max="100" value={form.age || ''} onChange={change('age')} /></label>
        <label>Experience (years)<input className={inputClass} type="number" min="0" max="60" value={form.experience ?? 0} onChange={change('experience')} /></label>
        <label>Minimum salary (INR)<input className={inputClass} type="number" min="0" value={form.min_salary ?? 0} onChange={change('min_salary')} /></label>
        <label>Government level<select className={inputClass} value={form.gov_level || 'Both'} onChange={change('gov_level')}><option value="Both">Central and State</option><option value="Central">Central Government</option><option value="State">State Government</option></select></label>
      </div></section>
      <section className="form-section"><SectionHeading title="Preferred categories" detail="Select every category you want included in matching." /><div className="check-grid">{categories.data?.map(category => <label className="check-option" key={category.id}><input type="checkbox" checked={(form.categories || []).includes(category.name)} onChange={() => toggleCategory(category.name)} /><span>{category.name}</span></label>)}</div></section>
      <section className="form-section"><SectionHeading title="Departments, locations and keywords" detail="Separate multiple values with commas." /><div className="form-grid form-grid-single"><label>Departments<input className={inputClass} value={(form.departments || []).join(', ')} onChange={event => setForm({ ...form, departments: parseCsv(event.target.value) })} placeholder="CSE / IT, Public Works" /></label><label>Preferred locations<input className={inputClass} value={(form.locations || []).join(', ')} onChange={event => setForm({ ...form, locations: parseCsv(event.target.value) })} placeholder="Telangana, Andhra Pradesh, Remote" /></label><label>Keywords<input className={inputClass} value={(form.keywords || []).join(', ')} onChange={event => setForm({ ...form, keywords: parseCsv(event.target.value) })} placeholder="Software Engineer, Programmer" /></label></div></section>
      <section className="consent-box"><label className="consent-toggle"><input type="checkbox" checked={Boolean(form.whatsapp_optin)} onChange={change('whatsapp_optin')} /><span><strong>Enable WhatsApp job alerts</strong><small>I consent to receive relevant job notices. I can opt out at any time by replying STOP.</small></span></label>{form.opted_out && <p className="consent-note">You previously opted out. Saving with consent enabled will re-enable alerts.</p>}</section>
      <div className="form-actions"><p>Your preferences are private and used to match jobs and deliver opted-in alerts.</p><button className={buttonClass} type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save preferences'}<Check size={16} /></button></div>
    </form>
  </div>;
}

function AccountPage() {
  const state = useLoad('/auth/me');
  const notify = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state.data) setForm(current => current || { name: state.data.name || '', email: state.data.email || '', password: '' });
  }, [state.data]);
  if (state.error) return <ErrorState message={state.error} retry={state.reload} />;
  if (state.loading || !form) return <Loading label="Loading your account" />;
  const change = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const save = async event => {
    event.preventDefault(); setBusy(true);
    try {
      await api('/users/account', 'PUT', form);
      setForm(current => ({ ...current, password: '' }));
      state.reload();
      notify('Account settings saved.');
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Your account" title={form.name} description="Manage the name, email address, and password for your account." />
    <form className="settings-section schedule-form" onSubmit={save}><label>Full name<input className={inputClass} autoComplete="name" value={form.name} onChange={change('name')} required /></label><label>Email address<input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={change('email')} required /></label><label>New password<input className={inputClass} type="password" autoComplete="new-password" minLength="8" value={form.password} onChange={change('password')} placeholder="Leave blank to keep current password" /></label><button className={buttonClass} disabled={busy}>{busy ? 'Saving…' : 'Save account settings'}<Check size={16} /></button></form>
  </div>;
}

function UserMenu({ account, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const state = useLoad(open ? '/notifications' : null, true);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = event => { if (!menuRef.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    const timer = window.setInterval(state.reload, 60000);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.clearInterval(timer);
    };
  }, [open]);
  return <div className="user-menu" ref={menuRef}>
    <button className="user-menu-trigger" type="button" aria-expanded={open} aria-controls="user-menu-panel" onClick={() => setOpen(value => !value)}>
      <span className="user-menu-avatar"><UserRound size={17} /></span><span className="user-menu-label"><strong>{account?.name || 'Your account'}</strong><small>{account?.email || 'Account'}</small></span><ChevronDown size={15} />
    </button>
    {open && <div className="user-menu-panel" id="user-menu-panel" role="dialog" aria-label="Account and notifications">
      <div className="user-menu-heading"><strong>{account?.name || 'Your account'}</strong><small>{account?.email}</small></div>
      <Link className="user-menu-account" to="/account" onClick={() => setOpen(false)}><UserRound size={15} />Account settings</Link>
      <div className="user-menu-notifications"><div className="user-menu-section-heading"><strong>Recent notifications</strong><Link to="/notifications" onClick={() => setOpen(false)}>View all</Link></div>
        {state.loading ? <p className="user-menu-empty">Loading notifications…</p> : state.error ? <p className="user-menu-empty">Could not load notifications.</p> : state.data?.length ? <div className="user-menu-list">{state.data.slice(0, 5).map(item => <Link className="user-menu-item" to="/notifications" key={item.id} onClick={() => setOpen(false)}><span><strong>{item.title || 'Job alert'}</strong><small>{relativeTime(item.created_at)}</small></span><StatusBadge status={item.status} /></Link>)}</div> : <p className="user-menu-empty">No notifications yet.</p>}
      </div>
      <button className="user-menu-logout" type="button" onClick={onLogout}><LogOut size={15} />Sign out</button>
    </div>}
  </div>;
}

function NotificationsPage({ adminMode = false }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sendingIds, setSendingIds] = useState(() => new Set());
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pausedState, setPausedState] = useState(null);
  const path = adminMode ? `/admin/notifications?${new URLSearchParams({ ...(status && { status }), ...(search && { search }) })}` : '/notifications';
  const state = useLoad(path, true);
  const holdState = useLoad(adminMode ? '/admin/whatsapp/state' : null, true);
  const notify = useToast();
  const paused = pausedState ?? Boolean(holdState.data?.paused);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const markSending = (id, sending) => setSendingIds(current => {
    const next = new Set(current);
    if (sending) next.add(id);
    else next.delete(id);
    return next;
  });
  useEffect(() => { if (holdState.data) setPausedState(Boolean(holdState.data.paused)); }, [holdState.data]);
  useEffect(() => {
    const timer = window.setInterval(state.reload, 10000);
    return () => window.clearInterval(timer);
  }, [adminMode]);
  useEffect(() => {
    if (!adminMode) return undefined;
    const timer = window.setInterval(holdState.reload, 15000);
    return () => window.clearInterval(timer);
  }, [adminMode]);
  const latestNotification = state.data?.[0];
  const sendManually = async notification => {
    markSending(notification.id, true);
    try {
      await api(`/admin/notifications/${notification.id}/send`, 'POST');
      notify(`Notification ${notification.id} added to the delivery queue.`);
    } catch (error) { notify(error.message, 'error'); }
    finally {
      markSending(notification.id, false);
      state.reload();
    }
  };
  const toggleWhatsAppHold = async () => {
    setPauseBusy(true);
    try {
      const result = await api('/admin/whatsapp/state', 'PUT', { paused: !paused });
      setPausedState(result.paused);
      pausedRef.current = result.paused;
      holdState.reload();
      notify(result.paused ? 'WhatsApp delivery is on hold.' : 'WhatsApp delivery resumed.');
    } catch (error) { notify(error.message, 'error'); }
    finally { setPauseBusy(false); }
  };
  return <div className="page-stack"><PageHeader eyebrow={adminMode ? 'Delivery operations' : 'Your alerts'} title={adminMode ? 'Notifications' : 'Alert history'} description={adminMode ? paused ? 'WhatsApp delivery is on hold. Queued alerts will wait until an admin resumes sending.' : 'Queued alerts are delivered in the background while WhatsApp settings are configured.' : latestNotification ? `Notifications updated ${relativeTime(latestNotification.created_at)}.` : 'Notifications will appear here after a scraper finds matching jobs.'} action={adminMode && <div className="hold-control"><Badge tone={holdState.error ? 'neutral' : paused ? 'bad' : 'good'}>{holdState.error ? 'Status unavailable' : paused ? 'WhatsApp on hold' : 'WhatsApp active'}</Badge><button className={paused ? buttonClass : mutedButtonClass} disabled={pauseBusy || holdState.loading || Boolean(holdState.error)} onClick={toggleWhatsAppHold}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Resume WhatsApp' : 'Pause WhatsApp'}</button></div>} />
    {adminMode && holdState.error && <ErrorState message={holdState.error} retry={holdState.reload} />}
    {adminMode && <div className="filter-panel compact-filters"><label className="search-field"><Search size={17} /><input placeholder="Search user, number, or job" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="filter-control"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{['Queued', 'Pending', 'Sending', 'Sent', 'Failed', 'Retrying'].map(item => <option key={item}>{item}</option>)}</select></label></div>}
    {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : state.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Job</th>{adminMode && <th>User</th>}<th>WhatsApp</th><th>Status</th><th>Created</th><th>Sent date</th><th /></tr></thead><tbody>{state.data.map(item => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.organization}</small><details className="row-details"><summary>Message and response</summary><p>{item.message}</p>{item.api_response && <pre>{item.api_response}</pre>}{item.error && <p className="form-error">{item.error}</p>}</details></td>{adminMode && <td>{item.name}</td>}<td>{item.whatsapp}</td><td><StatusBadge status={item.status} /></td><td>{prettyDateTime(item.created_at)}</td><td>{item.sent_at ? prettyDateTime(item.sent_at) : 'Not sent'}</td><td>{adminMode && ['Queued', 'Pending', 'Retrying', 'Failed'].includes(item.status) && <button className="small-action" disabled={sendingIds.has(item.id)} onClick={() => sendManually(item)}>{sendingIds.has(item.id) ? 'Queueing…' : item.status === 'Failed' ? 'Retry now' : 'Send now'}</button>}</td></tr>)}</tbody></table></div> : <EmptyState icon={Bell} title="No notifications yet" detail={adminMode ? 'Matching opted-in users will appear here when new jobs are added.' : 'Alerts for matching jobs will appear here.'} />}
  </div>;
}

function Metric({ icon: Icon, label, value, tone = 'green', detail }) {
  return <article className="metric"><span className={`metric-icon metric-${tone}`}><Icon size={18} /></span><div><span>{label}</span><strong>{value ?? '—'}</strong>{detail && <small>{detail}</small>}</div></article>;
}

function AdminDashboard() {
  const state = useLoad('/admin/dashboard');
  if (state.loading) return <Loading label="Loading operations overview" />;
  if (state.error) return <ErrorState message={state.error} retry={state.reload} />;
  const data = state.data || {};
  const metrics = [
    ['Total jobs', data.total_jobs, BriefcaseBusiness, 'green'], ['Jobs today', data.jobs_today, CalendarDays, 'blue'],
    ['User accounts', data.users, Users, 'gold'], ['WhatsApp subscribers', data.subscribers, Bell, 'green'],
    ['Messages sent', data.sent, Send, 'blue'], ['Delivery failed', data.failed, CircleAlert, 'red'],
    ['Pending queue', data.pending, Clock3, 'gold'], ['Enabled sources', data.active_scrapers, Building2, 'green']
  ];
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="Operations overview" description="Monitor published notices, alert delivery, users, and configured recruitment sources." action={<Link className={buttonClass} to="/admin/jobs"><Plus size={16} />Add a job</Link>} />
    <div className="metric-grid">{metrics.map(([label, value, icon, tone]) => <Metric key={label} icon={icon} label={label} value={value} tone={tone} />)}</div>
    <section className="content-section"><SectionHeading title="Administration" detail="Jump into the areas that need attention." /><div className="admin-shortcuts">{[
      ['/admin/jobs', 'Manage jobs', 'Create, verify, feature, and edit notices.', BriefcaseBusiness],
      ['/admin/sources', 'Recruitment sources', 'Configure and run responsible scrapers.', Building2],
      ['/admin/notifications', 'WhatsApp queue', 'Process pending sends and review failures.', Send],
      ['/admin/users', 'User accounts', 'Review preferences and consent status.', Users]
    ].map(([to, title, description, Icon]) => <Link key={to} to={to} className="shortcut-row"><span><Icon size={19} /></span><div><strong>{title}</strong><small>{description}</small></div><ArrowRight size={17} /></Link>)}</div></section>
  </div>;
}

const newJob = () => ({ title: '', organization: '', department: '', recruitment_no: '', notification_no: '', category: '', gov_level: 'Central', vacancies: '', qualification: [], age_limit: '', salary: '', experience: '', location: '', start_date: '', last_date: '', fee: '', selection_process: '', exam_date: '', published_at: '', notification_url: '', application_url: '', source_id: '', source_url: '', verified: false, featured: false });

function JobEditor({ initial, categories, sources, onClose, onSaved }) {
  const notify = useToast();
  const [form, setForm] = useState(() => initial ? { ...newJob(), ...initial, qualification: initial.qualification || [] } : newJob());
  const [busy, setBusy] = useState(false);
  const change = key => event => setForm(current => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const field = (label, key, type = 'text', placeholder = '') => <label key={key}>{label}<input className={inputClass} type={type} value={type === 'date' ? dateInput(form[key]) : form[key] ?? ''} onChange={change(key)} placeholder={placeholder} /></label>;
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    const payload = { ...form, qualification: Array.isArray(form.qualification) ? form.qualification : parseCsv(form.qualification), vacancies: form.vacancies || null, source_id: form.source_id || null };
    try {
      await api(initial ? `/admin/jobs/${initial.id}` : '/admin/jobs', initial ? 'PUT' : 'POST', payload);
      notify(initial ? 'Job notice updated.' : 'Job notice created.'); onSaved(); onClose();
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="job-editor-title"><header className="modal-header"><div><p className="eyebrow">Job management</p><h2 id="job-editor-title">{initial ? 'Edit notice' : 'Create job notice'}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button></header>
    <form onSubmit={submit} className="modal-body"><div className="form-grid">
      {field('Job title *', 'title')}{field('Organization *', 'organization')}{field('Department', 'department')}{field('Recruitment number', 'recruitment_no')}{field('Notification number', 'notification_no')}
      <label>Category<select className={inputClass} value={form.category || ''} onChange={change('category')}><option value="">Select category</option>{categories.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
      <label>Government level<select className={inputClass} value={form.gov_level || ''} onChange={change('gov_level')}><option value="Central">Central</option><option value="State">State</option><option value="Central + State">Central + State</option></select></label>
      {field('Vacancies', 'vacancies', 'number')}{field('Qualification (comma separated)', 'qualification', 'text', 'B.Tech, MCA')}{field('Age limit', 'age_limit')}{field('Salary / pay scale', 'salary')}{field('Experience', 'experience')}{field('Location', 'location')}
      {field('Application start', 'start_date', 'date')}{field('Application deadline', 'last_date', 'date')}{field('Application fee', 'fee')}{field('Exam date', 'exam_date', 'date')}{field('Publication date', 'published_at', 'date')}
      <label>Scraper source<select className={inputClass} value={form.source_id || ''} onChange={change('source_id')}><option value="">Manual / no source record</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-span">Selection process<input className={inputClass} value={form.selection_process || ''} onChange={change('selection_process')} /></label>
      {field('Official notification URL *', 'notification_url', 'url')}{field('Application URL', 'application_url', 'url')}{field('Source page URL *', 'source_url', 'url')}
      <label className="check-option"><input type="checkbox" checked={Boolean(form.verified)} onChange={change('verified')} />Mark as verified</label><label className="check-option"><input type="checkbox" checked={Boolean(form.featured)} onChange={change('featured')} />Feature this job</label>
    </div><footer className="modal-actions"><button type="button" className={mutedButtonClass} onClick={onClose}>Cancel</button><button className={buttonClass} disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create job'}<Check size={16} /></button></footer></form>
  </section></div>;
}

function AdminJobsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (deferredSearch) params.set('search', deferredSearch);
  if (category) params.set('category', category);
  const state = useLoad(`/admin/jobs?${params}`);
  const cats = useLoad('/admin/categories');
  const sources = useLoad('/admin/sources');
  const notify = useToast();
  const [editor, setEditor] = useState(undefined);
  const refresh = () => state.reload();
  const setMark = async (job, field) => {
    try { await api(`/admin/jobs/${job.id}/${field}`, 'PUT', { [field === 'verify' ? 'verified' : 'featured']: !job[field === 'verify' ? 'verified' : 'featured'] }); refresh(); }
    catch (error) { notify(error.message, 'error'); }
  };
  const remove = async job => {
    if (!window.confirm(`Delete “${job.title}”? Its notification history will also be removed.`)) return;
    try { await api(`/admin/jobs/${job.id}`, 'DELETE'); refresh(); notify('Job notice deleted.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="Job notices" description="Create and curate notices. Publish only information confirmed by the official recruitment source." action={<button className={buttonClass} onClick={() => setEditor(null)}><Plus size={16} />Add job</button>} />
    <div className="filter-panel compact-filters"><label className="search-field"><Search size={17} /><input placeholder="Search title, organization, department" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><label className="filter-control"><span>Category</span><select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{cats.data?.map(item => <option key={item.id}>{item.name}</option>)}</select></label><button className="filter-reset" onClick={() => { setSearch(''); setCategory(''); setPage(1); }}><X size={15} />Clear</button></div>
    {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : state.data?.items?.length ? <><div className="table-wrap"><table className="data-table"><thead><tr><th>Notice</th><th>Category / level</th><th>Deadline</th><th>Review</th><th>Actions</th></tr></thead><tbody>{state.data.items.map(job => <tr key={job.id}><td><Link className="table-primary-link" to={`/jobs/${job.id}`}>{job.title}</Link><small>{job.organization} · {job.source_name || 'Manual'}</small></td><td>{job.category || '—'}<small>{job.gov_level || '—'}</small></td><td>{prettyDate(job.last_date)}</td><td><div className="stack-badges">{job.verified ? <Badge tone="good">Verified</Badge> : <Badge>Unverified</Badge>}{job.featured ? <Badge tone="gold">Featured</Badge> : null}</div></td><td><div className="row-actions"><button className="icon-button" title="Edit notice" aria-label="Edit notice" onClick={() => setEditor(job)}><Pencil size={16} /></button><button className="icon-button" title={job.verified ? 'Remove verified status' : 'Mark verified'} aria-label={job.verified ? 'Remove verified status' : 'Mark verified'} onClick={() => setMark(job, 'verify')}><ShieldCheck size={16} /></button><button className="icon-button" title={job.featured ? 'Unfeature notice' : 'Feature notice'} aria-label={job.featured ? 'Unfeature notice' : 'Feature notice'} onClick={() => setMark(job, 'feature')}><Zap size={16} /></button><button className="icon-button danger-icon" title="Delete notice" aria-label="Delete notice" onClick={() => remove(job)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div><Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onPage={setPage} /></> : <EmptyState title="No job notices match" detail="Create an official notice manually or configure a source scraper." action={<button className={buttonClass} onClick={() => setEditor(null)}><Plus size={16} />Create notice</button>} />}
    {editor !== undefined && <JobEditor initial={editor || null} categories={cats.data || []} sources={sources.data || []} onClose={() => setEditor(undefined)} onSaved={refresh} />}
  </div>;
}

function AdminCategoriesPage() {
  const state = useLoad('/admin/categories');
  const notify = useToast();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const save = async event => {
    event.preventDefault();
    try {
      if (editing) await api(`/admin/categories/${editing.id}`, 'PUT', { name });
      else await api('/admin/categories', 'POST', { name });
      setName(''); setEditing(null); state.reload(); notify('Category saved.');
    } catch (error) { notify(error.message, 'error'); }
  };
  const remove = async category => {
    if (!window.confirm(`Remove “${category.name}”? Existing jobs will be moved to Other.`)) return;
    try { await api(`/admin/categories/${category.id}`, 'DELETE'); state.reload(); notify('Category removed.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="Job categories" description="Keep the taxonomy used by job listings and preference matching consistent." />
    <form className="inline-create" onSubmit={save}><label>{editing ? `Rename ${editing.name}` : 'New category'}<input className={inputClass} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Agriculture" required maxLength={100} /></label><button className={buttonClass}><Plus size={16} />{editing ? 'Save name' : 'Add category'}</button>{editing && <button type="button" className={mutedButtonClass} onClick={() => { setEditing(null); setName(''); }}>Cancel</button>}</form>
    {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : <div className="category-admin-list">{state.data?.map(category => <div className="category-admin-row" key={category.id}><span className="category-icon"><BriefcaseBusiness size={18} /></span><strong>{category.name}</strong><div><button className="icon-button" aria-label={`Edit ${category.name}`} onClick={() => { setEditing(category); setName(category.name); }}><Pencil size={16} /></button><button className="icon-button danger-icon" aria-label={`Delete ${category.name}`} onClick={() => remove(category)}><Trash2 size={16} /></button></div></div>)}</div>}
  </div>;
}

function SourceEditor({ initial, onClose, onSaved }) {
  const notify = useToast();
  const [form, setForm] = useState({ name: initial?.name || '', url: initial?.url || '', adapter: initial?.adapter || 'generic', enabled: Boolean(initial?.enabled), config: JSON.stringify(initial?.config || { item: '', title: '', link: '', date: '', organization: '', category: 'Other', gov_level: 'Central', pages: [] }, null, 2) });
  const save = async event => {
    event.preventDefault();
    let config;
    try { config = JSON.parse(form.config); } catch { notify('Config must be valid JSON.', 'error'); return; }
    try {
      if (initial) await api(`/admin/sources/${initial.id}`, 'PUT', { ...form, config });
      else await api('/admin/sources', 'POST', { ...form, config });
      notify(initial ? 'Source updated.' : 'Source added.'); onSaved(); onClose();
    } catch (error) { notify(error.message, 'error'); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="modal-panel modal-narrow" role="dialog" aria-modal="true"><header className="modal-header"><div><p className="eyebrow">Recruitment source</p><h2>{initial ? 'Edit source' : 'Add source'}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></header><form className="modal-body form-grid form-grid-single" onSubmit={save}><label>Source name<input className={inputClass} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Official recruitment URL<input className={inputClass} type="url" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} required /></label><label>Node adapter<select className={inputClass} value={form.adapter} onChange={event => setForm({ ...form, adapter: event.target.value })}><option value="generic">Node.js / Cheerio selectors</option><option value="upsc-rss">UPSC official RSS feed</option><option value="ssc-notices">SSC official notices API</option><option value="sbi-careers">SBI Careers HTML</option><option value="freejobalert-telangana">FreeJobAlert Telangana articles</option><option value="sahi-sarkari-jobs">Sahi Sarkari Jobs articles</option><option value="ntpc-careers">NTPC open advertisements</option></select></label>{form.adapter === 'generic' && <label>CSS selector configuration<textarea className={`${inputClass} code-input`} rows={10} value={form.config} onChange={event => setForm({ ...form, config: event.target.value })} spellCheck="false" /></label>}<label className="check-option"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />Enable scheduled runs</label><p className="helper-note">Uses Node.js, Axios, and Cheerio. Tier 2 sources are attributed as aggregators; respect robots.txt and leave sources disabled until verified.</p><footer className="modal-actions"><button type="button" className={mutedButtonClass} onClick={onClose}>Cancel</button><button className={buttonClass}><Check size={16} />Save source</button></footer></form></section></div>;
}

function AdminSourcesPage() {
  const sources = useLoad('/admin/sources');
  const runs = useLoad('/admin/scrapers');
  const notify = useToast();
  const [editor, setEditor] = useState(undefined);
  const [running, setRunning] = useState(null);
  const refresh = () => { sources.reload(); runs.reload(); };
  const toggle = async source => {
    try { await api(`/admin/sources/${source.id}`, 'PUT', { enabled: !source.enabled }); refresh(); }
    catch (error) { notify(error.message, 'error'); }
  };
  const scrape = async source => {
    setRunning(source.id);
    try { const result = await api(`/admin/sources/${source.id}/scrape`, 'POST'); refresh(); notify(`Scrape complete: ${result.new_jobs} new, ${result.duplicates} duplicate, ${result.errors} errors.`); }
    catch (error) { notify(error.message, 'error'); }
    finally { setRunning(null); }
  };
  const deleteDuplicates = async source => {
    if (!window.confirm(`Delete duplicate jobs for “${source.name}”?`)) return;
    try {
      const result = await api(`/admin/sources/${source.id}/duplicates`, 'DELETE');
      refresh();
      notify(result.deleted ? `${result.deleted} duplicate job${result.deleted === 1 ? '' : 's'} removed.` : 'No duplicates found.');
    } catch (error) { notify(error.message, 'error'); }
  };
  const deleteSource = async source => {
    if (!window.confirm(`Delete source “${source.name}”? This keeps the jobs but removes the source link.`)) return;
    try { await api(`/admin/sources/${source.id}`, 'DELETE'); refresh(); notify('Source removed.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="Sources and scrapers" description="Configure official recruitment sites, validate selectors, and review the last run before enabling a schedule." action={<button className={buttonClass} onClick={() => setEditor(null)}><Plus size={16} />Add source</button>} />
    {sources.loading || runs.loading ? <Loading /> : sources.error || runs.error ? <ErrorState message={sources.error || runs.error} retry={refresh} /> : sources.data?.length ? <div className="source-list">{sources.data.map(source => {
      const run = runs.data?.find(item => Number(item.id) === Number(source.id));
      return <article className="source-row" key={source.id}><div className="source-main"><span className={`source-status ${source.enabled ? 'source-enabled' : ''}`}><Building2 size={18} /></span><div><strong>{source.name}</strong><a href={source.url} target="_blank" rel="noreferrer noopener">{source.url}<ExternalLink size={13} /></a><div className="source-meta"><StatusBadge status={run?.status || source.status} /><span>Last run {run?.last_run ? prettyDate(run.last_run) : 'Never'}</span><span>{run ? `${run.new_jobs || 0} new · ${run.duplicates || 0} duplicate · ${run.errors || 0} errors` : 'No run data'}</span></div>{run?.log && <details className="row-details"><summary>View run log</summary><pre>{run.log}</pre></details>}</div></div><div className="source-actions"><label className="switch-label"><input type="checkbox" checked={Boolean(source.enabled)} onChange={() => toggle(source)} /><span>{source.enabled ? 'Enabled' : 'Disabled'}</span></label><button className={mutedButtonClass} disabled={running === source.id} onClick={() => scrape(source)}>{running === source.id ? 'Running…' : 'Run now'}<ArrowRight size={15} /></button><button className={mutedButtonClass} onClick={() => deleteDuplicates(source)}>Delete duplicates</button><button className="icon-button" aria-label={`Edit ${source.name}`} onClick={() => setEditor(source)}><Pencil size={16} /></button><button className="icon-button danger-icon" aria-label={`Delete ${source.name}`} onClick={() => deleteSource(source)}><Trash2 size={16} /></button></div></article>;
    })}</div> : <EmptyState icon={Building2} title="No recruitment sources" detail="Add an official site and configure its selectors before running a scraper." action={<button className={buttonClass} onClick={() => setEditor(null)}><Plus size={16} />Add source</button>} />}
    {editor !== undefined && <SourceEditor initial={editor} onClose={() => setEditor(undefined)} onSaved={refresh} />}
  </div>;
}

function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', whatsapp: '', role: 'user' });
  const state = useLoad(`/admin/users?${new URLSearchParams(search ? { search } : {})}`);
  const notify = useToast();
  const toggleAlerts = async user => {
    try { await api(`/admin/users/${user.id}/alerts`, 'PUT', { enabled: !user.whatsapp_optin }); state.reload(); notify(user.whatsapp_optin ? 'WhatsApp alerts disabled.' : 'WhatsApp alerts enabled.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  const addUser = async event => {
    event.preventDefault();
    try {
      await api('/admin/users', 'POST', form);
      setForm({ name: '', email: '', password: '', whatsapp: '', role: 'user' });
      state.reload();
      notify('User created.');
    } catch (error) { notify(error.message, 'error'); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="User accounts" description="Review account profiles, job preferences, and WhatsApp consent status." />
    <form className="settings-section" onSubmit={addUser}><div className="form-grid"><label>Name<input className={inputClass} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Email<input className={inputClass} type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label><label>Password<input className={inputClass} type="password" value={form.password} minLength={8} onChange={event => setForm({ ...form, password: event.target.value })} required /></label><label>WhatsApp number<input className={inputClass} type="tel" inputMode="numeric" maxLength={10} value={form.whatsapp} onChange={event => setForm({ ...form, whatsapp: event.target.value.replace(/\D/g, '').slice(0, 10) })} required /></label><label>Role<select className={inputClass} value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option></select></label></div><button className={buttonClass} type="submit">Add user <Plus size={16} /></button></form>
    <div className="filter-panel compact-filters"><label className="search-field"><Search size={17} /><input placeholder="Search name, email, or number" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : state.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>WhatsApp</th><th>Profile</th><th>Consent</th><th /></tr></thead><tbody>{state.data.map(user => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email} · {user.role || 'user'} · Joined {prettyDate(user.created_at)}</small></td><td>{user.whatsapp || 'Not provided'}</td><td><span>{user.education || 'Qualification not set'}</span><small>{[user.state, user.district].filter(Boolean).join(' · ') || 'Location not set'}</small><details className="row-details"><summary>Preferences</summary><p>Categories: {(user.categories || []).join(', ') || 'Any'}</p><p>Departments: {(user.departments || []).join(', ') || 'Any'}</p><p>Locations: {(user.locations || []).join(', ') || 'Any'}</p><p>Keywords: {(user.keywords || []).join(', ') || 'Any'}</p><p>Government level: {user.gov_level || 'Both'} · Age {user.age || '—'} · Experience {user.experience || 0} years</p></details></td><td>{user.opted_out ? <Badge tone="bad">STOP opted out</Badge> : user.whatsapp_optin ? <Badge tone="good">Subscribed</Badge> : <Badge>Alerts off</Badge>}</td><td>{user.opted_out ? <span className="helper-note">User opted out</span> : <button className="small-action" onClick={() => toggleAlerts(user)}>{user.whatsapp_optin ? 'Disable alerts' : 'Enable alerts'}</button>}</td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="No user accounts found" detail="New registrations will appear here." />}
  </div>;
}

function TemplatesPage() {
  const state = useLoad('/admin/templates');
  const notify = useToast();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', body: '', is_default: false });
  const [busy, setBusy] = useState(false);
  const startEdit = template => { setEditing(template); setForm({ name: template.name || '', body: template.body, is_default: Boolean(template.is_default) }); };
  const reset = () => { setEditing(null); setForm({ name: '', body: '', is_default: false }); };
  const save = async event => {
    event.preventDefault(); setBusy(true);
    try { await api(editing ? `/admin/templates/${editing.id}` : '/admin/templates', editing ? 'PUT' : 'POST', form); reset(); state.reload(); notify('Message template saved.'); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const remove = async template => {
    if (!window.confirm(`Delete template “${template.name}”?`)) return;
    try { await api(`/admin/templates/${template.id}`, 'DELETE'); state.reload(); notify('Template deleted.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="WhatsApp templates" description="Manage reusable alert messages. Tokens in braces are filled from the stored job notice." />
    <section className="template-editor"><SectionHeading title={editing ? `Edit ${editing.name}` : 'Create a template'} detail="Available tokens include {JOB_TITLE}, {ORGANIZATION}, {VACANCIES}, {QUALIFICATION}, {LOCATION}, {SALARY}, {LAST_DATE}, {APPLICATION_URL}, {NOTIFICATION_URL}, and {SOURCE_NAME}." />
      <form className="template-form" onSubmit={save}><label>Template name<input className={inputClass} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Message<textarea className={`${inputClass} code-input`} rows={11} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} required /></label><label className="check-option"><input type="checkbox" checked={form.is_default} onChange={event => setForm({ ...form, is_default: event.target.checked })} />Use as default for new notifications</label><div className="form-actions"><span /> <div>{editing && <button className={mutedButtonClass} type="button" onClick={reset}>Cancel</button>}<button className={buttonClass} disabled={busy}>{editing ? 'Save template' : 'Add template'}<Check size={16} /></button></div></div></form>
    </section>
    {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : state.data?.length ? <div className="template-list">{state.data.map(template => <article className="template-row" key={template.id}><div><div className="template-title"><strong>{template.name}</strong>{template.is_default ? <Badge tone="good">Default</Badge> : null}</div><pre>{template.body}</pre></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${template.name}`} onClick={() => startEdit(template)}><Pencil size={16} /></button><button className="icon-button danger-icon" aria-label={`Delete ${template.name}`} onClick={() => remove(template)}><Trash2 size={16} /></button></div></article>)}</div> : <EmptyState icon={FileText} title="No templates yet" detail="Create a message template to personalize alerts." />}
  </div>;
}

function WhatsAppSettingsPage() {
  const notify = useToast();
  const state = useLoad('/admin/whatsapp/config');
  const [form, setForm] = useState(() => ({ ...waCfg(), key: '' }));
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  useEffect(() => {
    if (!state.data) return;
    setKeyConfigured(state.data.keyConfigured);
    const legacy = waCfg();
    setForm({
      url: state.data.keyConfigured ? state.data.url : legacy.url,
      sessionId: state.data.keyConfigured ? state.data.sessionId : legacy.sessionId,
      tpl: state.data.keyConfigured ? state.data.tpl : legacy.tpl,
      key: state.data.keyConfigured ? '' : legacy.key
    });
  }, [state.data]);
  const save = async () => {
    setSaving(true);
    try {
      const result = await saveWaCfg(form);
      setKeyConfigured(result.keyConfigured);
      setForm(current => ({ ...current, key: '' }));
      notify('WhatsApp settings saved for all admin devices.');
    } catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true); setTestResult('');
    try { const result = await testWhatsApp(phoneNumber); setTestResult(result); notify('Test message accepted.'); }
    catch (error) { setTestResult(error.message); notify(error.message, 'error'); }
    finally { setTesting(false); }
  };
  const field = (label, key, type = 'text', help = '') => <label>{label}<input className={inputClass} type={type} value={form[key] || ''} onChange={event => setForm({ ...form, [key]: event.target.value })} />{help && <small>{help}</small>}</label>;
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="WhatsApp connection" description="Configure the provider used to send opted-in notifications." />
    {state.error ? <ErrorState message={state.error} retry={state.reload} /> : <div className="whatsapp-layout"><section className="settings-section"><div className="callout-warning"><ShieldCheck size={18} /><p>WhatsApp settings are stored on the application server and shared across admin devices. The API key is never returned after saving.</p></div><div className="settings-fields">{field('API base URL', 'url', 'url', 'Use waapi.hybridnet.in; a base path or full send-text endpoint is accepted.')}{field('Session ID', 'sessionId')}{field('API key', 'key', 'password', keyConfigured ? 'Leave blank to keep the saved API key.' : 'Enter the API key to connect this WhatsApp session.')}{field('Default template ID', 'tpl')}</div><button className={buttonClass} disabled={saving || state.loading} onClick={save}><Check size={16} />{saving ? 'Saving…' : 'Save WhatsApp settings'}</button></section>
      <section className="settings-section test-panel"><SectionHeading title="Send a test message" detail="This sends a real message from the configured WhatsApp session." /><label>Recipient mobile<input className={inputClass} type="tel" inputMode="numeric" maxLength={10} value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} placeholder="10-digit Indian mobile" /></label><button className={mutedButtonClass} disabled={testing || !keyConfigured} onClick={test}><Send size={16} />{testing ? 'Sending test…' : 'Send test message'}</button>{testResult && <p className={/error|http|hold|failed/i.test(testResult) ? 'form-error' : 'helper-note'}>{testResult}</p>}<p className="helper-note">Requests are proxied through the authenticated application server. Confirm the WhatsApp session is online and the recipient number is valid.</p></section>
    </div>}
  </div>;
}

function SettingsPage() {
  const state = useLoad('/admin/settings');
  const notify = useToast();
  const [minutes, setMinutes] = useState('30');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state.data) setMinutes(String(state.data.scrape_interval_min)); }, [state.data]);
  const save = async event => {
    event.preventDefault(); setBusy(true);
    try { const result = await api('/admin/settings/interval', 'PUT', { minutes: Number(minutes) }); setMinutes(String(result.minutes)); notify('Scraping schedule updated.'); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="page-stack"><PageHeader eyebrow="Administration" title="Scraper schedule" description="Set how often enabled sources are checked. Each source must have verified selectors before enabling it." />{state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} retry={state.reload} /> : <form className="settings-section schedule-form" onSubmit={save}><label>Run interval (minutes)<input className={inputClass} type="number" min="5" max="59" value={minutes} onChange={event => setMinutes(event.target.value)} required /></label><p className="helper-note">The scheduler supports intervals from 5 to 59 minutes. Scrapes still respect robots.txt and use a delay between pages.</p><button className={buttonClass} disabled={busy}>{busy ? 'Saving…' : 'Save schedule'}<Check size={16} /></button></form>}</div>;
}

const userLinks = [
  ['/', 'Overview', LayoutDashboard], ['/jobs', 'Government jobs', BriefcaseBusiness], ['/saved', 'Saved jobs', Bookmark],
  ['/categories', 'Categories', Filter], ['/notifications', 'Alert history', Bell], ['/preferences', 'Preferences', Settings2], ['/account', 'Your account', UserRound]
];
const adminLinks = [
  ['/admin', 'Overview', LayoutDashboard], ['/admin/jobs', 'Job notices', BriefcaseBusiness], ['/admin/categories', 'Categories', Filter],
  ['/admin/sources', 'Sources & scrapers', Building2], ['/admin/users', 'Users', Users], ['/admin/notifications', 'Notifications', Bell],
  ['/admin/whatsapp', 'WhatsApp setup', Send], ['/admin/templates', 'Templates', FileText], ['/admin/settings', 'Settings', Settings2]
];

function AppContent() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSignedIn = Boolean(token());
  const userRole = role();
  const adminMode = isSignedIn && userRole === 'admin';
  const account = useLoad(isSignedIn ? '/auth/me' : null);
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('govjobs_theme') === 'dark');
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('govjobs_theme', dark ? 'dark' : 'light'); }, [dark]);
  const logout = () => { localStorage.removeItem('tok'); navigate('/jobs', { replace: true }); window.location.reload(); };
  const protectedElement = element => isSignedIn ? element : <Navigate to="/login" replace />;
  const adminElement = element => adminMode ? element : <Navigate to={isSignedIn ? '/' : '/login'} replace />;
  const navigation = adminMode ? adminLinks : userLinks;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link className="brand-lockup app-brand" to={isSignedIn ? '/' : '/jobs'} onClick={() => setMobileOpen(false)}><span className="brand-mark"><Building2 size={20} /></span><span>GovJobs<span className="brand-dot">.</span></span></Link>
      <div className="workspace-label">{adminMode ? 'ADMIN WORKSPACE' : isSignedIn ? 'YOUR WORKSPACE' : 'RECRUITMENT BOARD'}</div>
      <nav className="side-nav">{navigation.map(([path, label, Icon]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
      {!isSignedIn && <div className="sidebar-signin"><p>Personalize your job board and save notices that interest you.</p><Link className={buttonClass} to="/login">Sign in <LogIn size={16} /></Link></div>}
      {isSignedIn && <div className="sidebar-bottom"><Link className="user-mini" to="/account"><span><UserRound size={18} /></span><div><strong>{account.data?.name || (adminMode ? 'Administrator' : 'Your account')}</strong><small>{account.data?.email || (adminMode ? 'Admin access' : 'Job seeker')}</small></div></Link><button className="side-link logout-link" onClick={logout}><LogOut size={17} /><span>Sign out</span></button></div>}
    </aside>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div className="main-shell"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={19} /></button><div className="breadcrumb"><span>{adminMode ? 'Administration' : 'Recruitment board'}</span><ArrowRight size={13} /><strong>India</strong></div><div className="topbar-actions">{adminMode && <span className="service-status"><span />MongoDB connected</span>}{isSignedIn && <UserMenu account={account.data} onLogout={logout} />}<button className="icon-button theme-button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>{!isSignedIn && <Link className="top-signin" to="/login">Sign in <ArrowRight size={15} /></Link>}</div></header>
      <main className="main-content"><Routes>
        <Route path="/" element={isSignedIn ? adminMode ? <AdminDashboard /> : <DashboardPage /> : <JobsPage />} />
        <Route path="/login" element={isSignedIn ? <Navigate to="/" replace /> : <AuthPage initialMode="login" />} />
        <Route path="/register" element={isSignedIn ? <Navigate to="/" replace /> : <AuthPage initialMode="register" />} />
        <Route path="/jobs" element={<JobsPage />} /><Route path="/jobs/:id" element={<JobDetailPage />} /><Route path="/categories" element={<CategoriesPage />} />
        <Route path="/saved" element={protectedElement(<SavedJobsPage />)} /><Route path="/preferences" element={protectedElement(<PreferencesPage />)} /><Route path="/account" element={protectedElement(<AccountPage />)} /><Route path="/notifications" element={protectedElement(<NotificationsPage />)} />
        <Route path="/admin" element={adminElement(<AdminDashboard />)} /><Route path="/admin/jobs" element={adminElement(<AdminJobsPage />)} /><Route path="/admin/categories" element={adminElement(<AdminCategoriesPage />)} />
        <Route path="/admin/sources" element={adminElement(<AdminSourcesPage />)} /><Route path="/admin/users" element={adminElement(<AdminUsersPage />)} /><Route path="/admin/notifications" element={adminElement(<NotificationsPage adminMode />)} />
        <Route path="/admin/whatsapp" element={adminElement(<WhatsAppSettingsPage />)} /><Route path="/admin/templates" element={adminElement(<TemplatesPage />)} /><Route path="/admin/settings" element={adminElement(<SettingsPage />)} />
        <Route path="*" element={<Navigate to={isSignedIn ? '/' : '/jobs'} replace />} />
      </Routes></main>
      <footer className="app-footer"><span>GovJobs Alerts</span><span>Verify eligibility and deadlines against the official notification.</span></footer>
    </div>
  </div>;
}

export default function AppShell() {
  return <ToastProvider><AppContent /></ToastProvider>;
}