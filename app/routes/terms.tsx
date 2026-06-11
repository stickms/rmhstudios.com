import { createFileRoute } from '@tanstack/react-router';
import { LegalLayout } from '@/components/lockdown/LegalLayout';

export const Route = createFileRoute('/terms')({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      eyebrow="Legal"
      updatedDate="June 11, 2025"
    >
      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using any RMHStudios website, product, or service (collectively, the
        &ldquo;Services&rdquo;), you agree to be bound by these Terms of Use (&ldquo;Terms&rdquo;).
        If you do not agree to these Terms, you may not use the Services. These Terms apply to all
        visitors, users, and others who access the Services.
      </p>

      <h2>2. Description of Services</h2>
      <p>
        RMHStudios provides access to an early-stage platform encompassing RMHLink (a
        brain-computer interface research initiative), interactive experiences, media tools, and
        related digital products. The Services are provided on an &ldquo;as available&rdquo; basis
        and are subject to change without notice.
      </p>

      <h2>3. Eligibility</h2>
      <p>
        You must be at least 18 years of age to use the Services. By using the Services you
        represent and warrant that you meet this requirement and that you have the legal capacity to
        enter into these Terms.
      </p>

      <h2>4. User Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Services for any unlawful purpose or in violation of any applicable law or regulation.</li>
        <li>Attempt to gain unauthorised access to any portion of the Services or any related systems or networks.</li>
        <li>Transmit any harmful, offensive, or disruptive content through the Services.</li>
        <li>Reverse engineer, decompile, or disassemble any part of the Services.</li>
        <li>Use automated means (bots, scrapers, crawlers) to access or collect data from the Services without prior written consent.</li>
        <li>Interfere with or disrupt the integrity or performance of the Services.</li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <p>
        All content, features, and functionality of the Services — including but not limited to
        text, graphics, logos, icons, images, audio clips, 3D models, software, and the overall
        look and feel — are the exclusive property of RMHStudios or its licensors and are protected
        by applicable intellectual property laws. You may not reproduce, distribute, modify, create
        derivative works of, publicly display, or exploit any such content without our express
        prior written permission.
      </p>

      <h2>6. Early Access &amp; Beta Features</h2>
      <p>
        Certain features of the Services, including RMHLink, are in early access or beta. These
        features are provided without warranty of any kind and may be modified, suspended, or
        discontinued at any time. Your use of early access features is entirely at your own risk.
      </p>

      <h2>7. Privacy</h2>
      <p>
        Your use of the Services is also governed by our{' '}
        <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by
        reference. Please review it carefully.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        RMHSTUDIOS DOES NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR
        SECURE.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RMHSTUDIOS AND ITS OFFICERS,
        DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE
        SERVICES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of the
        jurisdiction in which RMHStudios is registered, without regard to its conflict of law
        provisions.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We reserve the right to modify these Terms at any time. Changes will be effective
        immediately upon posting. Your continued use of the Services after any changes constitutes
        your acceptance of the new Terms. We encourage you to review these Terms periodically.
      </p>

      <h2>12. Contact</h2>
      <p>
        If you have questions about these Terms, please contact us at{' '}
        <strong>legal@rmhstudios.com</strong>.
      </p>
    </LegalLayout>
  );
}
