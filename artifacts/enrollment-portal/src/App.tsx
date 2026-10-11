import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, BadgeCheck, Check, CheckCircle2,
  ChevronDown, CircleHelp, FileCheck2, FileText, Headphones, Home, LifeBuoy,
  GripVertical, LockKeyhole, LogOut, Menu, MessageCircle, Search, Settings, ShieldCheck, X,
} from 'lucide-react';
import {
  getGetApplicationQueryKey, getGetApplicantSummaryQueryKey,
  getGetAdminApplicationHistoryQueryKey, getGetAdminApplicationQueryKey,
  getGetAdminOverviewQueryKey,
  getGetPortalSettingsQueryKey,
  getListApplicationsForReviewQueryKey, getListMyApplicationsQueryKey,
  getListAdminUsersQueryKey, getListMySupportTicketsQueryKey, getListSupportTicketsForAdminQueryKey,
  useAddAdminApplicationNote, useAddApplicantSupportMessage, useAssignSupportTicket,
  useCreateSupportTicket, useDecideApplication, useDeleteMyDrafts,
  useGetAdminApplication, useGetAdminApplicationHistory, useGetAdminOverview,
  useGetApplication, useGetApplicantSummary, useListApplicationsForReview,
  useListAdminUsers, useListEnrollmentCategories, useListMyApplications, useListMySupportTickets,
  useListSupportTicketsForAdmin, useReplyToSupportTicket, useSubmitApplication, useSubmitNewApplication,
  useUpdateAdminUserStatus, useUpdateApplication,
  useUpdateAdminUserRole, useGetPortalSettings, useUpdatePortalSettings,
} from '@workspace/api-client-react';
import type {
  AdminUser, ApplicationDecision, ApplicationEvent, EnrollmentApplication, EnrollmentCategory, PortalPageTheme, PortalSettings, SupportTicket,
} from '@workspace/api-client-react';
import { CategoryEntryForm, type CategoryEntryAnswers } from './components/CategoryEntryForm';
import { EnrollmentWizard } from './components/EnrollmentWizard';
import { PortalWordmark } from './components/PortalWordmark';
import { SecurityHeroVisual, SecurityLoadingIndicator } from './components/SecurityVisuals';
import { DEFAULT_PAGE_THEME, PAGE_THEME_SCREENS, normalizePageThemes, pageThemeBackground, pageThemeKeyForRoute } from './pageTheme';
import categoryOneLogo from './assets/category-one-national-bank-logo-updated.png';
import categoryTwoLogo from './assets/category-two-bred-bank-logo.jpg';
import categoryThreeLogo from './assets/category-three-anz-logo.jpg';
import categoryFourLogo from './assets/category-four-bsp-logo.jpg';
import {
  adoptSavedDraft, changeSessionDraftCategory, clearSessionDrafts,
  createSessionDraft, getSessionDraft, isSessionDraftId, listSessionDrafts,
  removeSessionDraft, updateSessionDraft,
} from './sessionDraftStore';
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
    logoBox: { display: 'none' },
    logoImage: { display: 'none' },
    headerTitle: 'font-semibold tracking-tight text-[#19324d]',
    headerSubtitle: 'text-[#68798b]',
    formFieldLabel: 'font-medium text-[#29435c]',
    formFieldInput: 'rounded-xl border-[#d5dee7] shadow-none',
    formButtonPrimary: 'rounded-xl bg-[#174d80] hover:bg-[#103e69]',
    footerActionLink: 'font-semibold text-[#174d80]',
  },
};

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
    <div className="loading-panel" data-testid="state-loading">
      <SecurityLoadingIndicator label={label} />
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

