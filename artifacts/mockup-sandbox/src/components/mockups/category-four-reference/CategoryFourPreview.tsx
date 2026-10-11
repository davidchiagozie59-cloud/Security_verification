import { useState, type FormEvent } from "react";
import "./_group.css";

export function CategoryFourPreview() {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [continued, setContinued] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContinued(true);
  };

  return (
    <main className={`category-four-reference-screen ${continued ? "entry-pin-stage" : ""}`}>
      <div className="category-four-reference-content">
        <section className="category-four-reference-card">
          <form onSubmit={handleSubmit}>
            {!continued ? (
              <div className="entry-fields">
                <label className="entry-field" htmlFor="category-four-name">
                  <span>Name <b aria-hidden="true">*</b></span>
                  <input
                    id="category-four-name"
                    className="entry-line-input"
                    autoComplete="given-name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Enter your name"
                  />
                </label>
                <label className="entry-field" htmlFor="category-four-surname">
                  <span>Surname <b aria-hidden="true">*</b></span>
                  <input
                    id="category-four-surname"
                    className="entry-line-input"
                    autoComplete="family-name"
                    required
                    value={surname}
                    onChange={(event) => setSurname(event.target.value)}
                    placeholder="Enter your surname"
                  />
                </label>
              </div>
            ) : (
              <div className="entry-fields">
                <label className="entry-field" htmlFor="category-four-pin">
                  <span>Set PIN <b aria-hidden="true">*</b></span>
                  <input
                    id="category-four-pin"
                    className="entry-line-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="4 digits"
                  />
                </label>
              </div>
            )}
            <div className="entry-actions">
              <button
                className="entry-primary-button"
                type={continued ? "button" : "submit"}
                onClick={continued ? () => setContinued(false) : undefined}
              >
                {continued ? "Back" : "Continue"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
