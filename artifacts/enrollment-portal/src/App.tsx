import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Check, CheckCircle2,
  ChevronDown, CircleHelp, FileCheck2, FileText, Headphones, Home, LifeBuoy,
  LockKeyhole, LogOut, Menu, MessageCircle, Search, ShieldCheck,
} from 'lucide-react';
import {
  getGetApplicationQueryKey, getGetApplicantSummaryQueryKey,
  getListApplicationsForReviewQueryKey, getListMyApplicationsQueryKey,
  getListMySupportTicketsQueryKey, getListSupportTicketsForAdminQueryKey,
  useCreateApplication, useCreateSupportTicket, useDecideApplication,
  useGetApplication, useGetApplicantSummary, useListApplicationsForReview,
  useListEnrollmentCategories, useListMyApplications, useListMySupportTickets,
  useListSupportTicketsForAdmin, useReplyToSupportTicket, useSubmitApplication,
  useUpdateApplication,
} from '@workspace/api-client-react';
import type {
  ApplicationDecision, EnrollmentApplication, EnrollmentCategory, SupportTicket,
} from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#174d80',
    colorForeground: '#19324d',
    colorMutedForeground: '#68798b',
    colorDanger: '#b73535',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#19324d',
    colorNeutral: '#d5dee7',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-semibold tracking-tight text-[#19324d]',
    headerSubtitle: 'text-[#68798b]',
    formFieldLabel: 'font-medium text-[#29435c]',
    formFieldInput: 'rounded-xl border-[#d5dee7] shadow-none',
    formButtonPrimary: 'rounded-xl bg-[#174d80] hover:bg-[#103e69]',
    footerActionLink: 'font-semibold text-[#174d80]',
  },
};

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`brand-lockup ${inverse ? 'brand-inverse' : ''}`} data-testid="brand-lockup">
      <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span>
      <span className="brand-name">Civic<span>Enroll</span></span>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, kind = 'button', testId, quiet = false }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; kind?: 'button' | 'submit';
  testId: string; quiet?: boolean;
}) {
  return (
    <button type={kind} onClick={onClick} disabled={disabled} data-testid={testId}
      className={`button ${quiet ? 'button-quiet' : 'button-primary'} ${disabled ? 'button-disabled' : ''}`}>
      {children}
    </button>
  );
}

function LoadingPanel({ label = 'Loading your information' }: { label?: string }) {
  return (
    <div className="loading-panel" role="status" aria-label={label} data-testid="state-loading">
      <div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-card" /><div className="skeleton skeleton-card short" />
    </div>
  );
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <section className="state-card" role="alert" data-testid="state-error">
    <span className="state-icon error-icon"><Activity size={19} /></span>
    <h2>We couldn’t load this view</h2><p>{message}</p>
    <button className="text-action" onClick={retry} data-testid="button-retry">Try again <ArrowRight size={15} /></button>
  </section>;
}

