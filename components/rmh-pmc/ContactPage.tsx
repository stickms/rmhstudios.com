import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Decrypt } from './shared';

const INQUIRY_TYPES = [
  'General',
  'Protective Services',
  'Static Guarding',
  'Intelligence',
  'Logistics',
  'Strategic Advisory',
  'Sovereign Solutions',
  'Recruiting',
  'Media',
] as const;

export default function ContactPage({ initialType }: { initialType?: string }) {
  const [type, setType] = useState<string>(
    initialType && INQUIRY_TYPES.includes(initialType as (typeof INQUIRY_TYPES)[number])
      ? initialType
      : 'General'
  );
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSent(true);
    e.currentTarget.reset();
    setType('General');
    requestAnimationFrame(() => {
      document.getElementById('form-success')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    });
  };

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <div className="brief-meta reveal">
            <span className="field"><b>File</b> ▸ <span className="v"><Decrypt text="CONTACT" /></span></span>
            <span className="field"><b>Class</b> ▸ <span className="v"><Decrypt text="OPEN CHANNEL" /></span></span>
            <span className="field"><b>Status</b> ▸ <span className="v"><Decrypt text="MONITORED" /></span></span>
          </div>
          <span className="desig reveal">Contact // Request a Briefing</span>
          <h1 className="reveal d1">Open a channel.</h1>
          <p className="lede reveal d2">
            Tell us what you need protected, secured, or understood, and we'll route the inquiry to the desk that owns
            it. Every engagement begins with vetting — sanctions screening, jurisdictional review, and a hard look at
            the task. Nothing is taken on without it.
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="contact-grid">
            {/* left: stations + routing */}
            <div className="reveal">
              <span className="desig">Stations</span>
              <div style={{ marginTop: 24 }}>
                <div className="office">
                  <h3>Operations Center</h3>
                  <p>Undisclosed location<br />Manned 24/7 · secure watch floor<br />Standby liaison for active clients</p>
                </div>
                <div className="office">
                  <h3>Registered Office</h3>
                  <p>RMH PMC (Holdings) Ltd.<br />Dubai International Financial Centre<br />United Arab Emirates</p>
                </div>
                <div className="office">
                  <h3>Selection &amp; Recruiting</h3>
                  <p>By referral and direct application<br />Cleared candidates only<br />select@rmhpmc.example</p>
                </div>
                <div className="office">
                  <h3>Media &amp; Public Affairs</h3>
                  <p>On-record inquiries only<br />press@rmhpmc.example</p>
                </div>
              </div>
              <p className="form-note" style={{ marginTop: 24 }}>
                Detailed station locations, callsigns, and secure contact channels are shared after vetting.
              </p>
            </div>

            {/* right: form */}
            <div className="reveal d1">
              <span className="desig">Open a Channel</span>
              <div className="frame" style={{ marginTop: 24 }}>
                <div className="plate-head"><span>SECURE FORM</span><b>UNCLASSIFIED CHANNEL</b></div>
                <div style={{ padding: 'clamp(20px,3vw,32px)' }}>
                  <div className={`form-success${sent ? ' show' : ''}`} id="form-success" role="status">
                    Channel opened. A member of our liaison staff will reach out through secure contact.
                  </div>
                  <form id="inquiry-form" noValidate onSubmit={onSubmit}>
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
                        <label htmlFor="org">Organization</label>
                        <input id="org" name="org" type="text" autoComplete="organization" />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-field">
                        <label htmlFor="email">Email</label>
                        <input id="email" name="email" type="email" autoComplete="email" required />
                      </div>
                      <div className="form-field">
                        <label htmlFor="theater">Country / theater of operation</label>
                        <input id="theater" name="theater" type="text" autoComplete="country-name" required />
                      </div>
                    </div>
                    <div className="form-field">
                      <label htmlFor="message">Brief us</label>
                      <textarea id="message" name="message" required placeholder="Outline the task, the environment, and your timeline. Share only what you're comfortable sending unencrypted." />
                    </div>
                    <button className="btn btn-amber" type="submit">Open channel <span className="arw">→</span></button>
                    <p className="form-note">
                      Submissions are screened before any reply. Treat this form as an open channel — do not transmit
                      classified, proprietary, or operationally sensitive detail until a secure line is established. RMH PMC
                      engages only after vetting, and reserves the right to decline any inquiry without explanation.
                    </p>
                    <p className="form-note" style={{ marginTop: 8 }}>
                      Already in contact with a desk? Continue through your assigned liaison rather than this form.{' '}
                      <Link className="amber-text" to="/rmh-pmc/capabilities">Review capabilities</Link> first if you're unsure which line you need.
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
