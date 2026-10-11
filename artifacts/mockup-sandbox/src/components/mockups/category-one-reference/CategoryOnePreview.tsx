import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  Menu,
  Phone,
  X,
} from "lucide-react";
import "./_group.css";

type CategoryOnePreviewProps = {
  variant?: "current" | "reference";
};

function UnitedKingdomFlag() {
  return (
    <svg className="category-one-reference-flag" viewBox="0 0 24 16" aria-hidden="true">
      <rect width="24" height="16" fill="#23417a" />
      <path d="M0 0 24 16M24 0 0 16" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.7" />
      <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="6" />
      <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="2.8" />
    </svg>
  );
}

export function CategoryOnePreview({ variant = "current" }: CategoryOnePreviewProps) {
  const isReference = variant === "reference";
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (step === 0) {
      setStep(1);
      return;
    }
    if (pin.length !== 4) setError("Enter exactly four digits.");
    else setError("Preview only — this form is not connected to the application API.");
  };

  return (
    <main className={`category-entry-screen category-entry-screen-category-1 entry-input-transparent ${isReference ? "category-one-reference-screen" : ""}`}>
      {isReference ? (
        <>
          <header className="category-one-reference-header">
            <button
              className="category-one-reference-menu-button"
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={23} />}
            </button>
            <div className="category-one-reference-language" aria-label="Current language: English">
              <UnitedKingdomFlag />
              <span>English</span>
              <ChevronDown size={16} />
            </div>
          </header>
          {menuOpen && (
            <nav className="category-one-reference-menu" aria-label="Enrollment navigation">
              <a href="#dashboard">Dashboard</a>
              <a href="#support">Contact support</a>
              {step > 0 && (
                <button className="entry-step-back" type="button" onClick={() => setStep(0)}>
                  <ArrowLeft size={14} /> Back to details
                </button>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="entry-top-row">
          <a href="#dashboard" className="entry-back-link">
            <ArrowLeft size={16} /> Dashboard
          </a>
          <span className="entry-reference">ENR-84C2A1D7</span>
        </div>
      )}

      {!isReference && (
        <details className="entry-category-switch">
          <summary>Change enrollment category</summary>
        </details>
      )}

      <div className={`entry-content ${isReference ? "category-one-reference-content" : ""}`}>
        <section className={`entry-card ${isReference ? "category-one-reference-card" : ""}`} aria-labelledby="category-entry-heading">
          <h1 id="category-entry-heading" className="sr-only">
            {step === 1 ? "Create your PIN" : "Enter Identification Details"}
          </h1>
          <form onSubmit={handleSubmit} noValidate>
            {step === 0 ? (
              <div className={`entry-fields ${isReference ? "category-one-reference-fields" : ""}`}>
                <label className="entry-field" htmlFor="preview-name">
                  <span>Name <b aria-hidden="true">*</b></span>
                  <input
                    id="preview-name"
                    className="entry-line-input"
                    autoComplete="given-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Enter your name"
                  />
                </label>
                <label className="entry-field" htmlFor="preview-nickname">
                  <span>Nickname <b aria-hidden="true">*</b></span>
                  <input
                    id="preview-nickname"
                    className="entry-line-input"
                    autoComplete="nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder="Enter your nickname"
                  />
                </label>
              </div>
            ) : (
              <div className={`entry-pin-panel ${isReference ? "category-one-reference-pin" : ""}`}>
                <label className="entry-field" htmlFor="preview-pin">
                  <span>Create 4-Digit PIN <b aria-hidden="true">*</b></span>
                  <input
                    id="preview-pin"
                    className="entry-line-input entry-pin-input"
                    type={pinVisible ? "text" : "password"}
                    inputMode="numeric"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                  />
                </label>
                {isReference && (
                  <button
                    className="category-one-pin-visibility"
                    type="button"
                    aria-label={pinVisible ? "Hide PIN" : "Show PIN"}
                    onClick={() => setPinVisible(!pinVisible)}
                  >
                    {pinVisible ? <EyeOff size={23} /> : <Eye size={23} />}
                  </button>
                )}
                <div className="entry-keypad" role="group" aria-label="On-screen numeric keypad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="entry-key"
                      onClick={() => setPin(key === "clear" ? "" : key === "delete" ? pin.slice(0, -1) : (pin + key).slice(0, 4))}
                    >
                      {key === "delete" ? "⌫" : key === "clear" ? "Clear" : key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="entry-error" role="alert">{error}</p>}

            <div className={`entry-actions ${isReference ? "category-one-reference-actions" : ""}`}>
              {step > 0 && !isReference ? (
                <button className="entry-step-back" type="button" onClick={() => setStep(0)}>
                  <ArrowLeft size={15} /> Back
                </button>
              ) : <span />}
              <button className="entry-primary-button" type="submit">
                {step === 1 ? "Complete" : "Continue"}
                {!isReference && <ArrowRight size={16} />}
              </button>
            </div>
          </form>
        </section>
      </div>

      {isReference && (
        <a className="category-one-reference-footer" href="#support">
          <Phone size={20} fill="currentColor" /> Contact Us
        </a>
      )}
    </main>
  );
}