function EmptyPanel({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <section className="empty-panel" data-testid="state-empty">
    <span className="empty-icon"><FileText size={22} /></span><h3>{title}</h3><p>{message}</p>{action}
  </section>;
}

function StatusPill({ status, testId }: { status: string; testId?: string }) {
  const label = status.replaceAll('_', ' ');
  return <span className={`status-pill status-${status}`} data-testid={testId ?? `status-${status}-current`}>{label}</span>;
}

function AppFrame({ children, active = 'dashboard' }: { children: ReactNode; active?: string }) {
  const { signOut } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setLocation] = useLocation();
  const links = [
    { label: 'Overview', href: '/dashboard', key: 'dashboard', icon: Home },
    { label: 'Applications', href: '/dashboard', key: 'applications', icon: FileCheck2 },
    { label: 'Support', href: '/support', key: 'support', icon: LifeBuoy },
  ];
  return (
    <div className="app-shell portal-frame">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand"><Brand inverse /></div>
        <div className="workspace-label">APPLICANT PORTAL</div>
        <nav className="side-nav" aria-label="Applicant navigation">
          {links.map(({ label, href, key, icon: Icon }) => (
            <Link href={href} key={key} onClick={() => { setMenuOpen(false); if (key === 'applications') setLocation('/dashboard'); }}
              className={`nav-link ${active === key ? 'nav-link-active' : ''}`} data-testid={`link-nav-${key}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><LockKeyhole size={17} /><div><b>Your information is protected</b><span>Secure application workspace</span></div></div>
          <button className="nav-link signout-link" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">
            <LogOut size={18} /><span>Sign out</span>
          </button>
        </div>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} data-testid="button-close-menu" />}
      <div className="main-column">
        <div className="compact-bar">
          <button className="menu-trigger" aria-label="Open menu" onClick={() => setMenuOpen(true)} data-testid="button-open-menu"><Menu size={20} /></button>
          <Brand />
          <Link href="/support" className="compact-help" data-testid="link-compact-support"><CircleHelp size={18} /></Link>
        </div>
        <main className="page-content portal-scroll">{children}</main>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="page-heading rise">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}
  </div>;
}

function PublicLanding() {
  const { isLoaded, isSignedIn } = useAuth();
  const categories = useListEnrollmentCategories();
  return (
    <main className="landing portal-frame">
      <section className="landing-copy">
        <Brand />
        <div className="landing-content rise">
          <div className="eyebrow"><span className="eyebrow-rule" />A clearer way forward</div>
          <h1>One application.<br /><em>A confident next step.</em></h1>
          <p className="landing-lede">Choose the enrollment path that fits you, complete your application at your own pace, and follow every decision in one secure place.</p>
          <div className="landing-actions">
            <Link href={isLoaded && isSignedIn ? '/dashboard' : '/sign-up'} className="button button-primary" data-testid="link-get-started">
              Begin enrollment <ArrowRight size={17} />
            </Link>
            <Link href={isLoaded && isSignedIn ? '/dashboard' : '/sign-in'} className="text-action" data-testid="link-sign-in">
              {isLoaded && isSignedIn ? 'Open your dashboard' : 'Already have an account? Sign in'}
            </Link>
          </div>
          <div className="landing-assurances">
            <div><span className="assurance-icon"><LockKeyhole size={16} /></span><span><b>Private by design</b><small>Your details stay protected</small></span></div>
            <div><span className="assurance-icon"><Activity size={16} /></span><span><b>Know where you stand</b><small>Track review status clearly</small></span></div>
          </div>
        </div>
        <div className="landing-bottom"><span>ENROLLMENT SERVICES</span><span>Secure access · Clear updates</span></div>
      </section>
      <section className="landing-art" aria-label="Enrollment process overview">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="art-vertical-label">A STEADY PROCESS, FROM START TO DECISION</div>
        <div className="art-topline"><span>YOUR APPLICATION JOURNEY</span><span className="live-dot">PORTAL OPEN</span></div>
        <div className="journey-card">
          <div className="journey-label"><span>APPLICATION PATH</span><span className="journey-index">01 — 03</span></div>
          <div className="journey-title">Clear steps.<br />Considered decisions.</div>
          <div className="journey-timeline">
            <div className="journey-step done"><span className="timeline-point"><Check size={13} /></span><div><b>Choose your path</b><small>Start with the right enrollment</small></div></div>
            <div className="journey-step active"><span className="timeline-point"><span /></span><div><b>Complete your application</b><small>Save progress as you go</small></div></div>
            <div className="journey-step"><span className="timeline-point" /><div><b>Receive a decision</b><small>Follow updates in your portal</small></div></div>
          </div>
          <div className="journey-card-foot"><ShieldCheck size={16} /> A secure space for important details</div>
        </div>
        <div className="art-bottomline"><span>DESIGNED FOR CLARITY</span><span>01 / 03</span></div>
      </section>
    </main>
  );
}

function AuthPage({ mode }: { mode: 'in' | 'up' }) {
  return <main className="auth-page portal-frame">
    <div className="auth-brand"><Brand /><span>SECURE ENROLLMENT PORTAL</span></div>
    <div className="auth-canvas">
      <div className="auth-intro"><div className="eyebrow">A thoughtful process starts here</div><h1>{mode === 'in' ? 'Welcome back.' : 'Let’s get started.'}</h1>
        <p>{mode === 'in' ? 'Your application and its latest updates are waiting in your secure workspace.' : 'Create a secure account to begin and return to your application whenever you need.'}</p>
        <div className="auth-security"><LockKeyhole size={17} /><span>Protected access for your enrollment journey</span></div></div>
      <div className="auth-widget">
        {mode === 'in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> :
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}
      </div>
    </div>
  </main>;
}

function SignedOutNotice() {
  return <main className="signedout-page portal-frame"><Brand /><div className="signedout-card">
    <span className="state-icon"><LockKeyhole size={21} /></span><div className="eyebrow">SECURE ACCESS</div>
    <h1>Sign in to continue</h1><p>Your application workspace is private. Sign in to view or manage your enrollment.</p>
    <Link href="/sign-in" className="button button-primary" data-testid="link-auth-sign-in">Continue to sign in <ArrowRight size={16} /></Link>
  </div></main>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="portal-frame auth-loading"><LoadingPanel label="Checking secure access" /></main>;
  return isSignedIn ? <>{children}</> : <SignedOutNotice />;
}

function Dashboard() {
  const summary = useGetApplicantSummary();
  const applications = useListMyApplications();
  const categories = useListEnrollmentCategories();
  const create = useCreateApplication();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [createError, setCreateError] = useState('');
  const palette = ['#2dad5d', '#244fc7', '#1198d2', '#ffffff'];
  const iconColors = ['#168341', '#244fc7', '#087eaf', '#174d80'];

  const begin = (category: EnrollmentCategory) => {
    setCreateError('');
    create.mutate({ data: { categoryId: category.id } }, {
      onSuccess: (application) => {
        queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
        setLocation(`/apply/${application.id}`);
      },
      onError: () => setCreateError('We could not start a draft just now. Please try again.'),
    });
  };
  const busy = summary.isLoading || applications.isLoading || categories.isLoading;
  const failure = summary.isError || applications.isError || categories.isError;
  return <AppFrame active="dashboard">
    <div className="dashboard-layout">
      <div className="dashboard-main">
        <PageHeading eyebrow="YOUR ENROLLMENT" title="A good place to begin." detail="Choose one enrollment path to start your application." />
        {failure ? <ErrorPanel message="Your enrollment information is temporarily unavailable." retry={() => { void summary.refetch(); void applications.refetch(); void categories.refetch(); }} /> :
          busy ? <LoadingPanel /> : <>
            <section className="selection-section rise-delay">
              <div className="section-line"><div><h2>Select an enrollment path</h2><p>Choose the option that best matches your application.</p></div><span className="step-indicator">STEP 01 <i>/ 03</i></span></div>
              <div className="category-grid">
                {(categories.data ?? []).slice(0, 4).map((category, index) => (
                  <button type="button" key={category.id} disabled={create.isPending} onClick={() => begin(category)}
                    className={`category-card category-${index + 1}`} style={{ '--category-tone': palette[index] } as CSSProperties & { '--category-tone': string }}
                    data-testid={`card-category-${category.id}`}>
                    <span className="category-number">0{index + 1}</span>
                    <span className="category-symbol" style={{ color: iconColors[index] }}><FileCheck2 size={22} strokeWidth={1.75} /></span>
                    <span className="category-title">{category.name}</span>
                    <span className="category-description">{category.description}</span>
                    <span className="category-select">{create.isPending ? 'Starting…' : 'Select path'} <ArrowUpRight size={15} /></span>
                  </button>
                ))}
              </div>
              {categories.data?.length === 0 && <EmptyPanel title="Enrollment paths are unavailable" message="Please return later or contact support for help." />}
              {createError && <p className="inline-error" role="alert" data-testid="text-create-error">{createError}</p>}
            </section>
            <section className="recent-section">
              <div className="section-line"><div><h2>Recent applications</h2><p>Your saved and submitted work in one place.</p></div><Link href="/dashboard" className="subtle-link" data-testid="link-all-applications">View all <ArrowRight size={14} /></Link></div>
              {(applications.data ?? []).length === 0 ? <EmptyPanel title="Your application list is clear" message="Choose an enrollment path above to create your first draft." /> :
                <div className="application-list">{(applications.data ?? []).slice(0, 3).map((app) => <ApplicationRow key={app.id} application={app} />)}</div>}
            </section>
          </>}
      </div>
      <aside className="dashboard-aside">
        <div className="summary-card">
          <div className="summary-head"><span className="summary-label">YOUR OVERVIEW</span><Activity size={17} /></div>
          {summary.isLoading ? <div className="summary-skeleton"><div /><div /><div /></div> : summary.data ? <>
            <div className="summary-total" data-testid="text-summary-total">{summary.data.total}<span> applications</span></div>
            <div className="summary-list">
              <SummaryLine label="Drafts" value={summary.data.drafts} tone="slate" />
              <SummaryLine label="In review" value={summary.data.inReview} tone="blue" />
              <SummaryLine label="Approved" value={summary.data.approved} tone="green" />
              <SummaryLine label="Needs attention" value={summary.data.needsAttention} tone="amber" />
            </div>
          </> : <p className="summary-note">Summary is not available right now.</p>}
          <div className="summary-foot">Updated when your application changes</div>
        </div>
        <div className="help-card"><div className="help-icon"><Headphones size={18} /></div><div><b>Need a hand?</b><p>Our support team can help you along the way.</p><Link href="/support" className="text-action" data-testid="link-dashboard-support">Visit support <ArrowRight size={14} /></Link></div></div>
        <div className="aside-note"><ShieldCheck size={16} /><span>Secure, private, and always in your control.</span></div>
      </aside>
    </div>
  </AppFrame>;
}

function SummaryLine({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="summary-line" data-testid={`summary-${tone}`}><span><i className={`summary-dot ${tone}`} />{label}</span><b>{value}</b></div>;
}

function ApplicationRow({ application }: { application: EnrollmentApplication }) {
  const href = application.status === 'draft' ? `/apply/${application.id}` : `/applications/${application.id}`;
  return <Link href={href} className="application-row" data-testid={`row-application-${application.id}`}>
    <span className="application-file"><FileText size={18} /></span>
    <span className="application-row-main"><b>{application.categoryName}</b><small>{application.reference} <span>·</span> Updated {formatDate(application.updatedAt)}</small></span>
      <StatusPill status={application.status} testId={`status-application-${application.id}`} /><ArrowRight className="row-arrow" size={16} />
  </Link>;
}

function formatDate(date?: string | null) {
  if (!date) return '—';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function DraftApplication() {
  const params = useParams<{ applicationId?: string }>();
  const id = params.applicationId ?? '';
  const app = useGetApplication(id, { query: { enabled: !!id, queryKey: getGetApplicationQueryKey(id) } });
  const update = useUpdateApplication();
  const submit = useSubmitApplication();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [context, setContext] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const application = app.data;
  if (app.isLoading) return <AppFrame><LoadingPanel /></AppFrame>;
  if (app.isError || !application) return <AppFrame><ErrorPanel message="This application could not be found or opened." retry={() => void app.refetch()} /></AppFrame>;
  if (application.status !== 'draft') return <AppFrame><section className="state-card"><span className="state-icon"><FileCheck2 size={20} /></span><h2>This application has already been submitted</h2><p>Its current status and any updates are available in the application detail view.</p><Link href={`/applications/${id}`} className="button button-primary" data-testid="link-open-submitted">View application <ArrowRight size={15} /></Link></section></AppFrame>;
  const activeStep = step ?? (application.currentStep > 1 ? 1 : 0);
  const answerValue = context ?? String(application.answers?.additionalContext ?? '');
  const save = () => {
    setFeedback('');
    update.mutate({ applicationId: id, data: { currentStep: activeStep + 1, answers: { ...application.answers, additionalContext: answerValue } } }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(getGetApplicationQueryKey(id), saved);
        queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
        setFeedback('Progress saved');
      },
      onError: () => setFeedback('We could not save your changes. Please try again.'),
    });
  };
  const submitDraft = () => {
    submit.mutate({ applicationId: id }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(getGetApplicationQueryKey(id), saved);
        queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
        setLocation(`/applications/${id}`);
      },
      onError: () => setFeedback('Your application was not submitted. Please try again.'),
    });
  };
  return <AppFrame>
    <div className="form-page">
      <div className="form-top"><Link href="/dashboard" className="back-link" data-testid="link-back-dashboard"><ArrowLeft size={16} /> Dashboard</Link>
        <span className="draft-reference">{application.reference}</span></div>
      <div className="form-heading"><div className="eyebrow">APPLICATION · {application.categoryName}</div><h1>Let’s complete your application.</h1><p>Your progress is saved to your secure account. You can return any time before submitting.</p></div>
      <div className="progress-track" aria-label={`Step ${activeStep + 1} of 2`} data-testid="progress-application">
        {[0, 1].map((n) => <div className={`progress-step ${n <= activeStep ? 'progress-current' : ''}`} key={n}><span>{n < activeStep ? <Check size={13} /> : `0${n + 1}`}</span><b>{n === 0 ? 'Application details' : 'Review & submit'}</b></div>)}
      </div>
      <div className="form-workspace portal-scroll">
        {activeStep === 0 ? <section className="form-card">
          <div className="form-card-heading"><span className="form-card-icon"><FileText size={18} /></span><div><h2>Application details</h2><p>There are no category-specific questions configured yet.</p></div></div>
          <label className="field-label" htmlFor="application-context">Additional context <span>Optional</span></label>
          <textarea id="application-context" rows={5} value={answerValue} onChange={(event) => setContext(event.target.value)}
            placeholder="Add any context you would like included with your application." className="text-input form-textarea" data-testid="input-application-context" />
          <div className="field-help">You can edit this note before submitting. No documents or live video are collected here.</div>
          <div className="disabled-storage" aria-disabled="true" data-testid="disabled-storage-placeholder"><LockKeyhole size={16} /><span><b>Document and live-video storage</b><small>Not currently available in this portal</small></span><span className="disabled-tag">Unavailable</span></div>
          <div className="form-actions"><span className="save-status" role="status" data-testid="text-save-status">{feedback}</span>
            <PrimaryButton onClick={save} disabled={update.isPending} testId="button-save-progress">{update.isPending ? 'Saving…' : 'Save progress'}</PrimaryButton>
            <PrimaryButton onClick={() => { setStep(1); setFeedback(''); }} testId="button-next-step">Continue <ArrowRight size={16} /></PrimaryButton>
          </div>
        </section> : <section className="form-card review-card">
          <div className="form-card-heading"><span className="form-card-icon"><BadgeCheck size={18} /></span><div><h2>Review your application</h2><p>Check your enrollment path and optional context before submitting.</p></div></div>
          <div className="review-field"><span>Enrollment path</span><b>{application.categoryName}</b></div>
          <div className="review-field"><span>Application reference</span><b className="mono">{application.reference}</b></div>
          <div className="review-field review-context"><span>Additional context</span><b>{answerValue.trim() || 'No additional context provided'}</b></div>
          <div className="review-callout"><ShieldCheck size={18} /><p>Once submitted, your application enters review. You’ll be able to follow its status from your dashboard.</p></div>
          {feedback && <p className="inline-error" role="alert" data-testid="text-submit-feedback">{feedback}</p>}
          <div className="form-actions"><button className="text-action" onClick={() => setStep(0)} data-testid="button-edit-application"><ArrowLeft size={15} /> Back to details</button>
            <PrimaryButton onClick={submitDraft} disabled={submit.isPending} testId="button-submit-application">{submit.isPending ? 'Submitting…' : 'Submit application'} <ArrowRight size={15} /></PrimaryButton>
          </div>
        </section>}
      </div>
    </div>
  </AppFrame>;
}

function ApplicationDetail() {
  const params = useParams<{ applicationId?: string }>();
  const id = params.applicationId ?? '';
  const app = useGetApplication(id, { query: { enabled: !!id, queryKey: getGetApplicationQueryKey(id) } });
  if (app.isLoading) return <AppFrame><LoadingPanel /></AppFrame>;
  if (app.isError || !app.data) return <AppFrame><ErrorPanel message="We could not retrieve this application." retry={() => void app.refetch()} /></AppFrame>;
  const record = app.data;
  return <AppFrame>
    <div className="detail-page">
      <Link href="/dashboard" className="back-link" data-testid="link-detail-back"><ArrowLeft size={16} /> Your applications</Link>
      <section className="detail-hero">
        <div className="detail-meta"><span className="eyebrow">APPLICATION RECORD</span><StatusPill status={record.status} testId={`status-detail-${record.id}`} /></div>
        <h1>{record.categoryName}</h1><p className="mono detail-reference">{record.reference}</p>
        <div className="detail-created">Last updated {formatDate(record.updatedAt)}</div>
      </section>
      <div className="detail-grid">
        <section className="detail-card"><div className="detail-card-title"><Activity size={17} /><h2>Verification progress</h2></div>
          <div className="status-timeline">
            <div className={`status-event complete`}><span><Check size={13} /></span><div><b>Application created</b><small>{formatDate(record.createdAt)}</small></div></div>
            <div className={`status-event ${record.status !== 'draft' ? 'complete' : 'current'}`}><span>{record.status !== 'draft' ? <Check size={13} /> : <span />}</span><div><b>Submitted for review</b><small>{record.submittedAt ? formatDate(record.submittedAt) : 'Not yet submitted'}</small></div></div>
            <div className={`status-event ${['approved', 'rejected', 'needs_information'].includes(record.status) ? 'complete' : ''}`}><span>{['approved', 'rejected', 'needs_information'].includes(record.status) ? <Check size={13} /> : null}</span><div><b>Verification decision</b><small>{record.status === 'under_review' || record.status === 'submitted' ? 'Review in progress' : record.status.replaceAll('_', ' ')}</small></div></div>
          </div>
          {record.reviewNote && <div className="review-note"><b>Update from the review team</b><p>{record.reviewNote}</p></div>}
          {record.status === 'draft' && <Link href={`/apply/${record.id}`} className="button button-primary" data-testid="link-continue-draft">Continue application <ArrowRight size={15} /></Link>}
        </section>
        <section className="detail-card detail-help"><span className="help-icon"><MessageCircle size={18} /></span><h2>Questions about this application?</h2><p>Send a note to the support team and follow the reply here.</p><Link href="/support" className="text-action" data-testid="link-detail-support">Contact support <ArrowRight size={14} /></Link></section>
      </div>
    </div>
  </AppFrame>;
}

function SupportPage() {
  const tickets = useListMySupportTickets();
  const applications = useListMyApplications();
  const create = useCreateSupportTicket();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [notice, setNotice] = useState('');
  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 5;
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setNotice('');
    create.mutate({ data: { subject: subject.trim(), message: message.trim(), applicationId: applicationId || null } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMySupportTicketsQueryKey() });
        setSubject(''); setMessage(''); setApplicationId('');
        setNotice('Your support request has been sent.');
      },
      onError: () => setNotice('Your request could not be sent. Please try again.'),
    });
  };
  return <AppFrame active="support">
    <div className="support-page">
      <PageHeading eyebrow="APPLICANT SUPPORT" title="We’re here to help." detail="Send a secure message about your enrollment or an application." />
      <div className="support-grid">
        <section className="support-form-card">
          <div className="form-card-heading"><span className="form-card-icon"><MessageCircle size={18} /></span><div><h2>Send a message</h2><p>Replies will appear in your support history.</p></div></div>
          <form onSubmit={send} className="support-form">
            <label className="field-label" htmlFor="support-subject">Subject</label>
            <input id="support-subject" className="text-input" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={200} required placeholder="What can we help with?" data-testid="input-support-subject" />
            <label className="field-label" htmlFor="support-application">Related application <span>Optional</span></label>
            <select id="support-application" className="text-input select-input" value={applicationId} onChange={(e) => setApplicationId(e.target.value)} data-testid="select-support-application">
              <option value="">No application selected</option>{(applications.data ?? []).map((application) => <option key={application.id} value={application.id}>{application.reference} · {application.categoryName}</option>)}
            </select>
            <label className="field-label" htmlFor="support-message">Message</label>
            <textarea id="support-message" className="text-input form-textarea support-message-input" value={message} onChange={(e) => setMessage(e.target.value)} minLength={5} maxLength={5000} required placeholder="Tell us a little more so we can help." data-testid="input-support-message" />
            <div className="support-form-end"><span className="save-status" role="status" data-testid="text-support-feedback">{notice}</span><PrimaryButton kind="submit" disabled={!canSubmit || create.isPending} testId="button-send-support">{create.isPending ? 'Sending…' : 'Send message'} <ArrowRight size={15} /></PrimaryButton></div>
          </form>
        </section>
        <section className="ticket-history">
          <div className="section-line"><div><h2>Your support history</h2><p>Messages and replies from the team.</p></div></div>
          {tickets.isLoading ? <LoadingPanel /> : tickets.isError ? <ErrorPanel message="Support history is temporarily unavailable." retry={() => void tickets.refetch()} /> :
            (tickets.data ?? []).length === 0 ? <EmptyPanel title="No messages yet" message="Your support conversations will appear here." /> :
              <div className="ticket-list">{(tickets.data ?? []).map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}</div>}
        </section>
      </div>
    </div>
  </AppFrame>;
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  return <article className="ticket-card" data-testid={`ticket-${ticket.id}`}>
    <div className="ticket-head"><span className="ticket-subject">{ticket.subject}</span><StatusPill status={ticket.status} testId={`status-ticket-${ticket.id}`} /></div>
    <div className="ticket-date">Opened {formatDate(ticket.createdAt)}</div>
    <p className="ticket-message">{ticket.message}</p>
    {ticket.response && <div className="ticket-response"><b>Reply from support</b><p>{ticket.response}</p></div>}
  </article>;
}

function AdminShell({ children, active = 'review' }: { children: ReactNode; active?: string }) {
  const { signOut } = useClerk();
  return <div className="admin-shell portal-frame">
    <aside className="admin-sidebar"><div className="sidebar-brand"><Brand inverse /></div><div className="workspace-label">STAFF WORKSPACE</div>
      <nav className="side-nav" aria-label="Staff navigation">
        <Link href="/admin" className={`nav-link ${active === 'review' ? 'nav-link-active' : ''}`} data-testid="link-admin-review"><FileCheck2 size={18} /><span>Review queue</span></Link>
        <Link href="/admin/support" className={`nav-link ${active === 'support' ? 'nav-link-active' : ''}`} data-testid="link-admin-support"><Headphones size={18} /><span>Support inbox</span></Link>
      </nav>
      <div className="sidebar-bottom"><div className="privacy-note"><LockKeyhole size={17} /><div><b>Restricted workspace</b><span>Access verified by service</span></div></div>
        <button className="nav-link signout-link" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-admin-signout"><LogOut size={18} /><span>Sign out</span></button>
      </div>
    </aside>
    <main className="admin-content portal-scroll">{children}</main>
  </div>;
}

function AdminGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="portal-frame auth-loading"><LoadingPanel label="Checking staff access" /></main>;
  if (!isSignedIn) return <SignedOutNotice />;
  return <>{children}</>;
}

function AdminQueue() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const filters = useMemo(() => ({ ...(status ? { status: status as 'submitted' | 'under_review' | 'needs_information' | 'approved' | 'rejected' } : {}), ...(search.trim() ? { search: search.trim() } : {}) }), [status, search]);
  const review = useListApplicationsForReview(filters);
  const records = review.data ?? [];
  if (review.isError) return <AdminShell><AccessError retry={() => void review.refetch()} /></AdminShell>;
  return <AdminShell>
    <div className="admin-page">
      <PageHeading eyebrow="SECURE STAFF WORKSPACE" title="Review queue" detail="Review submitted applications and record a decision." action={<div className="server-access"><span className="server-dot" /> Service access</div>} />
      <div className="admin-toolbar">
        <label className="searchbox"><Search size={17} /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference or applicant" aria-label="Search applications" data-testid="input-review-search" /><span className="search-shortcut">⌘ K</span></label>
        <label className="filter-select"><span className="sr-only">Filter by status</span><select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-review-status">
          <option value="">All statuses</option><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="needs_information">Needs information</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select><ChevronDown size={15} /></label>
      </div>
      <section className="queue-card">
        <div className="queue-card-head"><div><b>Applications</b><span>Authorized review records</span></div><span className="queue-count" data-testid="text-review-count">{review.isLoading ? '…' : records.length}</span></div>
        {review.isLoading ? <LoadingPanel label="Loading review applications" /> : records.length === 0 ?
          <EmptyPanel title={search || status ? 'No matching applications' : 'The review queue is clear'} message={search || status ? 'Try adjusting your search or status filter.' : 'New submitted applications will appear here.'} /> :
          <div className="queue-list">{records.map((application) => <Link href={`/admin/applications/${application.id}`} className="queue-row" key={application.id} data-testid={`row-review-${application.id}`}>
            <span className="queue-file"><FileCheck2 size={18} /></span><span className="queue-info"><b>{application.categoryName}</b><small>{application.applicantName || 'Applicant'} · {application.reference} · {formatDate(application.submittedAt)}</small></span>
            <StatusPill status={application.status} testId={`status-review-${application.id}`} /><ArrowRight size={16} className="row-arrow" />
          </Link>)}</div>}
      </section>
      <p className="admin-disclaimer"><ShieldCheck size={15} /> Decisions are recorded by the service and reflected in the applicant’s portal.</p>
    </div>
  </AdminShell>;
}

function AccessError({ retry }: { retry: () => void }) {
  return <section className="admin-access-error" data-testid="state-admin-access-error"><div className="access-seal"><LockKeyhole size={23} /></div><div className="eyebrow">STAFF ACCESS CHECK</div><h1>This workspace isn’t available</h1><p>The service did not authorize this staff view, or the queue could not be reached. Access is verified securely by the server.</p><button className="button button-quiet" onClick={retry} data-testid="button-retry-admin">Check access again <ArrowRight size={15} /></button><Link href="/" className="text-action" data-testid="link-admin-home">Return to portal</Link></section>;
}

function AdminApplicationReview() {
  const params = useParams<{ applicationId?: string }>();
  const id = params.applicationId ?? '';
  const review = useListApplicationsForReview({});
  const decide = useDecideApplication();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  if (review.isLoading) return <AdminShell><LoadingPanel /></AdminShell>;
  if (review.isError) return <AdminShell><AccessError retry={() => void review.refetch()} /></AdminShell>;
  const application = (review.data ?? []).find((item) => item.id === id);
  if (!application) return <AdminShell><section className="state-card"><span className="state-icon"><FileText size={20} /></span><h2>Application not in this review queue</h2><p>It may have changed status or may not be available to this staff account.</p><Link href="/admin" className="button button-primary" data-testid="link-back-review">Back to review queue</Link></section></AdminShell>;
  const makeDecision = (decision: ApplicationDecision['decision']) => {
    setError('');
    decide.mutate({ applicationId: id, data: { decision, ...(note.trim() ? { note: note.trim() } : {}) } }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(getListApplicationsForReviewQueryKey({}), (old) => old?.map((item) => item.id === saved.id ? saved : item));
        queryClient.invalidateQueries({ queryKey: getListApplicationsForReviewQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApplicationQueryKey(id) });
        setNote('');
        setError(`Decision recorded: ${saved.status.replaceAll('_', ' ')}.`);
      },
      onError: () => setError('The service could not record this decision. Please try again.'),
    });
  };
  return <AdminShell>
    <div className="admin-review-page">
      <Link href="/admin" className="back-link" data-testid="link-review-back"><ArrowLeft size={16} /> Review queue</Link>
      <div className="review-title-row"><div><div className="eyebrow">APPLICATION REVIEW</div><h1>{application.categoryName}</h1><p className="mono">{application.reference}</p></div><StatusPill status={application.status} testId={`status-review-detail-${application.id}`} /></div>
      <div className="review-detail-grid">
        <section className="detail-card applicant-record">
          <div className="detail-card-title"><FileText size={17} /><h2>Applicant record</h2></div>
          <div className="review-field"><span>Applicant</span><b>{application.applicantName || 'Not provided'}</b></div>
          <div className="review-field"><span>Email</span><b>{application.applicantEmail || 'Not provided'}</b></div>
          <div className="review-field"><span>Created</span><b>{formatDate(application.createdAt)}</b></div>
          <div className="review-field"><span>Submitted</span><b>{formatDate(application.submittedAt)}</b></div>
          <div className="review-field review-context"><span>Additional context</span><b>{String(application.answers?.additionalContext ?? 'No additional context provided')}</b></div>
          {application.reviewNote && <div className="review-note"><b>Previous review note</b><p>{application.reviewNote}</p></div>}
        </section>
        <section className="decision-card">
          <div className="decision-head"><span className="decision-icon"><BadgeCheck size={19} /></span><div><h2>Record a decision</h2><p>This update will be visible to the applicant.</p></div></div>
          <label className="field-label" htmlFor="decision-note">Decision note <span>Optional</span></label>
          <textarea id="decision-note" className="text-input form-textarea decision-note" rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for the applicant, if needed." data-testid="input-decision-note" />
          {error && <p className={error.startsWith('Decision recorded') ? 'success-message' : 'inline-error'} role="status" data-testid="text-decision-feedback">{error}</p>}
          <div className="decision-actions">
            <button className="decision-button approve" onClick={() => makeDecision('approve')} disabled={decide.isPending} data-testid="button-decision-approve"><CheckCircle2 size={16} /> Approve</button>
            <button className="decision-button request" onClick={() => makeDecision('request_information')} disabled={decide.isPending} data-testid="button-decision-request">Request information</button>
            <button className="decision-button reject" onClick={() => makeDecision('reject')} disabled={decide.isPending} data-testid="button-decision-reject">Reject</button>
          </div>
        </section>
      </div>
    </div>
  </AdminShell>;
}

function AdminSupport() {
  const tickets = useListSupportTicketsForAdmin();
  const reply = useReplyToSupportTicket();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  if (tickets.isError) return <AdminShell active="support"><AccessError retry={() => void tickets.refetch()} /></AdminShell>;
  const records = tickets.data ?? [];
  const activeTicket = records.find((ticket) => ticket.id === selected) ?? records[0];
  const respond = (ticket: SupportTicket, status: 'answered' | 'closed') => {
    const response = (drafts[ticket.id] ?? ticket.response ?? '').trim();
    if (!response) { setFeedback('Add a reply before updating this ticket.'); return; }
    setFeedback('');
    reply.mutate({ ticketId: ticket.id, data: { response, status } }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(getListSupportTicketsForAdminQueryKey(), (old) => old?.map((item) => item.id === saved.id ? saved : item));
        queryClient.invalidateQueries({ queryKey: getListSupportTicketsForAdminQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMySupportTicketsQueryKey() });
        setFeedback('Support ticket updated.');
      },
      onError: () => setFeedback('The reply could not be saved. Please try again.'),
    });
  };
  return <AdminShell active="support">
    <div className="support-admin-page">
      <PageHeading eyebrow="SECURE STAFF WORKSPACE" title="Support inbox" detail="Manage applicant messages and send a considered reply." />
      {tickets.isLoading ? <LoadingPanel /> : records.length === 0 ? <EmptyPanel title="No support messages" message="Applicant requests will appear in this inbox." /> :
        <div className="inbox-layout">
          <section className="inbox-list" aria-label="Support requests">
            <div className="inbox-list-head"><b>Messages</b><span>{records.length}</span></div>
            {records.map((ticket) => <button className={`inbox-ticket ${activeTicket?.id === ticket.id ? 'inbox-ticket-active' : ''}`} key={ticket.id} onClick={() => { setSelected(ticket.id); setFeedback(''); }} data-testid={`button-ticket-${ticket.id}`}>
              <span className="inbox-ticket-top"><b>{ticket.subject}</b><StatusPill status={ticket.status} testId={`status-inbox-${ticket.id}`} /></span><span>{ticket.message}</span><small>{formatDate(ticket.createdAt)}</small>
            </button>)}
          </section>
          {activeTicket && <section className="inbox-detail">
            <div className="inbox-detail-heading"><div><div className="eyebrow">APPLICANT MESSAGE</div><h2>{activeTicket.subject}</h2></div><StatusPill status={activeTicket.status} testId={`status-inbox-detail-${activeTicket.id}`} /></div>
            <div className="inbox-message"><span className="message-avatar">AP</span><div><div className="message-meta">Applicant <span>{formatDate(activeTicket.createdAt)}</span></div><p>{activeTicket.message}</p></div></div>
            {activeTicket.applicationId && <div className="related-application"><FileText size={15} /><span>Related application</span><span className="mono">{activeTicket.applicationId}</span></div>}
            {activeTicket.response && <div className="inbox-existing-reply"><b>Previous reply</b><p>{activeTicket.response}</p></div>}
            <label className="field-label" htmlFor="admin-reply">Your reply</label>
            <textarea id="admin-reply" className="text-input form-textarea admin-reply-input" maxLength={5000} value={drafts[activeTicket.id] ?? activeTicket.response ?? ''} onChange={(e) => setDrafts((prev) => ({ ...prev, [activeTicket.id]: e.target.value }))} placeholder="Write a clear, helpful response." data-testid="input-admin-reply" />
            {feedback && <p className="success-message" role="status" data-testid="text-reply-feedback">{feedback}</p>}
            <div className="reply-actions"><button className="button button-quiet" onClick={() => respond(activeTicket, 'closed')} disabled={reply.isPending} data-testid="button-close-ticket">Reply & close</button>
              <button className="button button-primary" onClick={() => respond(activeTicket, 'answered')} disabled={reply.isPending} data-testid="button-send-reply">{reply.isPending ? 'Saving…' : 'Send reply'} <ArrowRight size={15} /></button></div>
          </section>}
        </div>}
    </div>
  </AdminShell>;
}

function NotFound() {
  return <main className="not-found portal-frame"><div className="not-found-card"><Brand /><span className="not-found-code">404</span><h1>This page isn’t here.</h1><p>The address may have changed. Return to the enrollment portal to continue.</p><Link href="/" className="button button-primary" data-testid="link-not-found-home">Return to portal <ArrowRight size={15} /></Link></div></main>;
}

function RoutedPages() {
  const [, setLocation] = useLocation();
  return <Switch>
    <Route path="/" component={PublicLanding} />
    <Route path="/sign-in/*?" component={() => <AuthPage mode="in" />} />
    <Route path="/sign-up/*?" component={() => <AuthPage mode="up" />} />
    <Route path="/dashboard" component={() => <AuthGate><Dashboard /></AuthGate>} />
    <Route path="/apply/:applicationId" component={() => <AuthGate><DraftApplication /></AuthGate>} />
    <Route path="/applications/:applicationId" component={() => <AuthGate><ApplicationDetail /></AuthGate>} />
    <Route path="/support" component={() => <AuthGate><SupportPage /></AuthGate>} />
    <Route path="/admin" component={() => <AdminGate><AdminQueue /></AdminGate>} />
    <Route path="/admin/applications/:applicationId" component={() => <AdminGate><AdminApplicationReview /></AdminGate>} />
    <Route path="/admin/support" component={() => <AdminGate><AdminSupport /></AdminGate>} />
    <Route component={NotFound} />
  </Switch>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUser.current !== undefined && previousUser.current !== userId) client.clear();
      previousUser.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your account' } },
      signUp: { start: { title: 'Create your account', subtitle: 'Begin your enrollment securely' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><RoutedPages /></QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <WouterRouter base={basePath}><ClerkRoutes /></WouterRouter>;
}

export default App;
