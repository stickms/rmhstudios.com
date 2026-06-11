import { createFileRoute } from '@tanstack/react-router';
import { LegalLayout } from '@/components/lockdown/LegalLayout';

export const Route = createFileRoute('/cookies')({
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      eyebrow="Legal"
      updatedDate="June 11, 2025"
    >
      <h2>1. What Are Cookies</h2>
      <p>
        Cookies are small text files placed on your device by websites you visit. They are widely
        used to make websites work, or to work more efficiently, as well as to provide information
        to site owners. Similar technologies — including local storage, session storage, and
        pixel tags — may be used for comparable purposes and are covered by this policy.
      </p>

      <h2>2. How We Use Cookies</h2>
      <p>RMHStudios uses cookies and similar technologies for the following purposes:</p>
      <ul>
        <li>
          <strong>Essential cookies</strong> — Required for the Services to function. These
          include session tokens, authentication state, and security cookies. They cannot be
          disabled without impacting functionality.
        </li>
        <li>
          <strong>Preference cookies</strong> — Used to remember choices you make, such as
          your selected theme or language preference, so you do not need to re-enter them on each
          visit.
        </li>
        <li>
          <strong>Analytics cookies</strong> — Help us understand how visitors interact with
          the Services by collecting and reporting information anonymously. We use this data to
          improve performance and usability.
        </li>
        <li>
          <strong>Performance cookies</strong> — Monitor site load times, error rates, and
          other technical metrics to maintain and improve infrastructure.
        </li>
      </ul>

      <h2>3. Third-Party Cookies</h2>
      <p>
        Some pages on our Services may include content from or links to third-party services
        (for example, embedded video players or analytics providers). These third parties may
        set their own cookies, which are governed by their respective privacy and cookie
        policies. RMHStudios has no control over these cookies.
      </p>

      <h2>4. Your Choices</h2>
      <p>
        Most web browsers allow you to control cookies through their settings. You can typically:
      </p>
      <ul>
        <li>Delete all cookies currently stored on your device.</li>
        <li>Block cookies from being set in future.</li>
        <li>Allow only first-party cookies (blocking third-party cookies).</li>
        <li>Configure browser settings to notify you when a cookie is placed.</li>
      </ul>
      <p>
        Please note that disabling certain cookies may affect the functionality of the Services.
        Essential cookies cannot be disabled without impacting your ability to use core features.
      </p>

      <h2>5. Retention</h2>
      <p>
        Session cookies expire when you close your browser. Persistent cookies remain on your
        device until they expire or you delete them. The specific duration of each cookie varies;
        preference and analytics cookies typically expire within 12 months.
      </p>

      <h2>6. Changes to This Policy</h2>
      <p>
        We may update this Cookie Policy from time to time. We will post the updated version on
        this page with a revised &ldquo;Last updated&rdquo; date.
      </p>

      <h2>7. Contact</h2>
      <p>
        If you have questions about how we use cookies, please contact us at{' '}
        <strong>privacy@rmhstudios.com</strong>.
      </p>
    </LegalLayout>
  );
}
