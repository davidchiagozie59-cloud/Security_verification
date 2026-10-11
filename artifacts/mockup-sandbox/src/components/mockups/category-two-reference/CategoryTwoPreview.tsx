import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BatteryMedium,
  ChevronDown,
  MapPin,
  MessageCircle,
  Phone,
  Signal,
  Wifi,
} from "lucide-react";
import "./_group.css";

type CategoryTwoPreviewProps = {
  variant?: "current" | "reference";
};

export function CategoryTwoPreview({ variant = "current" }: CategoryTwoPreviewProps) {
  const isReference = variant === "reference";
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [pin, setPin] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (pin.length !== 6) setError("Enter exactly six digits.");
    else setError("Preview only — this form is not connected to the application API.");
  };

  return (
    <main className={`category-entry-screen ${isReference ? "category-two-reference-screen" : ""}`}>
      {isReference ? (
        <>
          <header className="category-two-reference-header">
            <div className="category-two-reference-statusbar" aria-label="Local time and device status">
              <span>6:18</span>
              <MessageCircle size={12} fill="currentColor" aria-hidden="true" />
              <div className="category-two-reference-system-icons" aria-hidden="true">
                <Wifi size={13} />
                <Signal size={14} />
                <BatteryMedium size={16} />
              </div>
            </div>
            <button className="category-two-reference-language" type="button" onClick={() => setMenuOpen(!menuOpen)}>
              EN <ChevronDown size={16} />
            </button>
          </header>
          {menuOpen && (
            <nav className="category-two-reference-menu" aria-label="Language and enrollment navigation">
              <span>English · Current language</span>
              <a href="#dashboard">Dashboard</a>
              <a href="#support">Contact support</a>
              {step > 0 && (
                <button className="entry-step-back" type="button" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={14} /> Back one step
                </button>
              )}
            </nav>
          )}
        </>
      ) : (
        <>
          <div className="entry-top-row">
            <a href="#dashboard" className="entry-back-link"><ArrowLeft size={16} /> Dashboard</a>
            <span className="entry-reference">ENR-84C2A1D7</span>
          </div>
          <details className="entry-category-switch">
            <summary>Change enrollment category</summary>
          </details>
        </>
      )}

      <div className={`entry-content ${isReference ? "category-two-reference-content" : ""} ${isReference && step === 2 ? "category-two-reference-pin-stage" : ""}`}>
        <section className={`entry-card ${isReference ? "category-two-reference-card" : ""}`} aria-labelledby="category-two-heading">
          <h1 id="category-two-heading" className="sr-only">
            {step === 0 ? "Enter Name" : step === 1 ? "Enter Surname" : "Create PIN"}
          </h1>
          <form onSubmit={handleSubmit}>
            {step < 2 ? (
              <div className="entry-fields">
                <label className="entry-field" htmlFor="category-two-name">
                  <span>{step === 0 ? "Name" : "Surname"} <b aria-hidden="true">*</b></span>
                  <input
                    id="category-two-name"
                    className="entry-line-input"
                    autoComplete={step === 0 ? "given-name" : "family-name"}
                    value={step === 0 ? name : surname}
                    onChange={(event) => step === 0 ? setName(event.target.value) : setSurname(event.target.value)}
                    placeholder={step === 0 ? "Enter your name" : "Enter your surname"}
                  />
                </label>
              </div>
            ) : isReference ? (
              <div className="pin-entry-screen">
                <button className="pin-entry-back" type="button" aria-label="Back to details" onClick={() => setStep(1)}>
                  <ArrowLeft size={20} />
                </button>
                <h2 className="pin-entry-title">Please enter your PIN</h2>
                <div className="pin-entry-indicators">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className={`pin-entry-indicator ${pin.length > index ? "pin-entry-indicator-filled" : ""}`} />
                  ))}
                  <input
                    className="pin-entry-hidden-input"
                    aria-label="Enter your 6-digit PIN"
                    inputMode="none"
                    type="password"
                    maxLength={6}
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </div>
                <div className="pin-entry-keypad" role="group" aria-label="On-screen numeric keypad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
                    <button
                      key={digit}
                      className={`pin-entry-key ${digit === "0" ? "pin-entry-key-zero" : ""}`}
                      type="button"
                      onClick={() => setPin((value) => (value + digit).slice(0, 6))}
                    >
                      {digit}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="entry-pin-panel">
                <label className="entry-field" htmlFor="category-two-pin">
                  <span>Create 6-Digit PIN <b aria-hidden="true">*</b></span>
                  <input
                    id="category-two-pin"
                    className="entry-line-input entry-pin-input"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                  />
                </label>
                <div className="entry-keypad" role="group" aria-label="On-screen numeric keypad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"].map((key) => (
                    <button
                      className="entry-key"
                      key={key}
                      type="button"
                      onClick={() => setPin(key === "clear" ? "" : key === "delete" ? pin.slice(0, -1) : (pin + key).slice(0, 6))}
                    >
                      {key === "delete" ? "⌫" : key === "clear" ? "Clear" : key}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="entry-error" role="alert">{error}</p>}
            {!(isReference && step === 2) && (
              <div className="entry-actions">
                {!isReference && step > 0
                  ? <button className="entry-step-back" type="button" onClick={() => setStep(step - 1)}>Back</button>
                  : <span />}
                <button className="entry-primary-button" type="submit">
                  {step === 0 ? "Next" : step === 1 ? "Continue" : "Complete"}
                </button>
              </div>
            )}
          </form>
        </section>
      </div>

      {isReference && (
        <footer className="category-two-reference-footer">
          <div className="category-two-reference-contact">
            <span className="category-two-contact-icon" aria-hidden="true"><MapPin size={24} fill="currentColor" /></span>
            <a href="#support" className="category-two-contact-icon" aria-label="Contact support"><Phone size={24} fill="currentColor" /></a>
          </div>
          <details className="category-two-reference-privacy"><summary>Privacy Policy</summary></details>
          <span className="category-two-reference-version">Secure enrollment</span>
        </footer>
      )}
    </main>
  );
}
