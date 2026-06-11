import { createFileRoute } from '@tanstack/react-router';
import { LegalLayout } from '@/components/lockdown/LegalLayout';

export const Route = createFileRoute('/copyright')({
  component: CopyrightPage,
});

function CopyrightPage() {
  const year = new Date().getFullYear();
  return (
    <LegalLayout
      title="Copyright Notice"
      eyebrow="Legal"
      updatedDate="June 11, 2025"
    >
      <h2>Ownership</h2>
      <p>
        Copyright &copy; {year} RMHStudios. All rights reserved. The name
        &ldquo;RMHStudios&rdquo;, the name &ldquo;RMHLink&rdquo;, the RMHStudios logo, and all
        associated branding are trademarks or registered trademarks of RMHStudios.
      </p>

      <h2>Protected Works</h2>
      <p>
        All content made available through the RMHStudios Services — including but not limited to
        text, graphics, user interface designs, logos, icons, photographs, audio clips, video
        clips, 3D models, written descriptions, software code, and the overall look and feel of
        the Services — is protected by copyright, trade dress, and other intellectual property
        laws of the relevant jurisdiction.
      </p>

      <h2>Permitted Use</h2>
      <p>
        You may access and view content on the Services for your personal, non-commercial use
        only. You may share links to pages on the Services, provided the links do not imply any
        endorsement or affiliation beyond what is expressly stated.
      </p>

      <h2>Restrictions</h2>
      <p>Without express prior written permission from RMHStudios, you may not:</p>
      <ul>
        <li>Reproduce, publish, or distribute any content from the Services in any medium.</li>
        <li>
          Create derivative works based on content from the Services, including adaptations,
          translations, or modifications.
        </li>
        <li>
          Use any RMHStudios trademark, logo, or trade name in any manner that could cause
          confusion, imply false endorsement, or disparage RMHStudios.
        </li>
        <li>
          Frame or mirror any part of the Services on any other website or application without
          our prior written consent.
        </li>
        <li>
          Use automated tools to extract, scrape, or reproduce any content from the Services at
          scale.
        </li>
      </ul>

      <h2>Third-Party Content</h2>
      <p>
        Some content displayed on the Services may be owned by third parties and is used under
        licence or with permission. Such content remains the property of the respective owners.
        RMHStudios makes no claim to ownership of third-party content.
      </p>

      <h2>DMCA &amp; Copyright Complaints</h2>
      <p>
        If you believe that your copyrighted work has been reproduced on the Services in a way
        that constitutes copyright infringement, please send a notice containing the following
        information to <strong>legal@rmhstudios.com</strong>:
      </p>
      <ul>
        <li>
          A description of the copyrighted work you claim has been infringed.
        </li>
        <li>
          A description of where the allegedly infringing material is located on the Services,
          sufficient for us to locate it.
        </li>
        <li>
          Your contact information, including name, address, telephone number, and email address.
        </li>
        <li>
          A statement that you have a good-faith belief that the disputed use is not authorised
          by the copyright owner, its agent, or the law.
        </li>
        <li>
          A statement, made under penalty of perjury, that the information in your notice is
          accurate and that you are the copyright owner or authorised to act on the copyright
          owner&rsquo;s behalf.
        </li>
        <li>An electronic or physical signature of the copyright owner or authorised agent.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        For all copyright-related enquiries, please contact{' '}
        <strong>legal@rmhstudios.com</strong>.
      </p>
    </LegalLayout>
  );
}
