import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Check, CheckCircle2,
  ChevronDown, CircleHelp, FileCheck2, FileText, Headphones, Home, LifeBuoy,
  LockKeyhole, LogOut, Menu, MessageCircle, Search, Settings, ShieldCheck,
} from 'lucide-react';
import {
  getGetApplicationQueryKey, getGetApplicantSummaryQueryKey,
  getGetAdminApplicationHistoryQueryKey, getGetAdminApplicationQueryKey,
  getGetAdminOverviewQueryKey,
  getGetPortalSettingsQueryKey,
  getListApplicationsForReviewQueryKey, getListMyApplicationsQueryKey,
  getListAdminUsersQueryKey, getListMySupportTicketsQueryKey, getListSupportTicketsForAdminQueryKey,
  useAddAdminApplicationNote, useAddApplicantSupportMessage, useAssignSupportTicket,
  useCreateApplication, useCreateSupportTicket, useDecideApplication,
  useGetAdminApplication, useGetAdminApplicationHistory, useGetAdminOverview,
  useGetApplication, useGetApplicantSummary, useListApplicationsForReview,
  useListAdminUsers, useListEnrollmentCategories, useListMyApplications, useListMySupportTickets,
  useListSupportTicketsForAdmin, useReplyToSupportTicket, useSubmitApplication,
  useUpdateAdminUserStatus, useUpdateApplication,
  useUpdateAdminUserRole, useGetPortalSettings, useUpdatePortalSettings,
} from '@workspace/api-client-react';
import type {
  AdminUser, ApplicationDecision, ApplicationEvent, EnrollmentApplication, EnrollmentCategory, PortalSettings, SupportTicket,
} from '@workspace/api-client-react';
import { CategoryEntryForm, type CategoryEntryAnswers } from './components/CategoryEntryForm';
import { EnrollmentWizard } from './components/EnrollmentWizard';
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
  const labels: Record<string, string> = {
    draft: 'Draft',
    in_progress: 'In Progress',
    submitted: 'Pending Review',
    under_review: 'Under Review',
    needs_information: 'Additional Information Required',
    approved: 'Approved',
    rejected: 'Rejected',
    open: 'Open',
    answered: 'In Progress',
    closed: 'Resolved',
    resolved: 'Resolved',
  };
  return <span className={`status-pill status-${status}`} data-testid={testId ?? `status-${status}-current`}>{labels[status] ?? status.replaceAll('_', ' ')}</span>;
}

function applicationDisplayStatus(application: Pick<EnrollmentApplication, 'status' | 'currentStep'>) {
  return application.status === 'draft' && application.currentStep > 0 ? 'in_progress' : application.status;
}

