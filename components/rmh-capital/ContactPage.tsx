import { useState } from 'react';

const INQUIRY_TYPES = [
  'Investment Banking',
  'Markets',
  'Corporate Banking',
  'Venture Capital',
  'Careers',
  'Media',
  'General Inquiry',
] as const;

export default function ContactPage({ initialType }: { initialType?: string }) {
  const [type, setType] = useState<string>(
    initialType && INQUIRY_TYPES.includes(initialType as (typeof INQUIRY_TYPES)[number])
      ? initialType
      : 'Investment Banking'
  );
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSent(true);
    e.currentTarget.reset();
    setType('Investment Banking');
    requestAnimationFrame(() => {
      document.getElementById('form-success')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    });
  };

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">Contact</span>
          <h1 className="serif reveal d1">Reach the right team.</h1>
          <p className="lede reveal d2">
            Tell us what you're working on and we'll route your message to the people who can help. For anything
            time-sensitive, choose the matching inquiry type below.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="contact-grid">
            {/* left: offices + routing */}
            <div className="reveal">
              <span className="eyebrow">Offices</span>
              <div style={{ marginTop: 24 }}>
                <div className="office"><h3>New York</h3><p>Global headquarters<br />One Platform Plaza, New York, NY</p></div>
                <div className="office"><h3>London</h3><p>EMEA<br />Threadneedle Court, London EC2</p></div>
                <div className="office"><h3>Singapore</h3><p>APAC<br />Marina Financial Centre, Singapore</p></div>
              </div>
              <div style={{ marginTop: 32 }}>
                <span className="eyebrow">General</span>
                <p style={{ marginTop: 16, fontSize: 15 }}>
                  General inquiries<br />
                  <a className="gold-text" href="mailto:hello@rmhcapital.example">hello@rmhcapital.example</a>
                </p>
                <p style={{ marginTop: 12, fontSize: 15 }}>
                  Media<br />
                  <a className="gold-text" href="mailto:press@rmhcapital.example">press@rmhcapital.example</a>
                </p>
              </div>
            </div>

            {/* right: form */}
            <div className="reveal d1">
              <span className="eyebrow">Send a message</span>
              <div className={`form-success${sent ? ' show' : ''}`} id="form-success" role="status">
                Thank you — your message is on its way. The right team will be in touch shortly.
              </div>
              <form id="inquiry-form" style={{ marginTop: 24 }} noValidate onSubmit={onSubmit}>
                <div className="form-field">
                  <label htmlFor="inquiry-type">Inquiry type</label>
                  <select id="inquiry-type" name="inquiry-type" required value={type} onChange={(e) => setType(e.target.value)}>
                    {INQUIRY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="name">Full name</label>
                    <input id="name" name="name" type="text" autoComplete="name" required />
                  </div>
                  <div className="form-field">
                    <label htmlFor="org">Company / organization</label>
                    <input id="org" name="org" type="text" autoComplete="organization" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="form-field">
                    <label htmlFor="phone">
                      Phone <span style={{ textTransform: 'none', color: 'var(--gray-dim)', letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <input id="phone" name="phone" type="tel" autoComplete="tel" />
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="message">How can we help?</label>
                  <textarea id="message" name="message" required placeholder="Share a few details about what you're working on." />
                </div>
                <button className="btn btn-gold" type="submit">Send message <span className="arw">→</span></button>
                <p className="form-note">
                  By submitting, you agree that RMH Capital may contact you about your inquiry. We never share your
                  information. This form is for general contact and does not transmit confidential or material non-public
                  information.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
