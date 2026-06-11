import { createFileRoute } from '@tanstack/react-router';
import { LegalLayout } from '@/components/lockdown/LegalLayout';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      eyebrow="Legal"
      updatedDate="June 11, 2025"
    >
      <h2>1. Overview</h2>
      <p>
        RMHStudios (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is committed to
        protecting your personal information. This Privacy Policy explains what data we collect,
        how we use it, and your rights regarding that data when you use our Services.
      </p>

      <h2>2. Information We Collect</h2>
      <p>We may collect the following categories of information:</p>
      <ul>
        <li>
          <strong>Information you provide directly</strong> — such as your name, email address,
          or any other information you submit when requesting early access, contacting us, or
          creating an account.
        </li>
        <li>
          <strong>Usage data</strong> — including pages visited, features used, time spent on the
          Services, referring URLs, and device identifiers.
        </li>
        <li>
          <strong>Technical data</strong> — such as IP address, browser type and version,
          operating system, and screen resolution.
        </li>
        <li>
          <strong>Cookies and similar technologies</strong> — see our{' '}
          <a href="/cookies">Cookie Policy</a> for details.
        </li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, maintain, and improve the Services.</li>
        <li>Process early-access requests and communicate with you about your access status.</li>
        <li>Understand how the Services are used so we can improve them.</li>
        <li>Detect, prevent, and address security incidents and abuse.</li>
        <li>Comply with applicable legal obligations.</li>
        <li>Send you product updates and announcements, where you have opted in.</li>
      </ul>

      <h2>4. Legal Basis for Processing (EEA / UK Users)</h2>
      <p>
        If you are located in the European Economic Area or the United Kingdom, our legal bases
        for processing your personal data include: your consent, the performance of a contract
        with you, compliance with a legal obligation, and our legitimate interests (such as
        improving our Services and preventing fraud), where such interests are not overridden by
        your rights.
      </p>

      <h2>5. Data Sharing</h2>
      <p>We do not sell your personal data. We may share your information with:</p>
      <ul>
        <li>
          <strong>Service providers</strong> — trusted third parties that help us operate the
          Services (e.g., hosting, analytics, email delivery), bound by appropriate data
          processing agreements.
        </li>
        <li>
          <strong>Legal authorities</strong> — when required by law, legal process, or to protect
          the rights and safety of RMHStudios, our users, or the public.
        </li>
        <li>
          <strong>Business transfers</strong> — in connection with a merger, acquisition, or sale
          of assets, subject to standard confidentiality protections.
        </li>
      </ul>

      <h2>6. Data Retention</h2>
      <p>
        We retain personal data for as long as necessary to fulfil the purposes outlined in this
        Policy, comply with legal obligations, resolve disputes, and enforce our agreements. When
        data is no longer needed, we securely delete or anonymise it.
      </p>

      <h2>7. Your Rights</h2>
      <p>
        Depending on your jurisdiction, you may have the right to access, correct, delete, or
        restrict processing of your personal data, as well as the right to data portability and
        the right to object to certain processing. To exercise any of these rights, contact us at{' '}
        <strong>privacy@rmhstudios.com</strong>.
      </p>

      <h2>8. Data Security</h2>
      <p>
        We implement appropriate technical and organisational measures to protect your data
        against unauthorised access, alteration, disclosure, or destruction. However, no method
        of transmission over the internet is 100% secure.
      </p>

      <h2>9. International Transfers</h2>
      <p>
        Your data may be transferred to and processed in countries other than your country of
        residence. We take steps to ensure that such transfers comply with applicable data
        protection law, including the use of standard contractual clauses where required.
      </p>

      <h2>10. Children&rsquo;s Privacy</h2>
      <p>
        The Services are not directed at individuals under 18 years of age. We do not knowingly
        collect personal data from minors. If you believe we have inadvertently collected such
        data, please contact us immediately.
      </p>

      <h2>11. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated policy on
        this page and revise the &ldquo;Last updated&rdquo; date. For material changes, we will
        make reasonable efforts to notify you.
      </p>

      <h2>12. Contact</h2>
      <p>
        For privacy-related enquiries, please contact <strong>privacy@rmhstudios.com</strong>.
      </p>
    </LegalLayout>
  );
}