function copyText(settings: PortalSettings | undefined, screen: string, key: string, fallback: string) {
  const value = settings?.screenCopy?.[screen]?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
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
  const portalSettings = useGetPortalSettings();
  const hero = portalSettings.data?.hero;
  const applications = useListMyApplications({
    query: {
      enabled: isLoaded && Boolean(isSignedIn),
      queryKey: getListMyApplicationsQueryKey(),
    },
  });
  const latestApplication = applications.data?.[0];
  const primaryDestination = !isLoaded || !isSignedIn
    ? '/sign-in'
    : applications.isLoading
      ? '/dashboard'
      : latestApplication
        ? ['draft', 'needs_information'].includes(latestApplication.status)
          ? `/apply/${latestApplication.id}`
          : `/applications/${latestApplication.id}`
        : '/dashboard';
  const primaryLabel = latestApplication
    ? ['draft', 'needs_information'].includes(latestApplication.status) ? 'Continue application' : 'View application status'
    : hero?.getStartedLabel ?? 'Get Started';
  return (
    <main className="landing portal-frame">
      <section className="landing-copy">
        <Brand />
        <div className="landing-content rise">
          <div className="eyebrow"><span className="eyebrow-rule" />SECURE ENROLLMENT</div>
          <h1>{copyText(portalSettings.data, 'landing', 'title', hero?.title ?? 'Welcome to Our Enrollment Portal')}</h1>
          <p className="landing-lede">{copyText(portalSettings.data, 'landing', 'description', hero?.description ?? 'Select your enrollment category and complete your application through our secure enrollment process.')}</p>
          <div className="landing-actions">
            <Link href={primaryDestination} className="button button-primary" data-testid="link-get-started">
              {copyText(portalSettings.data, 'landing', 'buttonLabel', primaryLabel)} <ArrowRight size={17} />
            </Link>
            <Link href="/sign-in" className="text-action" data-testid="link-sign-in">
              {copyText(portalSettings.data, 'landing', 'secondaryButtonLabel', hero?.loginLabel ?? 'Log In')}
            </Link>
          </div>
          <div className="landing-assurances">
            <div><span className="assurance-icon"><LockKeyhole size={16} /></span><span><b>Private by design</b><small>Your details stay protected</small></span></div>
            <div><span className="assurance-icon"><Activity size={16} /></span><span><b>Know where you stand</b><small>Track review status clearly</small></span></div>
          </div>
        </div>
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
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation('/auth/complete', { replace: true });
  }, [isLoaded, isSignedIn, setLocation]);
  if (isLoaded && isSignedIn) return <main className="portal-frame auth-loading"><LoadingPanel label="Opening your secure workspace" /></main>;
  return <main className="auth-page portal-frame">
    <div className="auth-brand"><Brand /><span>SECURE ENROLLMENT PORTAL</span></div>
    <div className="auth-canvas">
      <div className="auth-intro"><div className="eyebrow">A thoughtful process starts here</div><h1>{mode === 'in' ? 'Welcome back.' : 'Let’s get started.'}</h1>
        <p>{mode === 'in' ? 'Your application and its latest updates are waiting in your secure workspace.' : 'Create a secure account to begin and return to your application whenever you need.'}</p>
        <div className="auth-security"><LockKeyhole size={17} /><span>Protected access for your enrollment journey</span></div></div>
      <div className="auth-widget">
        {mode === 'in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/auth/complete`} /> :
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/auth/complete`} />}
      </div>
    </div>
  </main>;
}

function AuthComplete() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!isLoaded || !userLoaded) return;
    if (!isSignedIn) {
      setLocation('/sign-in', { replace: true });
      return;
    }
    setLocation(['admin', 'sub_admin', 'moderator'].includes(String(user?.publicMetadata?.role)) ? '/admin' : '/dashboard', { replace: true });
  }, [isLoaded, isSignedIn, userLoaded, user?.id, user?.publicMetadata?.role, setLocation]);
  return <main className="portal-frame auth-loading"><LoadingPanel label="Opening your secure workspace" /></main>;
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
  const { user } = useUser();
  const summary = useGetApplicantSummary();
  const applications = useListMyApplications();
  const categories = useListEnrollmentCategories();
  const portalSettings = useGetPortalSettings();
  const create = useCreateApplication();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [createError, setCreateError] = useState('');
  const palette = ['#0EAD46', '#0C4DA1', '#0072AE', '#FFFFFF'];
  const iconColors = ['#168341', '#244fc7', '#087eaf', '#174d80'];
  const activeStatuses = ['draft', 'submitted', 'under_review', 'needs_information'];
  const applicationsForCategory = (categoryId: string) =>
    (applications.data ?? []).filter((application) => application.categoryId === categoryId);

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
         <PageHeading eyebrow="YOUR ENROLLMENT" title={copyText(portalSettings.data, 'dashboard', 'title', 'A good place to begin.')} detail={copyText(portalSettings.data, 'dashboard', 'description', `Signed in as ${user?.fullName || user?.primaryEmailAddress?.emailAddress || 'your account'}. Start a separate application for each enrollment category.`)} />
        {failure ? <ErrorPanel message="Your enrollment information is temporarily unavailable." retry={() => { void summary.refetch(); void applications.refetch(); void categories.refetch(); }} /> :
          busy ? <LoadingPanel /> : <>
            <section className="selection-section rise-delay">
              <div className="section-line"><div><h2>{copyText(portalSettings.data, 'dashboard', 'sectionIdLabel', 'Select an enrollment path')}</h2><p>{copyText(portalSettings.data, 'dashboard', 'buttonLabel', 'Choose the option that best matches your application.')}</p></div><span className="step-indicator">STEP 01 <i>/ 03</i></span></div>
              <div className="category-grid">
                {(categories.data ?? []).slice(0, 4).map((category, index) => {
                  const cardSettings = portalSettings.data?.cards.find((card) => card.id === category.id);
                  const categoryApplications = applicationsForCategory(category.id);
                  const activeApplication = categoryApplications.find((application) => activeStatuses.includes(application.status));
                  const selected = Boolean(activeApplication);
                  const completedApplication = categoryApplications[0];
                  return <button type="button" key={category.id} disabled={create.isPending} onClick={() => {
                    if (activeApplication) {
                      setLocation(['draft', 'needs_information'].includes(activeApplication.status) ? `/apply/${activeApplication.id}` : `/applications/${activeApplication.id}`);
                      return;
                    }
                    begin(category);
                  }}
                    className={`category-card category-${index + 1}`} style={{ '--category-tone': cardSettings?.backgroundColor ?? palette[index] } as CSSProperties & { '--category-tone': string }}
                    data-testid={`card-category-${category.id}`}>
                    <span className="category-number">0{index + 1}</span>
                    {cardSettings?.logoDataUrl ? <img src={cardSettings.logoDataUrl} alt="" className="category-logo" /> : <span className="category-symbol" style={{ color: iconColors[index] }}><FileCheck2 size={22} strokeWidth={1.75} /></span>}
                    <span className="category-title">{cardSettings?.title ?? category.name}</span>
                    <span className="category-description">{cardSettings?.description ?? category.description}</span>
                    <span className="category-select">{create.isPending ? 'Starting…' : selected ? ['draft', 'needs_information'].includes(activeApplication!.status) ? 'Continue application' : 'View current status' : completedApplication ? 'Start another application' : cardSettings?.buttonLabel ?? 'Select category'} <ArrowUpRight size={15} /></span>
                  </button>;
                })}
              </div>
              {categories.data?.length === 0 && <EmptyPanel title="Enrollment paths are unavailable" message="Please return later or contact support for help." />}
              {createError && <p className="inline-error" role="alert" data-testid="text-create-error">{createError}</p>}
            </section>
            <section className="recent-section">
              <div className="section-line"><div><h2>Your applications</h2><p>Each application has one enrollment category and its own status.</p></div><span className="step-indicator">{(applications.data ?? []).length} total</span></div>
              {(applications.data ?? []).length === 0 ? <EmptyPanel title="Your application list is clear" message="Choose an enrollment path above to create your first draft." /> :
                 <div className="application-list">{(applications.data ?? []).map((app) => <ApplicationRow key={app.id} application={app} />)}</div>}
            </section>
          </>}
      </div>
      <aside className="dashboard-aside">
        <div className="summary-card">
          <div className="summary-head"><span className="summary-label">YOUR OVERVIEW</span><Activity size={17} /></div>
          {summary.isLoading ? <div className="summary-skeleton"><div /><div /><div /></div> : summary.data ? <>
            <div className="summary-total" data-testid="text-summary-total">{summary.data.total}<span> applications</span></div>
            <div className="summary-list">
              <SummaryLine label="Draft / in progress" value={summary.data.drafts} tone="slate" />
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
      <StatusPill status={applicationDisplayStatus(application)} testId={`status-application-${application.id}`} /><ArrowRight className="row-arrow" size={16} />
  </Link>;
}

function formatDate(date?: string | null) {
  if (!date) return '—';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function getCategoryEntryFields(answers: Record<string, unknown>, categoryId: string) {
  const fields = [
    { label: 'Name', value: answers.name },
    ...(categoryId === 'category-1'
      ? [{ label: 'Nickname', value: answers.nickname }]
      : [{ label: 'Surname', value: answers.surname }]),
  ];
  return fields.filter((field): field is { label: string; value: string } =>
    typeof field.value === 'string' && field.value.trim().length > 0);
}

function DraftApplication() {
  const params = useParams<{ applicationId?: string }>();
  const id = params.applicationId ?? '';
  const app = useGetApplication(id, { query: { enabled: !!id, queryKey: getGetApplicationQueryKey(id) } });
  const categories = useListEnrollmentCategories();
  const portalSettings = useGetPortalSettings();
  const update = useUpdateApplication();
  const submit = useSubmitApplication();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [replacementCategory, setReplacementCategory] = useState<EnrollmentCategory['id'] | ''>('');
  const [feedback, setFeedback] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const application = app.data;
  if (app.isLoading) return <AppFrame><LoadingPanel /></AppFrame>;
  if (app.isError || !application) return <AppFrame><ErrorPanel message="This application could not be found or opened." retry={() => void app.refetch()} /></AppFrame>;
  if (!['draft', 'needs_information'].includes(application.status)) return <AppFrame>
    <section className="state-card"><span className="state-icon"><FileCheck2 size={20} /></span><h2>This application has already been submitted</h2><p>Its current status and any updates are available in the application detail view.</p><Link href={`/applications/${id}`} className="button button-primary" data-testid="link-open-submitted">View application <ArrowRight size={15} /></Link></section>
    {showSuccess && <div className="success-overlay">
      <section className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-success-title" data-testid="modal-submission-success">
        <button className="modal-close" onClick={() => setShowSuccess(false)} aria-label="Close submission confirmation" data-testid="button-close-success"><span aria-hidden="true">×</span></button>
        <span className="success-seal"><CheckCircle2 size={25} /></span>
        <div className="eyebrow">APPLICATION RECEIVED</div>
        <h2 id="submission-success-title">Enrollment Submitted Successfully!</h2>
        <p>Your enrollment application has been submitted successfully. Your information is now awaiting review by our authorized enrollment team.</p>
        <div className="success-reference"><span>REFERENCE</span><b className="mono">{application.reference}</b></div>
        <div className="review-field"><span>Selected category</span><b>{application.categoryName}</b></div>
        <div className="review-field"><span>Submission date</span><b>{formatDate(application.submittedAt)}</b></div>
        <div className="review-field"><span>Current status</span><b>Pending Review</b></div>
        <button className="button button-primary" onClick={() => setLocation(`/applications/${id}`)} data-testid="button-view-submitted-status">View Application Status <ArrowRight size={15} /></button>
        <button className="button button-quiet" onClick={() => setLocation('/dashboard')} data-testid="button-return-dashboard">Return to Dashboard</button>
      </section>
    </div>}
  </AppFrame>;
  const changeCategory = () => {
    if (!replacementCategory || replacementCategory === application.categoryId) return;
    const next = categories.data?.find((category) => category.id === replacementCategory);
    if (!next) return;
    const confirmed = window.confirm(`Change to ${next.name}? This resets the saved application details and PIN. This change will be recorded.`);
    if (!confirmed) return;
    setFeedback('');
    update.mutate({ applicationId: id, data: { categoryId: replacementCategory } }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(getGetApplicationQueryKey(id), saved);
        queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
        setReplacementCategory('');
        setFeedback('');
      },
      onError: () => setFeedback('The category could not be changed. Please try again.'),
    });
  };
  const saveStep = async (answers: Record<string, unknown>, currentStep: number) => {
    setFeedback('');
    try {
      const saved = await update.mutateAsync({
        applicationId: id,
        data: { answers, currentStep },
      });
      queryClient.setQueryData(getGetApplicationQueryKey(id), saved);
      queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
      return true;
    } catch {
      setFeedback('We could not save your changes. Please try again.');
      return false;
    }
  };
  const submitDraft = async () => {
    try {
      const saved = await submit.mutateAsync({ applicationId: id });
        queryClient.setQueryData(getGetApplicationQueryKey(id), saved);
        queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
        setShowSuccess(true);
      return true;
    } catch {
      setFeedback('Your application was not submitted. Please try again.');
      return false;
    }
  };
  if (application.answers?.categoryEntryComplete !== true) {
    return <CategoryEntryForm
      key={application.categoryId}
      categoryId={application.categoryId}
      categoryName={portalSettings.data?.cards.find((card) => card.id === application.categoryId)?.title ?? application.categoryName}
      reference={application.reference}
      savedAnswers={application.answers ?? {}}
      categories={categories.data ?? []}
      replacementCategoryId={replacementCategory}
      isSaving={update.isPending}
      error={feedback}
      onReplacementCategoryChange={setReplacementCategory}
      onChangeCategory={changeCategory}
      pinScreenBackground={portalSettings.data?.theme.pinScreenBackground}
      categoryInputTransparent={portalSettings.data?.theme.categoryInputTransparent}
      screenCopy={portalSettings.data?.screenCopy[`category-entry-${application.categoryId}`]}
      onComplete={(entryAnswers: CategoryEntryAnswers, entryPin: string, entryPinConfirmation?: string) => {
        setFeedback('');
        update.mutate({
          applicationId: id,
          data: {
            currentStep: 0,
            answers: { ...application.answers, ...entryAnswers, categoryEntryComplete: true },
            pin: entryPin,
            ...(entryPinConfirmation ? { pinConfirmation: entryPinConfirmation } : {}),
          },
        }, {
          onSuccess: (saved) => {
            queryClient.setQueryData(getGetApplicationQueryKey(id), saved);
            queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
          },
          onError: () => setFeedback('Your details could not be saved. Check the form and try again.'),
        });
      }}
    />;
  }
  const requested = application.answers?.__requestedSections;
  const reopenedSections = Array.isArray(requested)
    ? requested.filter((index): index is number => Number.isInteger(index) && index >= 0 && index <= 6)
    : [];
  const changeCategoryFromWizard = (categoryId: string) => {
    const next = categories.data?.find((category) => category.id === categoryId);
    if (!next || next.id === application.categoryId || application.status !== 'draft') return;
    if (!window.confirm(`Change to ${next.name}? This resets the saved details and PIN. The change will be recorded.`)) return;
    update.mutate({ applicationId: id, data: { categoryId: next.id } }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(getGetApplicationQueryKey(id), saved);
        queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
        setFeedback('');
      },
      onError: () => setFeedback('The category could not be changed. Please try again.'),
    });
  };
  return <EnrollmentWizard
    application={application}
    categories={categories.data ?? []}
    status={application.status}
    storageAvailable={false}
    maxUploadBytes={10 * 1024 * 1024}
    isSaving={update.isPending}
    isSubmitting={submit.isPending}
    error={feedback}
    reopenedSections={reopenedSections}
    saveStep={saveStep}
    submit={submitDraft}
    onChangeCategory={changeCategoryFromWizard}
    screenCopy={portalSettings.data?.screenCopy}
  />;
}

function ApplicationDetail() {
  const portalSettings = useGetPortalSettings();
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
        <div className="detail-meta"><span className="eyebrow">APPLICATION RECORD</span><StatusPill status={applicationDisplayStatus(record)} testId={`status-detail-${record.id}`} /></div>
        <h1>{copyText(portalSettings.data, 'application-status', 'title', record.categoryName)}</h1><p className="mono detail-reference">{record.reference}</p>
        <div className="detail-created">Last updated {formatDate(record.updatedAt)}</div>
      </section>
      <div className="detail-grid">
        <section className="detail-card"><div className="detail-card-title"><Activity size={17} /><h2>Verification progress</h2></div>
          <div className="status-timeline">
            <div className={`status-event complete`}><span><Check size={13} /></span><div><b>Application created</b><small>{formatDate(record.createdAt)}</small></div></div>
            <div className={`status-event ${record.submittedAt ? 'complete' : 'current'}`}><span>{record.submittedAt ? <Check size={13} /> : <span />}</span><div><b>Submitted for review</b><small>{record.submittedAt ? formatDate(record.submittedAt) : 'Not yet submitted'}</small></div></div>
            <div className={`status-event ${['approved', 'rejected'].includes(record.status) ? 'complete' : ''}`}><span>{['approved', 'rejected'].includes(record.status) ? <Check size={13} /> : null}</span><div><b>Verification decision</b><small>{record.status === 'under_review' || record.status === 'submitted' ? 'Review in progress' : record.status === 'needs_information' ? 'Additional information required' : record.status.replaceAll('_', ' ')}</small></div></div>
          </div>
          {record.reviewNote && <div className="review-note"><b>Update from the review team</b><p>{record.reviewNote}</p></div>}
          {['draft', 'needs_information'].includes(record.status) && <Link href={`/apply/${record.id}`} className="button button-primary" data-testid="link-continue-draft">{record.status === 'needs_information' ? 'Provide requested information' : 'Continue application'} <ArrowRight size={15} /></Link>}
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
  const [category, setCategory] = useState<'enrollment' | 'account' | 'technical' | 'documents' | 'other'>('enrollment');
  const [applicationId, setApplicationId] = useState('');
  const [notice, setNotice] = useState('');
  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 5;
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setNotice('');
    create.mutate({ data: { subject: subject.trim(), category, message: message.trim(), applicationId: applicationId || null } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMySupportTicketsQueryKey() });
        setSubject(''); setMessage(''); setApplicationId(''); setCategory('enrollment');
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
            <label className="field-label" htmlFor="support-category">Request category</label>
            <select id="support-category" className="text-input select-input" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} data-testid="select-support-category">
              <option value="enrollment">Enrollment</option><option value="account">Account</option><option value="technical">Technical</option><option value="documents">Documents</option><option value="other">Other</option>
            </select>
            <label className="field-label" htmlFor="support-application">Related application <span>Optional</span></label>
            <select id="support-application" className="text-input select-input" value={applicationId} onChange={(e) => setApplicationId(e.target.value)} data-testid="select-support-application">
              <option value="">No application selected</option>{(applications.data ?? []).map((application) => <option key={application.id} value={application.id}>{application.reference} · {application.categoryName}</option>)}
            </select>
            <label className="field-label" htmlFor="support-message">Message</label>
            <textarea id="support-message" className="text-input form-textarea support-message-input" value={message} onChange={(e) => setMessage(e.target.value)} minLength={5} maxLength={5000} required placeholder="Tell us a little more so we can help." data-testid="input-support-message" />
            <p className="field-help">Secure attachments are not available right now. Do not include identity documents in this message.</p>
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
  const addMessage = useAddApplicantSupportMessage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const send = () => {
    if (!draft.trim()) return;
    setError('');
    addMessage.mutate({ ticketId: ticket.id, data: { message: draft.trim() } }, {
      onSuccess: () => {
        setDraft('');
        queryClient.invalidateQueries({ queryKey: getListMySupportTicketsQueryKey() });
      },
      onError: () => setError('Your reply could not be sent. Please try again.'),
    });
  };
  return <article className="ticket-card" data-testid={`ticket-${ticket.id}`}>
    <div className="ticket-head"><span className="ticket-subject">{ticket.subject}</span><StatusPill status={ticket.status} testId={`status-ticket-${ticket.id}`} /></div>
    <div className="ticket-date">{ticket.category.replaceAll('_', ' ')}{ticket.applicationReference ? ` · ${ticket.applicationReference}` : ''}</div>
    <div className="ticket-date">Opened {formatDate(ticket.createdAt)}</div>
    <div className="ticket-conversation" aria-label="Support conversation">
      {(ticket.messages ?? []).map((item) => <div key={item.id} className={item.actorRole === 'administrator' ? 'ticket-response' : 'ticket-message'}>
        <b>{item.actorRole === 'administrator' ? 'Support team' : 'You'}</b><p>{item.body}</p><small>{formatDate(item.createdAt)}</small>
      </div>)}
    </div>
    {!['resolved', 'closed'].includes(ticket.status) && <div className="ticket-reply-form">
      <label className="field-label" htmlFor={`support-reply-${ticket.id}`}>Reply</label>
      <textarea id={`support-reply-${ticket.id}`} className="text-input form-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} rows={2} data-testid={`input-support-reply-${ticket.id}`} />
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button button-quiet" onClick={send} disabled={!draft.trim() || addMessage.isPending} data-testid={`button-support-reply-${ticket.id}`}>{addMessage.isPending ? 'Sending…' : 'Send reply'} <ArrowRight size={14} /></button>
    </div>}
  </article>;
}

function AdminShell({ children, active = 'overview' }: { children: ReactNode; active?: string }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const role = user?.publicMetadata?.role;
  return <div className="admin-shell portal-frame">
    <aside className="admin-sidebar"><div className="sidebar-brand"><Brand inverse /></div><div className="workspace-label">STAFF WORKSPACE</div>
      <nav className="side-nav" aria-label="Staff navigation">
        {['admin', 'sub_admin'].includes(String(role)) && <>
          <Link href="/admin" className={`nav-link ${active === 'overview' ? 'nav-link-active' : ''}`} data-testid="link-admin-overview"><Activity size={18} /><span>Overview</span></Link>
          <Link href="/admin/review" className={`nav-link ${active === 'review' ? 'nav-link-active' : ''}`} data-testid="link-admin-review"><FileCheck2 size={18} /><span>Review queue</span></Link>
        </>}
        {role === 'admin' && <>
          <Link href="/admin/users" className={`nav-link ${active === 'users' ? 'nav-link-active' : ''}`} data-testid="link-admin-users"><CheckCircle2 size={18} /><span>Users and roles</span></Link>
          <Link href="/admin/settings" className={`nav-link ${active === 'settings' ? 'nav-link-active' : ''}`} data-testid="link-admin-settings"><Settings size={18} /><span>Portal settings</span></Link>
        </>}
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
  const { isLoaded: userLoaded, user } = useUser();
  const [location] = useLocation();
  if (!isLoaded || (isSignedIn && !userLoaded)) return <main className="portal-frame auth-loading"><LoadingPanel label="Checking staff access" /></main>;
  if (!isSignedIn) return <SignedOutNotice />;
  const role = user?.publicMetadata?.role;
  if (!['admin', 'sub_admin', 'moderator'].includes(String(role))) return <main className="signedout-page portal-frame"><Brand /><div className="signedout-card"><span className="state-icon"><LockKeyhole size={21} /></span><div className="eyebrow">RESTRICTED WORKSPACE</div><h1>Administrator access required</h1><p>This console is available only to authorized administrators.</p><Link href="/dashboard" className="button button-primary" data-testid="link-admin-denied-dashboard">Return to your dashboard <ArrowRight size={15} /></Link></div></main>;
  if (role === 'moderator' && location !== '/admin/support') return <main className="signedout-page portal-frame"><Brand /><div className="signedout-card"><span className="state-icon"><Headphones size={21} /></span><div className="eyebrow">SUPPORT STAFF</div><h1>Support workspace</h1><p>Moderator access is limited to support requests.</p><Link href="/admin/support" className="button button-primary" data-testid="link-moderator-support">Open support inbox <ArrowRight size={15} /></Link></div></main>;
  if (role === 'sub_admin' && (location === '/admin/users' || location === '/admin/settings')) return <main className="signedout-page portal-frame"><Brand /><div className="signedout-card"><span className="state-icon"><LockKeyhole size={21} /></span><div className="eyebrow">RESTRICTED WORKSPACE</div><h1>Administrator access required</h1><p>Your staff role does not include user or portal settings management.</p><Link href="/admin/review" className="button button-primary" data-testid="link-subadmin-review">Open review queue <ArrowRight size={15} /></Link></div></main>;
  return <>{children}</>;
}

function AdminQueue() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const filters = useMemo(() => ({ ...(status ? { status: status as 'submitted' | 'under_review' | 'needs_information' | 'approved' | 'rejected' } : {}), ...(search.trim() ? { search: search.trim() } : {}) }), [status, search]);
  const review = useListApplicationsForReview(filters);
  const records = review.data ?? [];
  if (review.isError) return <AdminShell><AccessError retry={() => void review.refetch()} /></AdminShell>;
  return <AdminShell active="review">
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

function AdminOverview() {
  const overview = useGetAdminOverview();
  if (overview.isError) return <AdminShell><AccessError retry={() => void overview.refetch()} /></AdminShell>;
  const metrics = [
    ['Total registered users', overview.data?.totalUsers, 'users'],
    ['Enrollment applications', overview.data?.totalApplications, 'applications'],
    ['Pending applications', overview.data?.pendingApplications, 'pending'],
    ['Under review', overview.data?.underReviewApplications, 'review'],
    ['Approved', overview.data?.approvedApplications, 'approved'],
    ['Rejected', overview.data?.rejectedApplications, 'rejected'],
    ['Additional information required', overview.data?.needsInformationApplications, 'information'],
    ['Unresolved support requests', overview.data?.unresolvedSupportRequests, 'support'],
  ] as const;
  return <AdminShell active="overview"><div className="admin-page">
    <PageHeading eyebrow="SECURE STAFF WORKSPACE" title="Overview" detail="Live enrollment and support totals from the service." action={<Link href="/admin/review" className="button button-primary" data-testid="link-overview-review">Open review queue <ArrowRight size={15} /></Link>} />
    {overview.isLoading ? <LoadingPanel label="Loading administrator totals" /> : <section className="admin-metric-grid" aria-label="Enrollment overview totals">
      {metrics.map(([label, value, key]) => <article className="admin-metric-card" key={key} data-testid={`metric-${key}`}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}
    </section>}
    <div className="admin-overview-actions">
      <Link href="/admin/users" className="detail-card admin-overview-link"><b>User and account management</b><span>Search users, manage access roles, and review linked enrollment activity.</span><ArrowRight size={16} /></Link>
      <Link href="/admin/support" className="detail-card admin-overview-link"><b>Support requests</b><span>Open conversations, assign staff, and track resolution.</span><ArrowRight size={16} /></Link>
    </div>
  </div></AdminShell>;
}

function AdminUsers() {
  const [search, setSearch] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const params = useMemo(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(accountStatus ? { accountStatus: accountStatus as 'active' | 'suspended' } : {}),
  }), [search, accountStatus]);
  const users = useListAdminUsers(params);
  const updateStatus = useUpdateAdminUserStatus();
  const updateRole = useUpdateAdminUserRole();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const records = users.data?.users ?? [];
  const changeStatus = (record: AdminUser) => {
    const next = record.accountStatus === 'suspended' ? 'active' : 'suspended';
    const verb = next === 'suspended' ? 'suspend' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${verb} ${record.name || record.email || 'this account'}? Enrollment records will be preserved.`)) return;
    updateStatus.mutate({ userId: record.userId, data: { accountStatus: next } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
      },
    });
  };
  const changeRole = (record: AdminUser, role: AdminUser['role']) => {
    if (record.userId === user?.id || role === record.role) return;
    if (!window.confirm(`Change ${record.name || record.email || 'this user'}’s role to ${role.replaceAll('_', ' ')}?`)) return;
    updateRole.mutate({ userId: record.userId, data: { role } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }),
    });
  };
  if (users.isError) return <AdminShell active="users"><AccessError retry={() => void users.refetch()} /></AdminShell>;
  return <AdminShell active="users"><div className="admin-page">
    <PageHeading eyebrow="ACCOUNT MANAGEMENT" title="Users and roles" detail="Manage applicant accounts and assign authorized staff roles." />
    <div className="admin-toolbar">
      <label className="searchbox"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, user ID, or reference" aria-label="Search user accounts" data-testid="input-admin-user-search" /></label>
      <label className="filter-select"><span className="sr-only">Filter by account status</span><select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} data-testid="select-account-status"><option value="">All account statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select><ChevronDown size={15} /></label>
    </div>
    {selected && <section className="detail-card admin-user-detail" data-testid="panel-admin-user-detail">
      <div className="detail-card-title"><Activity size={17} /><h2>Account details</h2><button className="text-action" onClick={() => setSelected(null)} data-testid="button-close-user-detail">Close</button></div>
      <div className="review-field"><span>User ID</span><b className="mono">{selected.userId}</b></div>
      <div className="review-field"><span>Name</span><b>{selected.name || selected.username || 'Not provided'}</b></div>
      <div className="review-field"><span>Email</span><b>{selected.email || 'Not provided'}</b></div>
      <div className="review-field"><span>Role</span><b>{selected.role.replaceAll('_', ' ')}</b></div>
      <div className="review-field"><span>Selected category</span><b>{selected.categoryName || 'None selected'}</b></div>
      <div className="review-field"><span>Application reference</span><b>{selected.applicationReference || 'No application'}</b></div>
      <div className="review-field"><span>Registration date</span><b>{formatDate(selected.registrationDate)}</b></div>
      <div className="review-field"><span>Account status</span><b>{selected.accountStatus}</b></div>
      <div className="review-field"><span>Enrollment status</span><b>{selected.enrollmentStatus ? <StatusPill status={selected.enrollmentStatus} /> : 'No application'}</b></div>
      {selected.applicationId && <Link className="button button-quiet" href={`/admin/applications/${selected.applicationId}`}>View application history <ArrowRight size={14} /></Link>}
    </section>}
    <section className="queue-card admin-user-table-card">
      <div className="queue-card-head"><div><b>Accounts</b><span>Suspending an account does not delete its enrollment record.</span></div><span className="queue-count" data-testid="text-admin-user-count">{users.isLoading ? '…' : users.data?.totalCount ?? records.length}</span></div>
      {users.isLoading ? <LoadingPanel label="Loading applicant accounts" /> : records.length === 0 ? <EmptyPanel title="No matching user accounts" message="Try another name, email, reference, or account status." /> :
        <div className="admin-table-scroll"><table className="admin-user-table"><thead><tr><th>User ID</th><th>Name / username</th><th>Email</th><th>Selected category</th><th>Application reference</th><th>Registration date</th><th>Account status</th><th>Enrollment status</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody>{records.map((record) => <tr key={record.userId} data-testid={`row-admin-user-${record.userId}`}>
            <td className="mono">{record.userId}</td><td>{record.name || record.username || '—'}</td><td>{record.email || '—'}</td><td>{record.categoryName || '—'}</td>
            <td className="mono">{record.applicationReference || '—'}</td><td>{formatDate(record.registrationDate)}</td><td><StatusPill status={record.accountStatus} /></td>
            <td>{record.enrollmentStatus ? <StatusPill status={record.enrollmentStatus} /> : '—'}</td>
            <td><select value={record.role} disabled={updateRole.isPending || record.userId === user?.id} onChange={(event) => changeRole(record, event.target.value as AdminUser['role'])} aria-label={`Assign role for ${record.name || record.email || record.userId}`} data-testid={`select-user-role-${record.userId}`}><option value="applicant">Applicant</option><option value="admin">Admin</option><option value="sub_admin">Sub admin</option><option value="moderator">Moderator</option></select></td>
            <td className="admin-user-actions"><button className="text-action" onClick={() => setSelected(record)} data-testid={`button-view-user-${record.userId}`}>View user</button>
              {record.applicationId && <Link className="text-action" href={`/admin/applications/${record.applicationId}`} data-testid={`link-user-application-${record.userId}`}>View application</Link>}
              {record.role === 'applicant' && <button className="text-action" onClick={() => changeStatus(record)} disabled={updateStatus.isPending} data-testid={`button-toggle-user-${record.userId}`}>{record.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend'}</button>}
            </td>
          </tr>)}</tbody></table></div>}
    </section>
  </div></AdminShell>;
}

function AdminSettings() {
  const settingsQuery = useGetPortalSettings();
  const saveSettings = useUpdatePortalSettings();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PortalSettings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);
  const updateHero = (key: keyof PortalSettings['hero'], value: string) => {
    setDraft((current) => current ? { ...current, hero: { ...current.hero, [key]: value } } : current);
  };
  const updateTheme = (key: keyof PortalSettings['theme'], value: string | boolean) => {
    setDraft((current) => current ? { ...current, theme: { ...current.theme, [key]: value } } : current);
  };
  const updateCard = (id: string, key: string, value: string | null) => {
    setDraft((current) => current ? {
      ...current,
      cards: current.cards.map((card) => card.id === id ? { ...card, [key]: value } : card),
    } : current);
  };
  const updateScreenCopy = (screen: string, key: string, value: string) => {
    setDraft((current) => current ? {
      ...current,
      screenCopy: {
        ...current.screenCopy,
        [screen]: { ...(current.screenCopy[screen] ?? {}), [key]: value },
      },
    } : current);
  };
  const uploadLogo = (cardId: string, file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a PNG, JPEG, or WebP image no larger than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateCard(cardId, 'logoDataUrl', reader.result);
        setError('');
      }
    };
    reader.onerror = () => setError('The image could not be read.');
    reader.readAsDataURL(file);
  };
  const screenLabels = [
    ['dashboard', 'User dashboard'],
    ['category-entry-1', 'Category One entry form'],
    ['category-entry-2', 'Category Two entry form'],
    ['category-entry-3', 'Category Three entry form'],
    ['category-entry-4', 'Category Four entry form'],
    ...Array.from({ length: 8 }, (_, index) => [`workflow-step-${index + 1}`, `Enrollment step ${index + 1}`] as [string, string]),
    ['application-status', 'Application status'],
    ['support', 'Applicant support'],
    ['admin-overview', 'Admin overview'],
    ['admin-review', 'Admin review'],
    ['admin-support', 'Admin support'],
  ];
  const save = () => {
    if (!draft) return;
    setMessage('');
    setError('');
    saveSettings.mutate({ data: draft }, {
      onSuccess: (saved) => {
        queryClient.invalidateQueries({ queryKey: getGetPortalSettingsQueryKey() });
        setDraft(saved);
        setMessage('Portal settings saved.');
      },
      onError: () => setError('Settings could not be saved. Please try again.'),
    });
  };
  if (settingsQuery.isError) return <AdminShell active="settings"><AccessError retry={() => void settingsQuery.refetch()} /></AdminShell>;
  if (!draft) return <AdminShell active="settings"><LoadingPanel label="Loading portal settings" /></AdminShell>;
  return <AdminShell active="settings"><div className="admin-page admin-settings-page">
    <PageHeading eyebrow="PORTAL CONFIGURATION" title="Portal settings" detail="Edit the home page, enrollment cards, screen copy, and visual settings." action={<button className="button button-primary" onClick={save} disabled={saveSettings.isPending} data-testid="button-save-portal-settings">{saveSettings.isPending ? 'Saving…' : 'Save changes'} <Check size={15} /></button>} />
    {message && <p className="success-message" role="status" data-testid="text-settings-success">{message}</p>}
    {error && <p className="inline-error" role="alert" data-testid="text-settings-error">{error}</p>}
    <section className="detail-card settings-panel">
      <div className="detail-card-title"><Home size={17} /><h2>Landing page</h2></div>
      <label className="field-label">Hero heading<input className="text-input" value={draft.hero.title} maxLength={160} onChange={(event) => updateHero('title', event.target.value)} data-testid="input-settings-hero-title" /></label>
      <label className="field-label">Hero description<textarea className="text-input form-textarea" value={draft.hero.description} maxLength={500} rows={3} onChange={(event) => updateHero('description', event.target.value)} data-testid="input-settings-hero-description" /></label>
      <div className="settings-inline-fields">
        <label className="field-label">Primary button label<input className="text-input" value={draft.hero.getStartedLabel} maxLength={60} onChange={(event) => updateHero('getStartedLabel', event.target.value)} /></label>
        <label className="field-label">Log-in button label<input className="text-input" value={draft.hero.loginLabel} maxLength={60} onChange={(event) => updateHero('loginLabel', event.target.value)} /></label>
      </div>
    </section>
    <section className="settings-card-grid" aria-label="Enrollment card settings">
      {draft.cards.map((card) => <article className="detail-card settings-panel" key={card.id} data-testid={`settings-card-${card.id}`}>
        <div className="detail-card-title"><FileCheck2 size={17} /><h2>{card.id.replace('category-', 'Category ')}</h2></div>
        <label className="field-label">Card title<input className="text-input" value={card.title} maxLength={100} onChange={(event) => updateCard(card.id, 'title', event.target.value)} /></label>
        <label className="field-label">Description<textarea className="text-input form-textarea" value={card.description} maxLength={240} rows={2} onChange={(event) => updateCard(card.id, 'description', event.target.value)} /></label>
        <label className="field-label">Selection button label<input className="text-input" value={card.buttonLabel} maxLength={60} onChange={(event) => updateCard(card.id, 'buttonLabel', event.target.value)} /></label>
        <label className="field-label settings-color-field">Dashboard card background<input type="color" value={card.backgroundColor} onChange={(event) => updateCard(card.id, 'backgroundColor', event.target.value.toUpperCase())} aria-label={`${card.title} background color`} /></label>
        <label className="field-label">Card logo image (PNG, JPEG, WebP; up to 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadLogo(card.id, event.target.files?.[0])} data-testid={`input-settings-logo-${card.id}`} /></label>
        {card.logoDataUrl && <div className="settings-logo-preview"><img src={card.logoDataUrl} alt={`${card.title} logo preview`} /><button type="button" className="text-action" onClick={() => updateCard(card.id, 'logoDataUrl', null)}>Remove logo</button></div>}
      </article>)}
    </section>
    <section className="detail-card settings-panel">
      <div className="detail-card-title"><Settings size={17} /><h2>Form and button appearance</h2></div>
      <div className="settings-inline-fields">
        <label className="field-label settings-color-field">PIN screen background<input type="color" value={draft.theme.pinScreenBackground} onChange={(event) => updateTheme('pinScreenBackground', event.target.value.toUpperCase())} /></label>
        <label className="field-label">Primary button size<select className="text-input select-input" value={draft.theme.buttonSize} onChange={(event) => updateTheme('buttonSize', event.target.value)}><option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option></select></label>
        <label className="field-label">Primary button placement<select className="text-input select-input" value={draft.theme.buttonPlacement} onChange={(event) => updateTheme('buttonPlacement', event.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      </div>
      <label className="settings-check"><input type="checkbox" checked={draft.theme.categoryInputTransparent} onChange={(event) => updateTheme('categoryInputTransparent', event.target.checked)} /> Keep category-entry fields transparent with a single underline</label>
    </section>
    <section className="detail-card settings-panel">
      <div className="detail-card-title"><FileText size={17} /><h2>Screen titles, descriptions, section IDs, and buttons</h2></div>
      <p className="field-help">Edit the main copy for each page or workflow step. Empty values use the portal’s default labels.</p>
      <div className="settings-screen-list">{screenLabels.map(([screen, label]) => <details className="settings-screen" key={screen}>
        <summary>{label}<span>{screen}</span></summary>
        <div className="settings-inline-fields">
          {([
            'title', 'description', 'sectionIdLabel', 'buttonLabel',
            ...(screen.startsWith('category-entry-') ? ['nameLabel', 'nicknameLabel', 'surnameLabel', 'pinLabel', 'confirmationLabel'] : []),
          ] as string[]).map((key) => <label className="field-label" key={key}>{key === 'sectionIdLabel' ? 'Section ID label' : key === 'buttonLabel' ? 'Primary button label' : key === 'title' ? 'Screen title' : key === 'description' ? 'Description' : key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
            <input className="text-input" value={draft.screenCopy[screen]?.[key] ?? ''} maxLength={500} placeholder="Use portal default" onChange={(event) => updateScreenCopy(screen, key, event.target.value)} data-testid={`input-copy-${screen}-${key}`} />
          </label>)}
        </div>
      </details>)}</div>
    </section>
    <div className="settings-save-bottom"><button className="button button-primary" onClick={save} disabled={saveSettings.isPending} data-testid="button-save-portal-settings-bottom">{saveSettings.isPending ? 'Saving…' : 'Save portal settings'} <Check size={15} /></button></div>
  </div></AdminShell>;
}

function readAnswerGroup(answers: Record<string, unknown> | undefined, key: string): Record<string, unknown> {
  const value = answers?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function displayAdminValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(displayAdminValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function AdminAnswerSection({ title, data, note }: { title: string; data: Record<string, unknown>; note?: string }) {
  const entries = Object.entries(data).filter(([key]) => !key.startsWith('__') && !key.toLowerCase().includes('ciphertext') && !key.toLowerCase().includes('objectpath'));
  return <section className="detail-card admin-answer-section">
    <div className="detail-card-title"><FileText size={17} /><h2>{title}</h2></div>
    {entries.length ? entries.map(([key, value]) => <div className="review-field" key={key}>
      <span>{key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())}</span>
      <b>{displayAdminValue(value)}</b>
    </div>) : <p className="field-help">No information provided.</p>}
    {note && <p className="field-help">{note}</p>}
  </section>;
}

function AdminApplicationReview() {
  const params = useParams<{ applicationId?: string }>();
  const id = params.applicationId ?? '';
  const review = useGetAdminApplication(id);
  const history = useGetAdminApplicationHistory(id);
  const decide = useDecideApplication();
  const addNote = useAddAdminApplicationNote();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [requestedSections, setRequestedSections] = useState<number[]>([]);
  const [error, setError] = useState('');
  if (review.isLoading) return <AdminShell><LoadingPanel /></AdminShell>;
  if (review.isError) return <AdminShell><AccessError retry={() => void review.refetch()} /></AdminShell>;
  const application = review.data;
  if (!application) return <AdminShell><section className="state-card"><span className="state-icon"><FileText size={20} /></span><h2>Application not in this review queue</h2><p>It may have changed status or may not be available to this staff account.</p><Link href="/admin" className="button button-primary" data-testid="link-back-review">Back to review queue</Link></section></AdminShell>;
  const makeDecision = (decision: ApplicationDecision['decision']) => {
    setError('');
    if (decision === 'reject' && !note.trim()) { setError('Add the reason for rejecting this application.'); return; }
    if (decision === 'request_information' && (!note.trim() || requestedSections.length === 0)) { setError('Specify what the applicant must correct and select at least one section.'); return; }
    if (!window.confirm(`Confirm ${decision.replaceAll('_', ' ')} for application ${application.reference}?`)) return;
    decide.mutate({ applicationId: id, data: {
      decision,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(decision === 'request_information' ? { reopenSections: requestedSections } : {}),
    } }, {
      onSuccess: (saved) => {
        queryClient.invalidateQueries({ queryKey: getListApplicationsForReviewQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApplicationQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetAdminApplicationQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetAdminApplicationHistoryQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
        setNote('');
        setRequestedSections([]);
        setError(`Decision recorded: ${saved.status.replaceAll('_', ' ')}.`);
      },
      onError: () => setError('The service could not record this decision. Please try again.'),
    });
  };
  const saveInternalNote = () => {
    if (!internalNote.trim()) return;
    addNote.mutate({ applicationId: id, data: { note: internalNote.trim() } }, {
      onSuccess: () => {
        setInternalNote('');
        queryClient.invalidateQueries({ queryKey: getGetAdminApplicationHistoryQueryKey(id) });
        setError('Internal note saved.');
      },
      onError: () => setError('The internal note could not be saved.'),
    });
  };
  return <AdminShell active="review">
    <div className="admin-review-page">
      <Link href="/admin/review" className="back-link" data-testid="link-review-back"><ArrowLeft size={16} /> Review queue</Link>
      <div className="review-title-row"><div><div className="eyebrow">APPLICATION REVIEW</div><h1>{application.categoryName}</h1><p className="mono">{application.reference}</p></div><StatusPill status={application.status} testId={`status-review-detail-${application.id}`} /></div>
      <div className="review-detail-grid">
        <section className="detail-card applicant-record">
          <div className="detail-card-title"><FileText size={17} /><h2>Applicant record</h2></div>
          <div className="review-field"><span>Applicant</span><b>{application.applicantName || 'Not provided'}</b></div>
          <div className="review-field"><span>Email</span><b>{application.applicantEmail || 'Not provided'}</b></div>
          {getCategoryEntryFields(application.answers, application.categoryId).map((field) =>
            <div className="review-field" key={field.label}><span>{field.label}</span><b>{field.value}</b></div>)}
          <div className="review-field"><span>Created</span><b>{formatDate(application.createdAt)}</b></div>
          <div className="review-field"><span>Submitted</span><b>{formatDate(application.submittedAt)}</b></div>
          <div className="review-field review-context"><span>Additional context</span><b>{String(application.answers?.additionalContext ?? 'No additional context provided')}</b></div>
          {application.reviewNote && <div className="review-note"><b>Previous review note</b><p>{application.reviewNote}</p></div>}
        </section>
        <section className="decision-card">
          <div className="decision-head"><span className="decision-icon"><BadgeCheck size={19} /></span><div><h2>Record a decision</h2><p>This update will be visible to the applicant.</p></div></div>
          <label className="field-label" htmlFor="decision-note">Applicant-facing reason or instructions <span>Required for rejection or additional information</span></label>
          <textarea id="decision-note" className="text-input form-textarea decision-note" rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain the decision or specify exactly what the applicant should correct." data-testid="input-decision-note" />
          <fieldset className="requested-sections"><legend>Sections to reopen for additional information</legend>
            {['Personal information', 'Next of kin', 'Education', 'Work information', 'Proof of identity', 'Live video', 'Bank details'].map((label, index) => <label key={label}><input type="checkbox" checked={requestedSections.includes(index)} onChange={(event) => setRequestedSections((current) => event.target.checked ? [...new Set([...current, index])] : current.filter((item) => item !== index))} /> {label}</label>)}
          </fieldset>
          {error && <p className={error.startsWith('Decision recorded') ? 'success-message' : 'inline-error'} role="status" data-testid="text-decision-feedback">{error}</p>}
          <div className="decision-actions">
            <button className="decision-button request" onClick={() => makeDecision('mark_under_review')} disabled={decide.isPending || ['draft', 'approved', 'rejected'].includes(application.status)} data-testid="button-decision-under-review">Mark under review</button>
            <button className="decision-button approve" onClick={() => makeDecision('approve')} disabled={decide.isPending || ['draft', 'approved', 'rejected'].includes(application.status)} data-testid="button-decision-approve"><CheckCircle2 size={16} /> Approve</button>
            <button className="decision-button request" onClick={() => makeDecision('request_information')} disabled={decide.isPending || ['draft', 'approved', 'rejected'].includes(application.status)} data-testid="button-decision-request">Request additional information</button>
            <button className="decision-button reject" onClick={() => makeDecision('reject')} disabled={decide.isPending || ['draft', 'approved', 'rejected'].includes(application.status)} data-testid="button-decision-reject">Reject</button>
          </div>
        </section>
      </div>
      <section className="review-category-selection">
        <div className="detail-card-title"><CheckCircle2 size={17} /><h2>Section 1 · Category selection</h2></div>
        <div className="review-field"><span>Selected card</span><b>{application.categoryName}</b></div>
        <div className="review-field"><span>Category-specific information</span><b>{getCategoryEntryFields(application.answers, application.categoryId).map((field) => `${field.label}: ${field.value}`).join(' · ') || 'No entry details provided'}</b></div>
        <div className="review-field"><span>Enrollment date</span><b>{formatDate(application.createdAt)}</b></div>
      </section>
      <div className="admin-record-sections">
        <AdminAnswerSection title="Section 2 · Personal information" data={readAnswerGroup(application.answers, 'personalInformation')} />
        <AdminAnswerSection title="Section 3 · Next of kin" data={readAnswerGroup(application.answers, 'nextOfKin')} note="Applicant was asked to share these details with the contact’s permission." />
        <AdminAnswerSection title="Section 4 · Education" data={readAnswerGroup(application.answers, 'education')} />
        <AdminAnswerSection title="Section 5 · Work information" data={readAnswerGroup(application.answers, 'workInformation')} />
        <AdminAnswerSection title="Section 6 · Proof of identity" data={readAnswerGroup(application.answers, 'proofOfIdentity')} note="Private identity-image preview and download are disabled until private storage is configured." />
        <AdminAnswerSection title="Section 7 · Video recording" data={readAnswerGroup(application.answers, 'liveVideoRecording')} note="No identity or liveness conclusion is made from this recording. Secure playback is unavailable until private storage is configured." />
        <AdminAnswerSection title="Section 8 · Bank details" data={readAnswerGroup(application.answers, 'bankDetails')} note="Shown to authorized reviewers only; the account number is encrypted in storage." />
      </div>
      <section className="detail-card admin-history-card">
        <div className="detail-card-title"><Activity size={17} /><h2>Section 9 · Submission metadata and review history</h2></div>
        <div className="review-field"><span>Application reference</span><b className="mono">{application.reference}</b></div>
        <div className="review-field"><span>Submission date</span><b>{formatDate(application.submittedAt)}</b></div>
        <div className="review-field"><span>Last update</span><b>{formatDate(application.updatedAt)}</b></div>
        <div className="review-field"><span>Current status</span><b><StatusPill status={application.status} /></b></div>
        <h3>Previous decisions and audit events</h3>
        {history.isLoading ? <LoadingPanel label="Loading review history" /> : (history.data ?? []).length === 0 ? <p className="field-help">No previous decisions or notes.</p> :
          <div className="admin-history-list">{history.data?.map((event: ApplicationEvent) => <article key={event.id}><b>{event.eventType.replaceAll('_', ' ')}</b><span>{formatDate(event.createdAt)} · {event.actorUserId}</span><p>{event.note || 'No reason recorded.'}</p></article>)}</div>}
      </section>
      <section className="detail-card internal-note-card">
        <div className="detail-card-title"><LockKeyhole size={17} /><h2>Add internal note</h2></div>
        <p className="field-help">Internal notes are visible to authorized staff, not to the applicant.</p>
        <textarea className="text-input form-textarea" rows={3} maxLength={4000} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} data-testid="input-internal-note" />
        <button className="button button-quiet" onClick={saveInternalNote} disabled={!internalNote.trim() || addNote.isPending} data-testid="button-save-internal-note">{addNote.isPending ? 'Saving…' : 'Save internal note'}</button>
      </section>
    </div>
  </AdminShell>;
}

function AdminSupport() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const filters = useMemo(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(statusFilter ? { status: statusFilter as 'open' | 'in_progress' | 'resolved' } : {}),
  }), [search, statusFilter]);
  const tickets = useListSupportTicketsForAdmin(filters);
  const reply = useReplyToSupportTicket();
  const assign = useAssignSupportTicket();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [assignee, setAssignee] = useState('');
  if (tickets.isError) return <AdminShell active="support"><AccessError retry={() => void tickets.refetch()} /></AdminShell>;
  const records = tickets.data ?? [];
  const activeTicket = records.find((ticket) => ticket.id === selected) ?? records[0];
  const respond = (ticket: SupportTicket, status: 'in_progress' | 'resolved') => {
    const response = (drafts[ticket.id] ?? ticket.response ?? '').trim();
    if (!response) { setFeedback('Add a reply before updating this ticket.'); return; }
    setFeedback('');
    reply.mutate({ ticketId: ticket.id, data: { response, status } }, {
      onSuccess: (saved) => {
        queryClient.invalidateQueries({ queryKey: getListSupportTicketsForAdminQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMySupportTicketsQueryKey() });
        setFeedback('Support ticket updated.');
      },
      onError: () => setFeedback('The reply could not be saved. Please try again.'),
    });
  };
  const assignTicket = (ticket: SupportTicket) => {
    const assigneeUserId = assignee.trim() || null;
    assign.mutate({ ticketId: ticket.id, data: { assigneeUserId } }, {
      onSuccess: () => {
        setFeedback(assigneeUserId ? 'Support request assigned.' : 'Support request unassigned.');
        queryClient.invalidateQueries({ queryKey: getListSupportTicketsForAdminQueryKey() });
      },
      onError: () => setFeedback('Assign this request to an authorized staff account.'),
    });
  };
  return <AdminShell active="support">
    <div className="support-admin-page">
      <PageHeading eyebrow="SECURE STAFF WORKSPACE" title="Support inbox" detail="Manage applicant messages and send a considered reply." />
      <div className="admin-toolbar">
        <label className="searchbox"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or user" aria-label="Search support requests" data-testid="input-support-search" /></label>
        <label className="filter-select"><span className="sr-only">Filter support status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} data-testid="select-support-status"><option value="">All request statuses</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option></select><ChevronDown size={15} /></label>
      </div>
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
            <div className="inbox-conversation">{(activeTicket.messages ?? []).map((message) => <div className="inbox-message" key={message.id}><span className="message-avatar">{message.actorRole === 'administrator' ? 'ST' : 'AP'}</span><div><div className="message-meta">{message.actorRole === 'administrator' ? 'Staff' : 'Applicant'} <span>{formatDate(message.createdAt)}</span></div><p>{message.body}</p></div></div>)}</div>
            {activeTicket.applicationId && <div className="related-application"><FileText size={15} /><span>Related application</span><span className="mono">{activeTicket.applicationId}</span></div>}
            <div className="support-assignment">
              <label className="field-label" htmlFor="support-assignee">Assign to authorized staff by user ID</label>
              <div className="settings-inline-fields"><input id="support-assignee" className="text-input" value={assignee || activeTicket.assignedToUserId || ''} onChange={(event) => setAssignee(event.target.value)} placeholder="Staff user ID (leave blank to unassign)" data-testid="input-support-assignee" />
                <button className="button button-quiet" onClick={() => assignTicket(activeTicket)} disabled={assign.isPending} data-testid="button-support-assign">{assign.isPending ? 'Saving…' : 'Save assignment'}</button></div>
            </div>
            <label className="field-label" htmlFor="admin-reply">Your reply</label>
            <textarea id="admin-reply" className="text-input form-textarea admin-reply-input" maxLength={5000} value={drafts[activeTicket.id] ?? activeTicket.response ?? ''} onChange={(e) => setDrafts((prev) => ({ ...prev, [activeTicket.id]: e.target.value }))} placeholder="Write a clear, helpful response." data-testid="input-admin-reply" />
            {feedback && <p className="success-message" role="status" data-testid="text-reply-feedback">{feedback}</p>}
            <div className="reply-actions"><button className="button button-quiet" onClick={() => respond(activeTicket, 'resolved')} disabled={reply.isPending} data-testid="button-close-ticket">Reply & resolve</button>
              <button className="button button-primary" onClick={() => respond(activeTicket, 'in_progress')} disabled={reply.isPending} data-testid="button-send-reply">{reply.isPending ? 'Saving…' : 'Send reply'} <ArrowRight size={15} /></button></div>
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
  const portalSettings = useGetPortalSettings();
  useEffect(() => {
    const theme = portalSettings.data?.theme;
    if (!theme) return;
    document.documentElement.dataset.portalButtonSize = theme.buttonSize;
    document.documentElement.dataset.portalButtonPlacement = theme.buttonPlacement;
  }, [portalSettings.data?.theme.buttonSize, portalSettings.data?.theme.buttonPlacement]);
  return <Switch>
    <Route path="/" component={PublicLanding} />
    <Route path="/sign-in/*?" component={() => <AuthPage mode="in" />} />
    <Route path="/sign-up/*?" component={() => <AuthPage mode="up" />} />
    <Route path="/auth/complete" component={AuthComplete} />
    <Route path="/dashboard" component={() => <AuthGate><Dashboard /></AuthGate>} />
    <Route path="/apply/:applicationId" component={() => <AuthGate><DraftApplication /></AuthGate>} />
    <Route path="/applications/:applicationId" component={() => <AuthGate><ApplicationDetail /></AuthGate>} />
    <Route path="/support" component={() => <AuthGate><SupportPage /></AuthGate>} />
    <Route path="/admin" component={() => <AdminGate><AdminOverview /></AdminGate>} />
    <Route path="/admin/review" component={() => <AdminGate><AdminQueue /></AdminGate>} />
    <Route path="/admin/users" component={() => <AdminGate><AdminUsers /></AdminGate>} />
    <Route path="/admin/settings" component={() => <AdminGate><AdminSettings /></AdminGate>} />
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
