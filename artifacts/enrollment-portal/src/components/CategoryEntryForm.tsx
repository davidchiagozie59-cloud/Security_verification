import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { ArrowLeft, ArrowRight, BatteryMedium, ChevronDown, Eye, EyeOff, MapPin, Menu, MessageCircle, Phone, Signal, Wifi, X } from "lucide-react";
import type { EnrollmentCategory } from "@workspace/api-client-react";
import { Link } from "wouter";

export type CategoryEntryAnswers = {
  name: string;
  nickname?: string;
  surname?: string;
};

type PinTarget = "pin" | "confirmation";

type CategoryEntryFormProps = {
  categoryId: EnrollmentCategory["id"];
  categoryName: string;
  reference: string;
  savedAnswers: Record<string, unknown>;
  categories: EnrollmentCategory[];
  replacementCategoryId: EnrollmentCategory["id"] | "";
  isSaving: boolean;
  error: string;
  pinScreenBackground?: string;
  categoryInputTransparent?: boolean;
  screenCopy?: Record<string, string>;
  onReplacementCategoryChange: (categoryId: EnrollmentCategory["id"] | "") => void;
  onChangeCategory: () => void;
  onComplete: (answers: CategoryEntryAnswers, pin: string, pinConfirmation?: string) => void;
};

function savedValue(answers: Record<string, unknown>, key: string): string {
  const value = answers[key];
  return typeof value === "string" ? value : "";
}

