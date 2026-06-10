import { type FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

export function ComingSoonGate() {
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Coming soon.");
  }

  return (
    <main className="coming-soon-gate" aria-labelledby="coming-soon-title">
      <div className="coming-soon-noise" aria-hidden="true" />
      <div className="coming-soon-vignette" aria-hidden="true" />

      <div className="coming-soon-shapes" aria-hidden="true">
        <span className="coming-soon-shape coming-soon-shape-a" />
        <span className="coming-soon-shape coming-soon-shape-b" />
        <span className="coming-soon-shape coming-soon-shape-c" />
        <span className="coming-soon-shape coming-soon-shape-d" />
        <span className="coming-soon-shape coming-soon-shape-e" />
      </div>

      <section className="coming-soon-center">
        <p className="coming-soon-kicker">RMH Studios</p>
        <h1 id="coming-soon-title">COMING SOON</h1>
      </section>

      <form className="coming-soon-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="lockdown-password">
          Password
        </label>
        <div className="coming-soon-input-shell">
          <LockKeyhole aria-hidden="true" size={18} />
          <input
            id="lockdown-password"
            name="password"
            type="password"
            autoComplete="off"
            placeholder="Password"
          />
          <button type="submit" aria-label="Submit password">
            <ArrowRight aria-hidden="true" size={20} />
          </button>
        </div>
        <p className="coming-soon-message" aria-live="polite">
          {message}
        </p>
      </form>
    </main>
  );
}