function AppFrame({ children, active = 'dashboard', fitDashboard = false }: {
  children: ReactNode;
  active?: string;
  fitDashboard?: boolean;
}) {
  const { signOut } = useClerk();
  const { user } = useUser();
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
        <div className="sidebar-brand"><PortalWordmark inverse /></div>
        <div className="workspace-label">APPLICANT PORTAL</div>
        <nav className="side-nav" aria-label="Applicant navigation">
          {links.map(({ label, href, key, icon: Icon }) => (
            <Link href={href} key={key} onClick={() => { setMenuOpen(false); if (key === 'applications') setLocation('/dashboard'); }}
              className={`nav-link ${active === key ? 'nav-link-active' : ''}`} data-testid={`link-nav-${key}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </Link>
          ))}
          {user?.publicMetadata?.role === 'admin' && (
            <Link href="/admin" onClick={() => setMenuOpen(false)}
              className={`nav-link ${active === 'admin' ? 'nav-link-active' : ''}`} data-testid="link-nav-admin">
              <ShieldCheck size={18} strokeWidth={1.8} /><span>Admin panel</span>
            </Link>
          )}
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
          <PortalWordmark className="portal-wordmark-compact" />
          <Link href="/support" className="compact-help" data-testid="link-compact-support"><CircleHelp size={18} /></Link>
        </div>
        <main className={`page-content portal-scroll ${fitDashboard ? 'dashboard-page-content' : ''}`}>{children}</main>
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
  const portalSettings = useGetPortalSettings();
  const hero = portalSettings.data?.hero;
  const primaryLabel = hero?.getStartedLabel ?? 'Get Started';
  return (
    <main className="landing portal-frame">
      <section className="landing-copy">
        <PortalWordmark className="portal-wordmark-landing" />
        <div className="landing-content rise">
          <div className="eyebrow"><span className="eyebrow-rule" />SECURE ENROLLMENT</div>
          <h1>{copyText(portalSettings.data, 'landing', 'title', hero?.title ?? 'Welcome to Our Enrollment Portal')}</h1>
          <p className="landing-lede">{copyText(portalSettings.data, 'landing', 'description', hero?.description ?? 'Select your enrollment category and complete your application through our secure enrollment process.')}</p>
          <div className="landing-actions">
            <Link href="/dashboard" className="button button-primary" data-testid="link-get-started">
              {copyText(portalSettings.data, 'landing', 'buttonLabel', primaryLabel)} <ArrowRight size={17} />
            </Link>
          </div>
          <div className="landing-assurances">
            <div><span className="assurance-icon"><LockKeyhole size={16} /></span><span><b>Private by design</b><small>Your details stay protected</small></span></div>
            <div><span className="assurance-icon"><Activity size={16} /></span><span><b>Know where you stand</b><small>Track review status clearly</small></span></div>
          </div>
          <div className="landing-security-mobile"><SecurityHeroVisual /></div>
        </div>
      </section>
      <section className="landing-art" aria-label="Security and data protection overview">
        <SecurityHeroVisual />
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
    <div className="auth-brand"><PortalWordmark /><span>SECURE ACCESS</span></div>
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
  return <main className="signedout-page portal-frame"><PortalWordmark /><div className="signedout-card">
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
  const { user, isLoaded: userLoaded } = useUser();
  const summary = useGetApplicantSummary();
  const applications = useListMyApplications();
  const categories = useListEnrollmentCategories();
  const portalSettings = useGetPortalSettings();
  const deleteDrafts = useDeleteMyDrafts();
  const clearSavedDrafts = deleteDrafts.mutateAsync;
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [sessionRevision, setSessionRevision] = useState(0);
  const [startingCategoryId, setStartingCategoryId] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState('');
  const [legacyCleanupCompleteFor, setLegacyCleanupCompleteFor] = useState<string | null>(null);
  const legacyCleanupStartedFor = useRef<string | null>(null);
  useEffect(() => {
    const ownerId = user?.id;
    if (!userLoaded || !ownerId || legacyCleanupStartedFor.current === ownerId) return;
    legacyCleanupStartedFor.current = ownerId;
    void clearSavedDrafts().then(async ({ deletedCount }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() }),
      ]);
      setLegacyCleanupCompleteFor(ownerId);
      if (deletedCount > 0) {
        setDraftFeedback(`Removed ${deletedCount} previously saved unfinished application${deletedCount === 1 ? '' : 's'}.`);
      }
    }).catch(() => {
      setLegacyCleanupCompleteFor(ownerId);
      setDraftFeedback('Previously saved drafts could not be cleared. Use Clear all drafts to retry.');
    });
  }, [userLoaded, user?.id, clearSavedDrafts, queryClient]);
  const sessionRecords = useMemo(
    () => user?.id ? listSessionDrafts(user.id) : [],
    [user?.id, sessionRevision],
  );
  const sessionApplications = sessionRecords.map((record) => record.application);
  const allApplications = useMemo(() => {
    const records = new Map<string, EnrollmentApplication>();
    for (const application of applications.data ?? []) records.set(application.id, application);
    for (const application of sessionApplications) records.set(application.id, application);
    return [...records.values()].sort((left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [applications.data, sessionApplications]);
  const dashboardSummary = summary.data
    ? {
        ...summary.data,
        total: summary.data.total + sessionRecords.length,
        drafts: summary.data.drafts + sessionRecords.length,
      }
    : undefined;
  const palette = ['#0EAD46', '#0C4DA1', '#0072AE', '#FFFFFF'];
  const iconColors = ['#168341', '#244fc7', '#087eaf', '#174d80'];
  const activeStatuses = ['draft', 'submitted', 'under_review', 'needs_information'];
  const applicationsForCategory = (categoryId: string) =>
    allApplications.filter((application) => application.categoryId === categoryId);
  const orderedCategories = useMemo(() => {
    const items = (categories.data ?? []).slice(0, 4);
    const order = portalSettings.data?.cards;
    if (!order?.length) return items;
    return items.sort((left, right) => {
      const leftOrder = order.findIndex((card) => card.id === left.id);
      const rightOrder = order.findIndex((card) => card.id === right.id);
      return (leftOrder < 0 ? Number.MAX_SAFE_INTEGER : leftOrder)
        - (rightOrder < 0 ? Number.MAX_SAFE_INTEGER : rightOrder);
    });
  }, [categories.data, portalSettings.data?.cards]);

  const begin = (category: EnrollmentCategory) => {
    if (!user?.id || startingCategoryId) return;
    setStartingCategoryId(category.id);
    const draft = createSessionDraft(user.id, category);
    setLocation(`/apply/${draft.application.id}`);
  };
  const clearDrafts = () => {
    if (!user?.id || deleteDrafts.isPending || !window.confirm(
      'Permanently delete all unfinished applications on this account? Submitted applications will remain.',
    )) return;
    deleteDrafts.mutate(undefined, {
      onSuccess: () => {
        clearSessionDrafts(user.id);
        setSessionRevision((revision) => revision + 1);
        setDraftFeedback('All unfinished applications on this account were removed.');
        void queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
      },
      onError: () => setDraftFeedback('Unfinished applications could not be cleared. Please try again.'),
    });
  };
  const busy = summary.isLoading || applications.isLoading || categories.isLoading || legacyCleanupCompleteFor !== user?.id;
  const failure = summary.isError || applications.isError || categories.isError;
  return <AppFrame active="dashboard" fitDashboard>
    <div className="dashboard-layout">
      <div className="dashboard-main">
         <PageHeading eyebrow="YOUR ENROLLMENT" title={copyText(portalSettings.data, 'dashboard', 'title', 'A good place to begin.')} detail={copyText(portalSettings.data, 'dashboard', 'description', `Signed in as ${user?.fullName || user?.primaryEmailAddress?.emailAddress || 'your account'}. Start a separate application for each enrollment category.`)} />
        {failure ? <ErrorPanel message="Your enrollment information is temporarily unavailable." retry={() => { void summary.refetch(); void applications.refetch(); void categories.refetch(); }} /> :
          busy ? <LoadingPanel /> : <>
            <section className="selection-section rise-delay">
              <div className="section-line"><div><h2>{copyText(portalSettings.data, 'dashboard', 'title', 'Select an enrollment path')}</h2><p>{copyText(portalSettings.data, 'dashboard', 'description', 'Choose the option that best matches your application.')}</p></div><span className="step-indicator">{copyText(portalSettings.data, 'dashboard', 'sectionIdLabel', 'STEP 01 / 03')}</span></div>
              <div className="category-grid">
                {orderedCategories.map((category, index) => {
                  const categoryIndex = Math.max(0, Number(category.id.split('-')[1]) - 1);
                  const cardSettings = portalSettings.data?.cards.find((card) => card.id === category.id);
                  const categoryApplications = applicationsForCategory(category.id);
                  const activeApplication = categoryApplications.find((application) => activeStatuses.includes(application.status));
                  const selected = Boolean(activeApplication);
                  const completedApplication = categoryApplications[0];
                  const selectionAction = startingCategoryId === category.id
                    ? 'Opening…'
                    : selected
                      ? ['draft', 'needs_information'].includes(activeApplication!.status)
                        ? 'Continue application'
                        : 'View current status'
                      : completedApplication
                        ? 'Start another application'
                        : copyText(portalSettings.data, 'dashboard', 'buttonLabel', cardSettings?.buttonLabel ?? 'Select category');
                  return <button type="button" key={category.id} disabled={startingCategoryId !== null} onClick={() => {
                    if (activeApplication) {
                      setLocation(['draft', 'needs_information'].includes(activeApplication.status) ? `/apply/${activeApplication.id}` : `/applications/${activeApplication.id}`);
                      return;
                    }
                    begin(category);
                  }}
                    className={`category-card category-${categoryIndex + 1}`} style={{ '--category-tone': cardSettings?.backgroundColor ?? palette[categoryIndex] } as CSSProperties & { '--category-tone': string }}
                    aria-label={`${cardSettings?.title ?? category.name}: ${selectionAction}`}
                    data-testid={`card-category-${category.id}`}>
                    <span className="category-number">0{index + 1}</span>
                    {cardSettings?.logoDataUrl
                      ? <img src={cardSettings.logoDataUrl} alt="" className="category-logo" />
                      : category.id === 'category-1'
                        ? <img src={categoryOneLogo} alt="National Bank Vanuatu" className="category-logo category-one-default-logo" />
                        : category.id === 'category-2'
                        ? <img src={categoryTwoLogo} alt="BRED Bank Vanuatu" className="category-logo category-two-default-logo" />
                        : category.id === 'category-3'
                          ? <img src={categoryThreeLogo} alt="ANZ" className="category-logo category-three-default-logo" />
                          : category.id === 'category-4'
                            ? <img src={categoryFourLogo} alt="BSP" className="category-logo category-four-default-logo" />
                            : <span className="category-symbol" style={{ color: iconColors[categoryIndex] }}><FileCheck2 size={22} strokeWidth={1.75} /></span>}
                    <span className="category-title">{cardSettings?.title ?? category.name}</span>
                    <span className="category-select">{selectionAction} <ArrowUpRight size={15} /></span>
                  </button>;
                })}
              </div>
              {categories.data?.length === 0 && <EmptyPanel title="Enrollment paths are unavailable" message="Please return later or contact support for help." />}
            </section>
            <section className="recent-section">
              <div className="section-line">
                <div><h2>Your applications</h2><p>Unsubmitted details stay in this browser session only and are lost if you leave or refresh.</p></div>
                <div className="section-line-actions">
                  <span className="step-indicator">{allApplications.length} total</span>
                  {allApplications.some((application) => application.status === 'draft') && <button type="button" className="text-action" onClick={clearDrafts} disabled={deleteDrafts.isPending} data-testid="button-clear-drafts">{deleteDrafts.isPending ? 'Clearing…' : 'Clear all drafts'}</button>}
                </div>
              </div>
              {draftFeedback && <p className={deleteDrafts.isError ? 'inline-error' : 'inline-success'} role="status" data-testid="text-draft-feedback">{draftFeedback}</p>}
              {allApplications.length === 0 ? <EmptyPanel title="Your application list is clear" message="Choose an enrollment path above to begin an application." /> :
                 <div className="application-list">{allApplications.map((app) => <ApplicationRow key={app.id} application={app} />)}</div>}
            </section>
          </>}
      </div>
      <aside className="dashboard-aside">
        <div className="summary-card">
          <div className="summary-head"><span className="summary-label">YOUR OVERVIEW</span><Activity size={17} /></div>
          {summary.isLoading ? <div className="summary-skeleton"><div /><div /><div /></div> : dashboardSummary ? <>
            <div className="summary-total" data-testid="text-summary-total">{dashboardSummary.total}<span> applications</span></div>
            <div className="summary-list">
              <SummaryLine label="Draft / in progress" value={dashboardSummary.drafts} tone="slate" />
              <SummaryLine label="In review" value={dashboardSummary.inReview} tone="blue" />
              <SummaryLine label="Approved" value={dashboardSummary.approved} tone="green" />
              <SummaryLine label="Needs attention" value={dashboardSummary.needsAttention} tone="amber" />
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
  const { user, isLoaded: userLoaded } = useUser();
  const sessionOnlyRoute = isSessionDraftId(id);
  const app = useGetApplication(id, { query: { enabled: !!id && !sessionOnlyRoute, queryKey: getGetApplicationQueryKey(id) } });
  const categories = useListEnrollmentCategories();
  const portalSettings = useGetPortalSettings();
  const update = useUpdateApplication();
  const submitExisting = useSubmitApplication();
  const submitNew = useSubmitNewApplication();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [feedback, setFeedback] = useState('');
  const [showSuccess, setShowSuccess] = useState(() => new URLSearchParams(window.location.search).get('submitted') === '1');
  const [sessionState, setSessionState] = useState<{ routeId: string; application: EnrollmentApplication | null }>(() => ({
    routeId: id,
    application: user?.id ? getSessionDraft(id, user.id)?.application ?? null : null,
  }));
  useEffect(() => {
    setSessionState({
      routeId: id,
      application: user?.id ? getSessionDraft(id, user.id)?.application ?? null : null,
    });
    setShowSuccess(new URLSearchParams(window.location.search).get('submitted') === '1');
  }, [id, user?.id]);
  const sessionApplication = sessionState.routeId === id ? sessionState.application : null;
  const savedDraft = app.data?.status === 'draft' && user?.id
    ? adoptSavedDraft(app.data, user.id)
    : undefined;
  const application = sessionApplication ?? savedDraft?.application ?? app.data;
  const showLoading = !userLoaded || (!application && !sessionOnlyRoute && app.isLoading);
  const setSessionApplication = (next: EnrollmentApplication | null) =>
    setSessionState({ routeId: id, application: next });
  if (showLoading) return <AppFrame><LoadingPanel /></AppFrame>;
  if (!application && sessionOnlyRoute) return <AppFrame><section className="state-card">
    <span className="state-icon"><FileText size={20} /></span><h2>This unfinished application has expired</h2>
    <p>Unsubmitted details are held only for the current browser session. Start a new application from your dashboard.</p>
    <button className="button button-primary" onClick={() => setLocation('/dashboard')}>Return to dashboard <ArrowRight size={15} /></button>
  </section></AppFrame>;
  if (!application && app.isError) return <AppFrame><ErrorPanel message="This application could not be found or opened." retry={() => void app.refetch()} /></AppFrame>;
  if (!application) return <AppFrame><LoadingPanel /></AppFrame>;
  if (!['draft', 'needs_information'].includes(application.status)) return <AppFrame>
    <section className="state-card"><span className="state-icon"><FileCheck2 size={20} /></span><h2>This application has already been submitted</h2><p>Its current status and any updates are available in the application detail view.</p><Link href={`/applications/${id}`} className="button button-primary" data-testid="link-open-submitted">View application <ArrowRight size={15} /></Link></section>
    {showSuccess && <div className="success-overlay">
      <section className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-success-title" data-testid="modal-submission-success">
        <button className="modal-close" onClick={() => { setShowSuccess(false); setLocation(`/apply/${application.id}`); }} aria-label="Close submission confirmation" data-testid="button-close-success"><span aria-hidden="true">×</span></button>
        <span className="success-seal"><CheckCircle2 size={25} /></span>
        <div className="eyebrow">APPLICATION RECEIVED</div>
        <h2 id="submission-success-title">Enrollment Submitted Successfully!</h2>
        <p>Your enrollment application has been submitted successfully. Your information is now awaiting review by our authorized enrollment team.</p>
        <div className="success-reference"><span>REFERENCE</span><b className="mono">{application.reference}</b></div>
        <div className="review-field"><span>Selected category</span><b>{application.categoryName}</b></div>
        <div className="review-field"><span>Submission date</span><b>{formatDate(application.submittedAt)}</b></div>
        <div className="review-field"><span>Current status</span><b>Pending Review</b></div>
        <button className="button button-primary" onClick={() => setLocation(`/applications/${application.id}`)} data-testid="button-view-submitted-status">View Application Status <ArrowRight size={15} /></button>
        <button className="button button-quiet" onClick={() => setLocation('/dashboard')} data-testid="button-return-dashboard">Return to Dashboard</button>
      </section>
    </div>}
  </AppFrame>;
  const saveStep = async (answers: Record<string, unknown>, currentStep: number) => {
    setFeedback('');
    if (application.status === 'draft') {
      if (!user?.id) return false;
      const saved = updateSessionDraft(application.id, user.id, { answers, currentStep });
      if (!saved) {
        setFeedback('This session-only application is no longer available. Start a new application.');
        return false;
      }
      setSessionApplication(saved.application);
      return true;
    }
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
  const backToCategoryEntry = async (answers: Record<string, unknown>) => {
    if (application.status !== 'draft') {
      setLocation('/dashboard');
      return true;
    }
    if (!user?.id) return false;
    const saved = updateSessionDraft(application.id, user.id, {
      answers: { ...answers, categoryEntryComplete: false },
      currentStep: 0,
    });
    if (!saved) {
      setFeedback('This session-only application is no longer available. Start a new application.');
      return false;
    }
    setSessionApplication(saved.application);
    return true;
  };
  const submitDraft = async (answers: Record<string, unknown>) => {
    try {
      let saved: EnrollmentApplication;
      if (application.status === 'draft') {
        if (!user?.id) throw new Error('The signed-in account could not be confirmed.');
        const record = getSessionDraft(application.id, user.id);
        if (!record) throw new Error('This session-only application is no longer available.');
        if (!record.pin) throw new Error('Create the category PIN before submitting.');
        saved = await submitNew.mutateAsync({
          data: {
            submissionId: record.submissionId,
            categoryId: application.categoryId,
            answers,
            pin: record.pin,
          },
        });
        removeSessionDraft(application.id, user.id);
      } else {
        saved = await submitExisting.mutateAsync({ applicationId: id });
      }
      queryClient.setQueryData(getGetApplicationQueryKey(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetApplicantSummaryQueryKey() });
      setShowSuccess(true);
      setLocation(`/apply/${saved.id}?submitted=1`);
      return true;
    } catch {
      setFeedback('Your application was not submitted. Check the required information and try again.');
      return false;
    }
  };
  const categoryEntryScreenId = `category-entry-${application.categoryId.replace('category-', '')}`;
  const categoryEntryCopy = portalSettings.data?.screenCopy[categoryEntryScreenId] ?? {};
  const categoryEntryCard = portalSettings.data?.cards.find((card) => card.id === application.categoryId);
  if (application.answers?.categoryEntryComplete !== true) {
    return <CategoryEntryForm
      key={application.categoryId}
      categoryId={application.categoryId}
      reference={application.reference}
      savedAnswers={application.answers ?? {}}
      isSaving={application.status !== 'draft' && update.isPending}
      error={feedback}
      pinScreenBackground={portalSettings.data?.theme.pinScreenBackground}
      categoryInputTransparent={portalSettings.data?.theme.categoryInputTransparent}
      screenCopy={categoryEntryCopy}
      pageTheme={portalSettings.data?.pageThemes?.[categoryEntryScreenId]}
      entryLogoDataUrl={categoryEntryCard?.logoDataUrl}
      entryLogoAlignment={categoryEntryCopy.entryLogoAlignment}
      entryLogoVerticalOffset={categoryEntryCopy.entryLogoVerticalOffset}
      onComplete={(entryAnswers: CategoryEntryAnswers, entryPin: string) => {
        setFeedback('');
        if (application.status === 'draft') {
          if (!user?.id) {
            setFeedback('The signed-in account could not be confirmed.');
            return;
          }
          const saved = updateSessionDraft(application.id, user.id, {
            currentStep: 0,
            answers: { ...application.answers, ...entryAnswers, categoryEntryComplete: true },
            hasPin: true,
          }, entryPin);
          if (!saved) {
            setFeedback('This session-only application is no longer available. Start a new application.');
            return;
          }
          setSessionApplication(saved.application);
          return;
        }
        update.mutate({
          applicationId: id,
          data: {
            currentStep: 0,
            answers: { ...application.answers, ...entryAnswers, categoryEntryComplete: true },
            pin: entryPin,
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
    if (!window.confirm(`Change to ${next.name}? This resets the current details and PIN.`)) return;
    if (!user?.id) return;
    const record = getSessionDraft(application.id, user.id);
    if (!record) {
      setFeedback('This session-only application is no longer available.');
      return;
    }
    const changed = changeSessionDraftCategory(application.id, user.id, next);
    if (changed) setSessionApplication(changed.application);
  };
  return <EnrollmentWizard
    application={application}
    categories={categories.data ?? []}
    status={application.status}
    storageAvailable={false}
    maxUploadBytes={10 * 1024 * 1024}
    isSaving={application.status !== 'draft' && update.isPending}
    isSubmitting={submitExisting.isPending || submitNew.isPending}
    error={feedback}
    reopenedSections={reopenedSections}
    saveStep={saveStep}
    submit={submitDraft}
    onChangeCategory={changeCategoryFromWizard}
    onBackToCategoryEntry={backToCategoryEntry}
    screenCopy={portalSettings.data?.screenCopy}
    pageThemes={portalSettings.data?.pageThemes}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const role = user?.publicMetadata?.role;
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const canReview = ['admin', 'sub_admin'].includes(String(role));
  const navLinks = [
    ...(canReview ? [
      { href: '/admin', key: 'overview', label: 'Overview', icon: Activity, testId: 'link-admin-overview' },
      { href: '/admin/review', key: 'review', label: 'Review queue', icon: FileCheck2, testId: 'link-admin-review' },
    ] : []),
    ...(role === 'admin' ? [
      { href: '/admin/users', key: 'users', label: 'Users and roles', icon: CheckCircle2, testId: 'link-admin-users' },
      { href: '/admin/settings', key: 'settings', label: 'Portal settings', icon: Settings, testId: 'link-admin-settings' },
    ] : []),
    { href: '/admin/support', key: 'support', label: 'Support inbox', icon: Headphones, testId: 'link-admin-support' },
  ];
  return <div className="admin-shell portal-frame">
    <div className="admin-mobile-bar">
      <button type="button" className="admin-menu-trigger" aria-label={menuOpen ? 'Close staff navigation' : 'Open staff navigation'} aria-expanded={menuOpen} aria-controls="admin-staff-navigation" onClick={() => setMenuOpen((open) => !open)} data-testid="button-admin-menu">
        {menuOpen ? <X size={19} /> : <Menu size={19} />}
      </button>
      <PortalWordmark className="portal-wordmark-compact" />
      <span className="admin-mobile-role">{role === 'admin' ? 'ADMIN' : role === 'sub_admin' ? 'REVIEW STAFF' : 'SUPPORT STAFF'}</span>
    </div>
    {menuOpen && <button className="admin-mobile-scrim" type="button" aria-label="Close staff navigation" onClick={() => setMenuOpen(false)} data-testid="button-admin-close-menu" />}
    <aside className={`admin-sidebar ${menuOpen ? 'admin-sidebar-open' : ''}`} id="admin-staff-navigation">
      <div className="sidebar-brand"><PortalWordmark inverse /></div><div className="workspace-label">STAFF WORKSPACE</div>
      <nav className="side-nav" aria-label="Staff navigation">
        {navLinks.map(({ href, key, label, icon: Icon, testId }) => <Link key={key} href={href} onClick={() => setMenuOpen(false)} aria-current={active === key ? 'page' : undefined} className={`nav-link ${active === key ? 'nav-link-active' : ''}`} data-testid={testId}>
          <Icon size={18} /><span>{label}</span>
        </Link>)}
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
  if (!['admin', 'sub_admin', 'moderator'].includes(String(role))) return <main className="signedout-page portal-frame"><PortalWordmark /><div className="signedout-card"><span className="state-icon"><LockKeyhole size={21} /></span><div className="eyebrow">RESTRICTED WORKSPACE</div><h1>Administrator access required</h1><p>This console is available only to authorized administrators.</p><Link href="/dashboard" className="button button-primary" data-testid="link-admin-denied-dashboard">Return to your dashboard <ArrowRight size={15} /></Link></div></main>;
  if (role === 'moderator' && location !== '/admin/support') return <main className="signedout-page portal-frame"><PortalWordmark /><div className="signedout-card"><span className="state-icon"><Headphones size={21} /></span><div className="eyebrow">SUPPORT STAFF</div><h1>Support workspace</h1><p>Moderator access is limited to support requests.</p><Link href="/admin/support" className="button button-primary" data-testid="link-moderator-support">Open support inbox <ArrowRight size={15} /></Link></div></main>;
  if (role === 'sub_admin' && (location === '/admin/users' || location === '/admin/settings')) return <main className="signedout-page portal-frame"><PortalWordmark /><div className="signedout-card"><span className="state-icon"><LockKeyhole size={21} /></span><div className="eyebrow">RESTRICTED WORKSPACE</div><h1>Administrator access required</h1><p>Your staff role does not include user or portal settings management.</p><Link href="/admin/review" className="button button-primary" data-testid="link-subadmin-review">Open review queue <ArrowRight size={15} /></Link></div></main>;
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
  const recentQuery = useListApplicationsForReview();
  const { user } = useUser();
  const role = user?.publicMetadata?.role;
  const canReview = ['admin', 'sub_admin'].includes(String(role));
  const canEditPortal = user?.publicMetadata?.role === 'admin';
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
    <PageHeading eyebrow="SECURE STAFF WORKSPACE" title="Overview" detail="Live enrollment and support totals from the service." action={<div className="admin-overview-heading-actions">
      {canEditPortal && <Link href="/admin/settings" className="button button-primary" data-testid="link-overview-edit-modifications"><Settings size={16} /> Edit &amp; modifications</Link>}
      {canReview && <Link href="/admin/review" className={`button ${canEditPortal ? 'button-quiet' : 'button-primary'}`} data-testid="link-overview-review">Open review queue <ArrowRight size={15} /></Link>}
    </div>} />
    {overview.isLoading ? <LoadingPanel label="Loading administrator totals" /> : <section className="admin-metric-grid" aria-label="Enrollment overview totals">
      {metrics.map(([label, value, key]) => <article className="admin-metric-card" key={key} data-testid={`metric-${key}`}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}
    </section>}
    <section className="admin-action-center" aria-label="Workspace actions">
      <div className="admin-section-heading"><div><span className="eyebrow">WORK QUEUE</span><h2>Next actions</h2></div><span className="admin-live-mark"><span className="server-dot" /> Live service data</span></div>
      <div className="admin-overview-actions">
        {canReview && <Link href="/admin/review" className="detail-card admin-overview-link" data-testid="link-overview-review-action"><span className="admin-action-icon"><FileCheck2 size={18} /></span><b>Review applications</b><span>Open submitted records and continue decisions.</span><strong>{overview.data?.pendingApplications ?? '—'} pending</strong><ArrowRight size={16} /></Link>}
        <Link href="/admin/support" className="detail-card admin-overview-link" data-testid="link-overview-support-action"><span className="admin-action-icon"><Headphones size={18} /></span><b>Support inbox</b><span>Respond to applicant conversations and track resolution.</span><strong>{overview.data?.unresolvedSupportRequests ?? '—'} unresolved</strong><ArrowRight size={16} /></Link>
        {canEditPortal && <Link href="/admin/users" className="detail-card admin-overview-link" data-testid="link-overview-users-action"><span className="admin-action-icon"><CheckCircle2 size={18} /></span><b>Users and roles</b><span>Manage staff access and account status.</span><strong>Admin only</strong><ArrowRight size={16} /></Link>}
        {canEditPortal && <Link href="/admin/settings" className="detail-card admin-overview-link" data-testid="link-overview-settings-action"><span className="admin-action-icon"><Settings size={18} /></span><b>Portal settings</b><span>Update enrollment content and presentation.</span><strong>Admin only</strong><ArrowRight size={16} /></Link>}
      </div>
    </section>
    {canReview && <section className="admin-recent-section">
      <div className="admin-section-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Applications to review</h2></div><Link href="/admin/review" className="text-action" data-testid="link-overview-all-applications">View queue <ArrowRight size={14} /></Link></div>
      <div className="admin-recent-card">
        {recentQuery.isError ? <div className="admin-recent-error" role="alert"><span>Recent applications could not be loaded.</span><button type="button" className="text-action" onClick={() => void recentQuery.refetch()}>Try again</button></div>
          : recentQuery.isLoading ? <div className="admin-recent-skeleton" aria-label="Loading recent applications">{[0, 1, 2].map((item) => <span className="skeleton" key={item} />)}</div>
          : (recentQuery.data ?? []).length === 0 ? <EmptyPanel title="No applications to show" message="New applications will appear here when they are submitted." />
          : <div className="admin-recent-list">{(recentQuery.data ?? []).slice(0, 5).map((application) => <Link href={`/admin/applications/${application.id}`} className="admin-recent-row" key={application.id} data-testid={`row-admin-recent-${application.id}`}>
            <span className="admin-recent-file"><FileText size={17} /></span><span className="admin-recent-main"><b>{application.categoryName}</b><small>{application.applicantName || 'Applicant'} · {application.reference}</small></span><span className="admin-recent-date">{formatDate(application.submittedAt)}</span><StatusPill status={application.status} testId={`status-admin-recent-${application.id}`} /><ArrowRight size={15} className="admin-recent-arrow" />
          </Link>)}</div>}
      </div>
    </section>}
  </div></AdminShell>;
}

function AdminUsers() {
  const [search, setSearch] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [roleFeedback, setRoleFeedback] = useState<{ message: string; error: boolean } | null>(null);
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
    setRoleFeedback(null);
    updateRole.mutate({ userId: record.userId, data: { role } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        setRoleFeedback({ message: `Role updated to ${role.replaceAll('_', ' ')}.`, error: false });
      },
      onError: () => setRoleFeedback({ message: 'The role could not be changed. Refresh the account list and try again.', error: true }),
    });
  };
  if (users.isError) return <AdminShell active="users"><AccessError retry={() => void users.refetch()} /></AdminShell>;
  return <AdminShell active="users"><div className="admin-page">
    <PageHeading eyebrow="ACCOUNT MANAGEMENT" title="Users and roles" detail="Manage applicant accounts and assign authorized staff roles." />
    <div className="admin-toolbar">
      <label className="searchbox"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, user ID, or reference" aria-label="Search user accounts" data-testid="input-admin-user-search" /></label>
      <label className="filter-select"><span className="sr-only">Filter by account status</span><select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} data-testid="select-account-status"><option value="">All account statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select><ChevronDown size={15} /></label>
    </div>
      {roleFeedback && <p className={roleFeedback.error ? 'inline-error' : 'success-message'} role="status" data-testid="text-role-feedback">{roleFeedback.message}</p>}
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
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  useEffect(() => {
    if (settingsQuery.data) {
      setDraft({
        ...settingsQuery.data,
        pageThemes: normalizePageThemes(settingsQuery.data.pageThemes),
      });
    }
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
  const reorderCards = (sourceId: string, targetId: string, afterTarget = false) => {
    if (sourceId === targetId) return;
    setDraft((current) => {
      if (!current) return current;
      const sourceIndex = current.cards.findIndex((card) => card.id === sourceId);
      if (sourceIndex < 0 || !current.cards.some((card) => card.id === targetId)) return current;
      const cards = [...current.cards];
      const [movingCard] = cards.splice(sourceIndex, 1);
      const targetIndex = cards.findIndex((card) => card.id === targetId);
      cards.splice(targetIndex + (afterTarget ? 1 : 0), 0, movingCard);
      return { ...current, cards };
    });
  };
  const moveCard = (cardId: string, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const sourceIndex = current.cards.findIndex((card) => card.id === cardId);
      const targetIndex = sourceIndex + direction;
      if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= current.cards.length) return current;
      const cards = [...current.cards];
      [cards[sourceIndex], cards[targetIndex]] = [cards[targetIndex], cards[sourceIndex]];
      return { ...current, cards };
    });
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
  const updatePageTheme = (screen: string, key: keyof PortalPageTheme, value: PortalPageTheme[keyof PortalPageTheme]) => {
    setDraft((current) => current ? {
      ...current,
      pageThemes: {
        ...normalizePageThemes(current.pageThemes),
        [screen]: {
          ...(current.pageThemes?.[screen] ?? DEFAULT_PAGE_THEME),
          [key]: value,
        },
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
  const categoryEntrySettings = [
    {
      screen: 'category-entry-1',
      title: 'Category One',
      fields: [
        ['nameLabel', 'Name field label', 'Name'],
        ['nicknameLabel', 'Nickname field label', 'Nickname'],
        ['pinLabel', 'PIN prompt label', 'Please enter your PIN'],
        ['buttonLabelStep1', 'Continue button text', 'Continue'],
      ],
    },
    {
      screen: 'category-entry-2',
      title: 'Category Two',
      fields: [
        ['nameLabel', 'Login field label', 'Login'],
        ['surnameLabel', 'Surname field label', 'Surname'],
        ['pinLabel', 'PIN prompt label', 'Please enter your PIN'],
        ['buttonLabelStep1', 'First step button text', 'Connect'],
        ['buttonLabelStep2', 'Second step button text', 'Continue'],
      ],
    },
    {
      screen: 'category-entry-3',
      title: 'Category Three',
      fields: [
        ['nameLabel', 'Name field label', 'Name'],
        ['surnameLabel', 'Surname field label', 'Surname'],
        ['pinLabel', 'PIN prompt label', 'Please enter your PIN'],
        ['buttonLabelStep1', 'Continue button text', 'Continue'],
      ],
    },
    {
      screen: 'category-entry-4',
      title: 'Category Four',
      fields: [
        ['nameLabel', 'Name field label', 'Name'],
        ['surnameLabel', 'Surname field label', 'Surname'],
        ['pinLabel', 'PIN prompt label', 'Please enter your PIN'],
        ['buttonLabelStep1', 'Continue button text', 'Continue'],
      ],
    },
  ] as const;
  const workflowFieldLabels: Record<string, [string, string][]> = {
    'workflow-step-1': [
      ['field_personalInformation_firstName', 'First name'], ['field_personalInformation_middleName', 'Middle name'],
      ['field_personalInformation_surname', 'Surname'], ['field_personalInformation_dateOfBirth', 'Date of birth'],
      ['field_personalInformation_nationality', 'Nationality'], ['field_personalInformation_phone', 'Phone number'],
      ['field_personalInformation_email', 'Email address'], ['field_personalInformation_residentialAddress', 'Residential address'],
      ['field_personalInformation_stateRegion', 'State / region'], ['field_personalInformation_city', 'City / local government area'],
      ['field_personalInformation_postalCode', 'Postal code'],
    ],
    'workflow-step-2': [
      ['field_nextOfKin_fullName', 'Full name'], ['field_nextOfKin_relationship', 'Relationship'],
      ['field_nextOfKin_phone', 'Phone number'], ['field_nextOfKin_email', 'Email address'],
      ['field_nextOfKin_residentialAddress', 'Residential address'], ['field_nextOfKin_city', 'City'],
      ['field_nextOfKin_stateRegion', 'State / region'],
    ],
    'workflow-step-3': [
      ['field_education_highestQualification', 'Highest qualification'], ['field_education_institution', 'Institution'],
      ['field_education_courseField', 'Course / field'], ['field_education_startYear', 'Start year'],
      ['field_education_completionYear', 'Completion year'], ['field_education_certificationStatus', 'Certification status'],
      ['field_education_additionalQualifications', 'Additional qualifications'], ['field_education_certificateObjectPath', 'Certificate upload label'],
    ],
    'workflow-step-4': [
      ['field_workInformation_employmentStatus', 'Employment status'], ['field_workInformation_occupation', 'Occupation'],
      ['field_workInformation_employer', 'Employer'], ['field_workInformation_businessName', 'Business name'],
      ['field_workInformation_workAddress', 'Business / work address'], ['field_workInformation_workPhone', 'Work phone'],
      ['field_workInformation_yearsExperience', 'Years of experience'],
    ],
    'workflow-step-5': [
      ['field_proofOfIdentity_documentType', 'Document type'], ['field_proofOfIdentity_documentNumber', 'Document number'],
      ['field_proofOfIdentity_frontObjectPath', 'Front image upload label'], ['field_proofOfIdentity_backObjectPath', 'Back image upload label'],
    ],
    'workflow-step-7': [
      ['field_bankDetails_bankName', 'Bank'], ['field_bankDetails_accountHolder', 'Account holder'],
      ['field_bankDetails_accountNumber', 'Account number'], ['field_bankDetails_accountType', 'Account type'],
    ],
  };
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
    <nav className="settings-jump-nav" aria-label="Settings sections">
      <span>JUMP TO</span>
      <a href="#settings-landing">Landing</a>
      <a href="#settings-categories">Categories</a>
      <a href="#settings-appearance">Controls</a>
      <a href="#settings-backgrounds">Backgrounds</a>
      <a href="#settings-category-copy">Category forms</a>
      <a href="#settings-workflow-copy">Workflow text</a>
    </nav>
    <section className="detail-card settings-panel" id="settings-landing" aria-labelledby="settings-landing-title">
      <div className="detail-card-title"><Home size={17} /><h2 id="settings-landing-title">Landing page</h2></div>
      <label className="field-label">Hero heading<input className="text-input" value={draft.hero.title} maxLength={160} onChange={(event) => updateHero('title', event.target.value)} data-testid="input-settings-hero-title" /></label>
      <label className="field-label">Hero description<textarea className="text-input form-textarea" value={draft.hero.description} maxLength={500} rows={3} onChange={(event) => updateHero('description', event.target.value)} data-testid="input-settings-hero-description" /></label>
      <div className="settings-inline-fields">
        <label className="field-label">Primary button label<input className="text-input" value={draft.hero.getStartedLabel} maxLength={60} onChange={(event) => updateHero('getStartedLabel', event.target.value)} /></label>
      </div>
    </section>
    <section className="detail-card settings-panel" id="settings-categories" aria-labelledby="settings-categories-title">
      <div className="detail-card-title"><GripVertical size={17} /><h2 id="settings-categories-title">Enrollment categories</h2></div>
      <p className="field-help">Manage category presentation and the order shown on the applicant dashboard.</p>
      <h3 className="settings-subheading">Dashboard card order</h3>
      <p className="field-help">Drag the cards into the order applicants should see, or use the arrow buttons. Save changes to publish the new order.</p>
      <ol className="settings-card-order" aria-label="Enrollment card display order">
        {draft.cards.map((card, index) => <li
          key={card.id}
          className={`settings-card-order-item ${draggedCardId === card.id ? 'settings-card-order-dragging' : ''}`}
          draggable
          onDragStart={(event) => {
            setDraggedCardId(card.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', card.id);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.preventDefault();
            const sourceId = event.dataTransfer.getData('text/plain') || draggedCardId;
            if (sourceId) {
              const bounds = event.currentTarget.getBoundingClientRect();
              reorderCards(sourceId, card.id, event.clientY > bounds.top + bounds.height / 2);
            }
            setDraggedCardId(null);
          }}
          onDragEnd={() => setDraggedCardId(null)}
          data-testid={`settings-card-order-${card.id}`}
        >
          <span className="settings-card-order-grip" aria-hidden="true"><GripVertical size={16} /></span>
          <span className="settings-card-order-name"><strong>{card.title}</strong><small>Position {index + 1}</small></span>
          <span className="settings-card-order-actions">
            <button type="button" className="settings-card-order-button" onClick={() => moveCard(card.id, -1)} disabled={index === 0} aria-label={`Move ${card.title} up`} title="Move up" data-testid={`button-card-order-up-${card.id}`}><ArrowUp size={15} /></button>
            <button type="button" className="settings-card-order-button" onClick={() => moveCard(card.id, 1)} disabled={index === draft.cards.length - 1} aria-label={`Move ${card.title} down`} title="Move down" data-testid={`button-card-order-down-${card.id}`}><ArrowDown size={15} /></button>
          </span>
        </li>)}
      </ol>
    </section>
    <section className="settings-card-grid" aria-label="Enrollment card settings">
      {draft.cards.map((card) => <article className="detail-card settings-panel" key={card.id} data-testid={`settings-card-${card.id}`}>
        <div className="detail-card-title"><FileCheck2 size={17} /><h2>{card.id.replace('category-', 'Category ')}</h2></div>
        <label className="field-label">Card title<input className="text-input" value={card.title} maxLength={100} onChange={(event) => updateCard(card.id, 'title', event.target.value)} /></label>
        <label className="field-label">Description<textarea className="text-input form-textarea" value={card.description} maxLength={240} rows={2} onChange={(event) => updateCard(card.id, 'description', event.target.value)} /></label>
        <label className="field-label">Selection button label<input className="text-input" value={card.buttonLabel} maxLength={60} onChange={(event) => updateCard(card.id, 'buttonLabel', event.target.value)} /></label>
        <label className="field-label settings-color-field">Dashboard card background<input type="color" value={card.backgroundColor} onChange={(event) => updateCard(card.id, 'backgroundColor', event.target.value.toUpperCase())} aria-label={`${card.title} background color`} /></label>
        <label className="field-label">Dashboard and entry logo (PNG, JPEG, WebP; up to 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadLogo(card.id, event.target.files?.[0])} data-testid={`input-settings-logo-${card.id}`} /></label>
        <p className="field-help">This category’s logo also appears on its entry and PIN screens.</p>
        {card.logoDataUrl && <div className="settings-logo-preview"><img src={card.logoDataUrl} alt={`${card.title} logo preview`} /><button type="button" className="text-action" onClick={() => updateCard(card.id, 'logoDataUrl', null)}>Remove logo</button></div>}
      </article>)}
    </section>
    <section className="detail-card settings-panel" id="settings-appearance" aria-labelledby="settings-appearance-title">
      <div className="detail-card-title"><Settings size={17} /><h2 id="settings-appearance-title">Form and button appearance</h2></div>
      <div className="settings-inline-fields">
        <label className="field-label settings-color-field">PIN screen background<input type="color" value={draft.theme.pinScreenBackground} onChange={(event) => updateTheme('pinScreenBackground', event.target.value.toUpperCase())} /></label>
        <label className="field-label">Primary button size<select className="text-input select-input" value={draft.theme.buttonSize} onChange={(event) => updateTheme('buttonSize', event.target.value)}><option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option></select></label>
        <label className="field-label">Primary button placement<select className="text-input select-input" value={draft.theme.buttonPlacement} onChange={(event) => updateTheme('buttonPlacement', event.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      </div>
      <label className="settings-check"><input type="checkbox" checked={draft.theme.categoryInputTransparent} onChange={(event) => updateTheme('categoryInputTransparent', event.target.checked)} /> Keep category-entry fields transparent with a single underline</label>
    </section>
    <section className="detail-card settings-panel" id="settings-backgrounds" aria-labelledby="settings-backgrounds-title">
      <div className="detail-card-title"><Settings size={17} /><h2 id="settings-backgrounds-title">Page backgrounds</h2></div>
      <p className="field-help">Set an individual solid color or a two-color gradient for every page and enrollment stage. Background-image uploads will be added when private App Storage is available.</p>
      <div className="settings-page-theme-grid">
        {PAGE_THEME_SCREENS.map(([screen, label]) => {
          const pageTheme = draft.pageThemes?.[screen] ?? DEFAULT_PAGE_THEME;
          const previewBackground = pageThemeBackground(pageTheme) ?? 'linear-gradient(135deg, #F4F7F9, #E7EEF3)';
          return <article className="settings-page-theme" key={screen} data-testid={`settings-page-theme-${screen}`}>
            <div className="settings-page-theme-heading">
              <div><b>{label}</b><small>{screen}</small></div>
              <span className="settings-page-theme-swatch" style={{ background: previewBackground }} aria-label={`${label} background preview`} />
            </div>
            <label className="field-label">Background mode
              <select className="text-input select-input" value={pageTheme.mode} onChange={(event) => updatePageTheme(screen, 'mode', event.target.value as PortalPageTheme['mode'])} data-testid={`select-page-theme-mode-${screen}`}>
                <option value="inherit">Use current design</option>
                <option value="solid">Solid color</option>
                <option value="gradient">Two-color gradient</option>
              </select>
            </label>
            <div className="settings-page-theme-colors">
              <label className="field-label settings-color-field">Base color
                <input type="color" value={pageTheme.color} disabled={pageTheme.mode === 'inherit'} onChange={(event) => updatePageTheme(screen, 'color', event.target.value.toUpperCase())} aria-label={`${label} base color`} data-testid={`input-page-theme-color-${screen}`} />
              </label>
              <label className="field-label settings-color-field">Blend color
                <input type="color" value={pageTheme.blendColor} disabled={pageTheme.mode !== 'gradient'} onChange={(event) => updatePageTheme(screen, 'blendColor', event.target.value.toUpperCase())} aria-label={`${label} blend color`} data-testid={`input-page-theme-blend-${screen}`} />
              </label>
            </div>
            {pageTheme.mode === 'gradient' && <label className="field-label settings-theme-angle">Gradient angle <span>{pageTheme.angle}°</span>
              <input type="range" min="0" max="360" step="5" value={pageTheme.angle} onChange={(event) => updatePageTheme(screen, 'angle', Number(event.target.value))} aria-label={`${label} gradient angle`} data-testid={`input-page-theme-angle-${screen}`} />
            </label>}
          </article>;
        })}
      </div>
    </section>
    <section className="detail-card settings-panel" id="settings-category-copy" aria-labelledby="settings-category-copy-title">
      <div className="detail-card-title"><FileText size={17} /><h2 id="settings-category-copy-title">Category entry form labels and buttons</h2></div>
      <p className="field-help">Customize the visible field labels, PIN prompts, and action buttons for each category. Leave a field blank to use its current default.</p>
      <div className="settings-screen-list">
        {categoryEntrySettings.map(({ screen, title, fields }) => {
          const copy = draft.screenCopy[screen] ?? {};
          const resolvedText = (key: string, fallback: string) => copy[key]?.trim() || fallback;
          const offsetValue = Number.parseInt(copy.entryLogoVerticalOffset ?? '0', 10);
          const logoVerticalOffset = Number.isFinite(offsetValue) ? Math.max(-120, Math.min(120, offsetValue)) : 0;
          const previewFields = fields.filter(([key]) => ['nameLabel', 'nicknameLabel', 'surnameLabel'].includes(key));
          const previewButtons = fields.filter(([key]) => key.startsWith('buttonLabel'));
          const pinPrompt = fields.find(([key]) => key === 'pinLabel');
          return <details className="settings-screen" key={screen} data-testid={`settings-category-entry-${screen}`}>
            <summary>{title}<span>{screen}</span></summary>
            <div className="settings-inline-fields">
              {fields.map(([key, label, defaultText]) => <label className="field-label" key={key}>{label}
                <input
                  className="text-input"
                  value={copy[key] ?? ''}
                  maxLength={key.startsWith('buttonLabel') ? 60 : 120}
                  placeholder={`Default: ${defaultText}`}
                  onChange={(event) => updateScreenCopy(screen, key, event.target.value)}
                  data-testid={`input-copy-${screen}-${key}`}
                />
              </label>)}
              <label className="field-label">Entry and PIN logo horizontal position
                <select className="text-input select-input" value={copy.entryLogoAlignment || 'center'} onChange={(event) => updateScreenCopy(screen, 'entryLogoAlignment', event.target.value)} data-testid={`select-entry-logo-alignment-${screen}`}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </label>
              <label className="field-label settings-logo-offset-field">
                <span>Entry and PIN logo vertical position <b>{logoVerticalOffset > 0 ? `${logoVerticalOffset}px down` : logoVerticalOffset < 0 ? `${Math.abs(logoVerticalOffset)}px up` : 'Centered'}</b></span>
                <input
                  type="range"
                  min="-120"
                  max="120"
                  step="2"
                  value={logoVerticalOffset}
                  onChange={(event) => updateScreenCopy(screen, 'entryLogoVerticalOffset', event.target.value)}
                  aria-label={`${title} entry and PIN logo vertical position`}
                  data-testid={`input-entry-logo-offset-${screen}`}
                />
                <small>Negative values move the logo up; positive values move it down.</small>
              </label>
            </div>
            <section className={`settings-category-preview category-preview-${screen}`} aria-label={`${title} live preview`} data-testid={`preview-${screen}`}>
              <span className="settings-category-preview-caption">Live preview · updates as you edit</span>
              <div className="settings-category-preview-fields">
                {previewFields.map(([key, , defaultText]) => <div className="settings-category-preview-field" key={key}>
                  <span>{resolvedText(key, defaultText)}</span>
                  <div aria-hidden="true" />
                </div>)}
              </div>
              {pinPrompt && <div className="settings-category-preview-pin">
                <span>{resolvedText(pinPrompt[0], pinPrompt[2])}</span>
              </div>}
              <div className="settings-category-preview-actions">
                {previewButtons.map(([key, label, defaultText]) => <div className="settings-category-preview-action" key={key}>
                  <small>{label}</small>
                  <button type="button" tabIndex={-1} aria-hidden="true">{resolvedText(key, defaultText)}</button>
                </div>)}
              </div>
            </section>
          </details>;
        })}
      </div>
    </section>
    <section className="detail-card settings-panel" id="settings-workflow-copy" aria-labelledby="settings-workflow-copy-title">
      <div className="detail-card-title"><FileText size={17} /><h2 id="settings-workflow-copy-title">Page and workflow text</h2></div>
      <p className="field-help">Edit the main copy for each page or workflow step. Empty values use the portal’s default labels.</p>
      <div className="settings-screen-list">{screenLabels.map(([screen, label]) => <details className="settings-screen" key={screen}>
        <summary>{label}<span>{screen}</span></summary>
        <div className="settings-inline-fields">
          {([
            'title', 'description', 'sectionIdLabel',
            ...(screen.startsWith('category-entry-')
              ? ['backButtonLabel']
              : ['buttonLabel', ...(screen.startsWith('workflow-step-') ? ['backButtonLabel', ...(workflowFieldLabels[screen] ?? []).map(([key]) => key)] : [])]),
          ] as string[]).map((key) => <label className="field-label" key={key}>{key === 'sectionIdLabel' ? 'Section ID label' : key === 'buttonLabel' ? 'Primary button label' : key === 'buttonLabelStep1' ? 'Step 1 button text' : key === 'buttonLabelStep2' ? 'Step 2 button text' : key === 'backButtonLabel' ? 'Back button label' : key === 'nameLabel' ? 'Name / login field label' : key === 'pinLabel' ? 'PIN prompt label' : key === 'title' ? 'Screen title' : key === 'description' ? 'Description' : (workflowFieldLabels[screen] ?? []).find(([fieldKey]) => fieldKey === key)?.[1] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
            <input className="text-input" value={draft.screenCopy[screen]?.[key] ?? ''} maxLength={key.startsWith('buttonLabel') || key === 'backButtonLabel' ? 60 : 500} placeholder="Use portal default" onChange={(event) => updateScreenCopy(screen, key, event.target.value)} data-testid={`input-copy-${screen}-${key}`} />
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
  return <main className="not-found portal-frame"><div className="not-found-card"><PortalWordmark /><span className="not-found-code">404</span><h1>This page isn’t here.</h1><p>The address may have changed. Return to the enrollment portal to continue.</p><Link href="/" className="button button-primary" data-testid="link-not-found-home">Return to portal <ArrowRight size={15} /></Link></div></main>;
}

function RoutedPages() {
  const [location, setLocation] = useLocation();
  const portalSettings = useGetPortalSettings();
  const themeKey = pageThemeKeyForRoute(location);
  const pageTheme = portalSettings.data?.pageThemes?.[themeKey];
  useEffect(() => {
    const theme = portalSettings.data?.theme;
    if (!theme) return;
    document.documentElement.dataset.portalButtonSize = theme.buttonSize;
    document.documentElement.dataset.portalButtonPlacement = theme.buttonPlacement;
  }, [portalSettings.data?.theme.buttonSize, portalSettings.data?.theme.buttonPlacement]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.portalPageThemeKey = themeKey;
    const background = pageThemeBackground(pageTheme);
    if (!background || !pageTheme) {
      delete root.dataset.portalPageThemeMode;
      root.style.removeProperty('--portal-page-background');
      return;
    }
    root.dataset.portalPageThemeMode = pageTheme.mode;
    root.style.setProperty('--portal-page-background', background);
  }, [themeKey, pageTheme?.mode, pageTheme?.color, pageTheme?.blendColor, pageTheme?.angle]);
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
  const { isLoaded, isSignedIn, userId } = useAuth();
  const client = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  const activeUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && userId) {
      if (activeUserId.current && activeUserId.current !== userId) {
        clearSessionDrafts(activeUserId.current);
      }
      activeUserId.current = userId;
      return;
    }
    if (activeUserId.current) clearSessionDrafts(activeUserId.current);
    activeUserId.current = null;
  }, [isLoaded, isSignedIn, userId]);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUser.current !== undefined && previousUser.current !== userId) {
        if (previousUser.current) clearSessionDrafts(previousUser.current);
        client.clear();
      }
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