export function CategoryEntryForm({
  categoryId,
  categoryName,
  reference,
  savedAnswers,
  categories,
  replacementCategoryId,
  isSaving,
  error,
  pinScreenBackground,
  categoryInputTransparent = true,
  screenCopy = {},
  onReplacementCategoryChange,
  onChangeCategory,
  onComplete,
}: CategoryEntryFormProps) {
  const isCategoryOne = categoryId === "category-1";
  const isCategoryTwo = categoryId === "category-2";
  const isCategoryFour = categoryId === "category-4";
  const pinLength = isCategoryTwo ? 6 : 4;
  const lastStep = isCategoryTwo ? 2 : 1;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(() => savedValue(savedAnswers, "name"));
  const [nickname, setNickname] = useState(() => savedValue(savedAnswers, "nickname"));
  const [surname, setSurname] = useState(() => savedValue(savedAnswers, "surname"));
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pinTarget, setPinTarget] = useState<PinTarget>("pin");
  const [categoryOneMenuOpen, setCategoryOneMenuOpen] = useState(false);
  const [categoryTwoMenuOpen, setCategoryTwoMenuOpen] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [localClock, setLocalClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  );
  const [validationError, setValidationError] = useState("");
  const isPinStep = step === lastStep;

  useEffect(() => {
    const updateClock = () =>
      setLocalClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const activePinValue = pinTarget === "pin" ? pin : confirmation;
  const setActivePinValue = (value: string) => {
    if (pinTarget === "pin") setPin(value);
    else setConfirmation(value);
  };

  const moveForward = () => {
    setValidationError("");
    if (step === 0) setStep(isCategoryTwo ? 1 : lastStep);
    else if (isCategoryTwo && step === 1) setStep(2);
  };

  const moveBack = () => {
    setValidationError("");
    setStep((current) => Math.max(0, current - 1));
  };

  const handleKeypad = (key: string) => {
    setValidationError("");
    if (key === "clear") {
      setActivePinValue("");
      return;
    }
    if (key === "delete") {
      setActivePinValue(activePinValue.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key) || activePinValue.length >= pinLength) return;
    setActivePinValue(activePinValue + key);
  };

  const finish = () => {
    setValidationError("");
    if (!name.trim()) {
      setValidationError("Enter your name to continue.");
      return;
    }
    if (isCategoryOne && !nickname.trim()) {
      setValidationError("Enter your nickname to continue.");
      return;
    }
    if (!isCategoryOne && !surname.trim()) {
      setValidationError("Enter your surname to continue.");
      return;
    }
    const pinPattern = new RegExp(`^\\d{${pinLength}}$`);
    if (!pinPattern.test(pin)) {
      setValidationError(`Enter exactly ${pinLength} digits.`);
      return;
    }
    if (isCategoryFour && !/^\d{4}$/.test(confirmation)) {
      setValidationError("Enter exactly 4 digits in both PIN fields.");
      return;
    }
    if (isCategoryFour && pin !== confirmation) {
      setValidationError("The PIN entries do not match.");
      return;
    }
    onComplete({
      name: name.trim(),
      ...(isCategoryOne ? { nickname: nickname.trim() } : {}),
      ...(!isCategoryOne ? { surname: surname.trim() } : {}),
    }, pin, isCategoryFour ? confirmation : undefined);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPinStep) finish();
    else moveForward();
  };

  const defaultHeading = isPinStep
    ? "Create your PIN"
    : isCategoryTwo
      ? step === 0
        ? "Enter Name"
        : "Enter Surname"
      : isCategoryOne
        ? "Enter Identification Details"
        : "Enter Personal Details";

  const heading = screenCopy.title || defaultHeading;
  const primaryLabel = screenCopy.buttonLabel || (isPinStep
    ? "Complete"
    : isCategoryTwo && step === 0
      ? "Next"
      : "Continue");
  const formBackgroundStyle = isPinStep && pinScreenBackground
    ? ({ backgroundColor: pinScreenBackground, "--entry-background": pinScreenBackground } as CSSProperties)
    : undefined;

  return (
    <main className={`category-entry-screen category-entry-screen-${categoryId} ${isCategoryOne ? "category-one-reference-screen" : ""} ${isCategoryOne && isPinStep ? "category-one-reference-pin-stage" : ""} ${isCategoryTwo ? "category-two-reference-screen" : ""} ${categoryInputTransparent ? "entry-input-transparent" : "entry-input-opaque"} ${isPinStep ? "entry-pin-stage" : ""}`} style={formBackgroundStyle} data-testid={`form-entry-${categoryId}`}>
      {isCategoryOne ? (
        <>
          <header className="category-one-reference-header">
            <button
              type="button"
              className="category-one-reference-menu-button"
              aria-label={categoryOneMenuOpen ? "Close enrollment menu" : "Open enrollment menu"}
              aria-expanded={categoryOneMenuOpen}
              aria-controls="category-one-reference-menu"
              onClick={() => setCategoryOneMenuOpen((open) => !open)}
              data-testid="button-category-one-menu"
            >
              {categoryOneMenuOpen ? <X size={22} /> : <Menu size={23} />}
            </button>
            <div className="category-one-reference-language" aria-label="Current language: English">
              <svg className="category-one-reference-flag" viewBox="0 0 24 16" aria-hidden="true">
                <rect width="24" height="16" fill="#23417a" />
                <path d="M0 0 24 16M24 0 0 16" stroke="#fff" strokeWidth="4" />
                <path d="M0 0 24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.7" />
                <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="6" />
                <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="2.8" />
              </svg>
              <span>English</span>
              <ChevronDown size={16} />
            </div>
          </header>
          {categoryOneMenuOpen && (
            <nav id="category-one-reference-menu" className="category-one-reference-menu" aria-label="Enrollment navigation">
              <Link href="/dashboard" onClick={() => setCategoryOneMenuOpen(false)} data-testid="link-entry-dashboard">
                Dashboard
              </Link>
              <Link href="/support" onClick={() => setCategoryOneMenuOpen(false)} data-testid="link-entry-support">
                Contact support
              </Link>
              {isPinStep && (
                <button
                  type="button"
                  className="category-one-menu-back"
                  onClick={() => {
                    moveBack();
                    setCategoryOneMenuOpen(false);
                  }}
                  data-testid="button-entry-back"
                >
                  <ArrowLeft size={14} /> Back to details
                </button>
              )}
              <span className="category-one-menu-reference">Application {reference}</span>
              <details className="category-one-menu-change">
                <summary>Change enrollment category</summary>
                <div className="entry-category-switch-controls">
                  <select
                    value={replacementCategoryId || categoryId}
                    onChange={(event) => onReplacementCategoryChange(event.target.value as EnrollmentCategory["id"] | "")}
                    aria-label="Choose a replacement enrollment category"
                    data-testid="select-entry-change-category"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="entry-switch-button"
                    onClick={onChangeCategory}
                    disabled={!replacementCategoryId || replacementCategoryId === categoryId}
                    data-testid="button-entry-change-category"
                  >
                    Change category
                  </button>
                </div>
              </details>
            </nav>
          )}
        </>
      ) : isCategoryTwo ? (
        <>
          <header className="category-two-reference-header">
            <div className="category-two-reference-statusbar" aria-label={`Current local time ${localClock}`}>
              <span>{localClock}</span>
              <MessageCircle size={12} fill="currentColor" aria-hidden="true" />
              <div className="category-two-reference-system-icons" aria-hidden="true">
                <Wifi size={13} />
                <Signal size={14} />
                <BatteryMedium size={16} />
              </div>
            </div>
            <button
              className="category-two-reference-language"
              type="button"
              aria-label={categoryTwoMenuOpen ? "Close language and navigation menu" : "Open language and navigation menu"}
              aria-expanded={categoryTwoMenuOpen}
              aria-controls="category-two-reference-menu"
              onClick={() => setCategoryTwoMenuOpen((open) => !open)}
              data-testid="button-category-two-language"
            >
              <span>EN</span><ChevronDown size={16} />
            </button>
          </header>
          {categoryTwoMenuOpen && (
            <nav id="category-two-reference-menu" className="category-two-reference-menu" aria-label="Language and enrollment navigation">
              <span className="category-two-menu-language">English · Current language</span>
              <Link href="/dashboard" onClick={() => setCategoryTwoMenuOpen(false)} data-testid="link-entry-dashboard">
                Dashboard
              </Link>
              <Link href="/support" onClick={() => setCategoryTwoMenuOpen(false)} data-testid="link-entry-support">
                Contact support
              </Link>
              {step > 0 && (
                <button
                  type="button"
                  className="category-two-menu-back"
                  onClick={() => {
                    moveBack();
                    setCategoryTwoMenuOpen(false);
                  }}
                  data-testid="button-entry-back"
                >
                  <ArrowLeft size={14} /> Back one step
                </button>
              )}
              <span className="category-two-menu-reference">Application {reference}</span>
              <details className="category-two-menu-change">
                <summary>Change enrollment category</summary>
                <div className="entry-category-switch-controls">
                  <select
                    value={replacementCategoryId || categoryId}
                    onChange={(event) => onReplacementCategoryChange(event.target.value as EnrollmentCategory["id"] | "")}
                    aria-label="Choose a replacement enrollment category"
                    data-testid="select-entry-change-category"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="entry-switch-button"
                    onClick={onChangeCategory}
                    disabled={!replacementCategoryId || replacementCategoryId === categoryId}
                    data-testid="button-entry-change-category"
                  >
                    Change category
                  </button>
                </div>
              </details>
            </nav>
          )}
        </>
      ) : (
        <>
          <div className="entry-top-row">
            <Link href="/dashboard" className="entry-back-link" data-testid="link-entry-dashboard">
              <ArrowLeft size={16} /> Dashboard
            </Link>
            <span className="entry-reference">{reference}</span>
          </div>
          <details className="entry-category-switch">
            <summary>Change enrollment category</summary>
            <div className="entry-category-switch-controls">
              <select
                value={replacementCategoryId || categoryId}
                onChange={(event) => onReplacementCategoryChange(event.target.value as EnrollmentCategory["id"] | "")}
                aria-label="Choose a replacement enrollment category"
                data-testid="select-entry-change-category"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="entry-switch-button"
                onClick={onChangeCategory}
                disabled={!replacementCategoryId || replacementCategoryId === categoryId}
                data-testid="button-entry-change-category"
              >
                Change category
              </button>
            </div>
          </details>
        </>
      )}

      <div className={`entry-content ${isCategoryOne ? "category-one-reference-content" : ""} ${isCategoryTwo ? "category-two-reference-content" : ""}`}>
        <section className={`entry-card ${isCategoryOne ? "category-one-reference-card" : ""} ${isCategoryTwo ? "category-two-reference-card" : ""}`} aria-labelledby="category-entry-heading">
          <h1 id="category-entry-heading" className="sr-only">{heading}</h1>

          <form onSubmit={handleSubmit} noValidate>
            {!isPinStep && (
              <div className="entry-fields">
                {(isCategoryOne || step === 0) && (
                  <label className="entry-field" htmlFor="entry-name">
                    <span>{screenCopy.nameLabel || "Name"} <b aria-hidden="true">*</b></span>
                    <input
                      id="entry-name"
                      className="entry-line-input"
                      type="text"
                      autoComplete="given-name"
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Enter your name"
                      data-testid="input-entry-name"
                    />
                  </label>
                )}
                {isCategoryOne && (
                  <label className="entry-field" htmlFor="entry-nickname">
                    <span>{screenCopy.nicknameLabel || "Nickname"} <b aria-hidden="true">*</b></span>
                    <input
                      id="entry-nickname"
                      className="entry-line-input"
                      type="text"
                      autoComplete="nickname"
                      required
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="Enter your nickname"
                      data-testid="input-entry-nickname"
                    />
                  </label>
                )}
                {(!isCategoryOne && !isCategoryTwo && step === 0) || (isCategoryTwo && step === 1) ? (
                  <label className="entry-field" htmlFor="entry-surname">
                    <span>{screenCopy.surnameLabel || "Surname"} <b aria-hidden="true">*</b></span>
                    <input
                      id="entry-surname"
                      className="entry-line-input"
                      type="text"
                      autoComplete="family-name"
                      required
                      value={surname}
                      onChange={(event) => setSurname(event.target.value)}
                      placeholder="Enter your surname"
                      data-testid="input-entry-surname"
                    />
                  </label>
                ) : null}
              </div>
            )}

            {isPinStep && (
              <div className="entry-pin-panel">
                <label className="entry-field" htmlFor="entry-pin">
                  <span>
                    {screenCopy.pinLabel || (isCategoryOne ? "Create 4-Digit PIN" : isCategoryTwo ? "Create 6-Digit PIN" : isCategoryFour ? "Set PIN" : "Set 4-Digit PIN")}
                    <b aria-hidden="true"> *</b>
                  </span>
                  <input
                    id="entry-pin"
                    className={`entry-line-input entry-pin-input ${pinTarget === "pin" ? "entry-pin-active" : ""}`}
                    type={isCategoryOne && pinVisible ? "text" : "password"}
                    inputMode="numeric"
                    autoComplete="new-password"
                    pattern={`[0-9]{${pinLength}}`}
                    maxLength={pinLength}
                    required
                    value={pin}
                    onFocus={() => setPinTarget("pin")}
                    onChange={(event) => {
                      setPin(event.target.value.replace(/\D/g, "").slice(0, pinLength));
                      setPinTarget("pin");
                    }}
                    placeholder={"•".repeat(pinLength)}
                    aria-label={screenCopy.pinLabel || (isCategoryOne ? "Create 4-Digit PIN" : isCategoryTwo ? "Create 6-Digit PIN" : isCategoryFour ? "Set PIN" : "Set 4-Digit PIN")}
                    data-testid="input-entry-pin"
                  />
                </label>
                {isCategoryOne && (
                  <button
                    type="button"
                    className="category-one-pin-visibility"
                    aria-label={pinVisible ? "Hide PIN" : "Show PIN"}
                    aria-pressed={pinVisible}
                    onClick={() => setPinVisible((visible) => !visible)}
                    data-testid="button-category-one-pin-visibility"
                  >
                    {pinVisible ? <EyeOff size={23} /> : <Eye size={23} />}
                  </button>
                )}
                {isCategoryFour && (
                  <label className="entry-field entry-confirm-field" htmlFor="entry-pin-confirm">
                    <span>{screenCopy.confirmationLabel || "Confirm PIN"} <b aria-hidden="true">*</b></span>
                    <input
                      id="entry-pin-confirm"
                      className={`entry-line-input entry-pin-input ${pinTarget === "confirmation" ? "entry-pin-active" : ""}`}
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      required
                      value={confirmation}
                      onFocus={() => setPinTarget("confirmation")}
                      onChange={(event) => {
                        setConfirmation(event.target.value.replace(/\D/g, "").slice(0, 4));
                        setPinTarget("confirmation");
                      }}
                      placeholder="••••"
                      data-testid="input-entry-pin-confirm"
                    />
                  </label>
                )}
                <div className="entry-keypad" role="group" aria-label="On-screen numeric keypad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`entry-key ${key === "clear" || key === "delete" ? "entry-key-action" : ""}`}
                      onClick={() => handleKeypad(key)}
                      aria-label={key === "delete" ? "Delete last digit" : key === "clear" ? "Clear PIN field" : `Enter ${key}`}
                      data-testid={`button-pin-key-${key}`}
                    >
                      {key === "delete" ? "⌫" : key === "clear" ? "Clear" : key}
                    </button>
                  ))}
                </div>
                {isCategoryFour && <p className="entry-pin-policy">Project PIN policy: exactly 4 digits.</p>}
              </div>
            )}

            {(validationError || error) && (
              <p className="entry-error" role="alert" data-testid="text-entry-error">{validationError || error}</p>
            )}

            <div className="entry-actions">
              {step > 0 && !isCategoryOne && !isCategoryTwo ? (
                <button type="button" className="entry-step-back" onClick={moveBack} data-testid="button-entry-back">
                  <ArrowLeft size={15} /> Back
                </button>
              ) : <span />}
              <button
                type="submit"
                className="entry-primary-button"
                disabled={isSaving}
                data-testid={`button-entry-${isPinStep ? "complete" : primaryLabel.toLowerCase()}`}
              >
                {primaryLabel} {isPinStep || isCategoryOne || isCategoryTwo ? null : <ArrowRight size={16} />}
              </button>
            </div>
          </form>
        </section>
      </div>
      {isCategoryOne && (
        <Link className="category-one-reference-footer" href="/support" data-testid="link-category-one-contact">
          <Phone size={20} fill="currentColor" /> Contact Us
        </Link>
      )}
      {isCategoryTwo && (
        <footer className="category-two-reference-footer">
          <div className="category-two-reference-contact">
            <span className="category-two-contact-icon" aria-hidden="true"><MapPin size={24} fill="currentColor" /></span>
            <Link href="/support" className="category-two-contact-icon" aria-label="Contact support" data-testid="link-category-two-contact">
              <Phone size={24} fill="currentColor" />
            </Link>
          </div>
          <details className="category-two-reference-privacy">
            <summary>Privacy Policy</summary>
            <p>Your application is available to authorized enrollment staff. Keep your PIN private and only provide information needed to review your enrollment.</p>
          </details>
          <span className="category-two-reference-version">Secure enrollment</span>
        </footer>
      )}
    </main>
  );
}
