import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { LegalCanvasPage, type LegalBlock } from '@/components/lockdown/LegalCanvasPage';

export const Route = createFileRoute('/terms')({
  component: TermsPage,
});

function TermsPage() {
  const { t } = useTranslation('pages');

  const blocks: LegalBlock[] = useMemo(() => [
    { kind: "h2", text: t('terms-h-acceptance', { defaultValue: '1. Acceptance of Terms' }) },
    { kind: "p", runs: [{ text: t('terms-p-acceptance', { defaultValue: 'By accessing or using any RMHStudios website, product, or service (collectively, the “Services”), you agree to be bound by these Terms of Use (“Terms”). If you do not agree to these Terms, you may not use the Services. These Terms apply to all visitors, users, and others who access the Services.' }) }] },

    { kind: "h2", text: t('terms-h-description', { defaultValue: '2. Description of Services' }) },
    { kind: "p", runs: [{ text: t('terms-p-description', { defaultValue: 'RMHStudios provides access to an early-stage platform encompassing RMHLink (a brain-computer interface research initiative), interactive experiences, media tools, and related digital products. The Services are provided on an “as available” basis and are subject to change without notice.' }) }] },

    { kind: "h2", text: t('terms-h-eligibility', { defaultValue: '3. Eligibility' }) },
    { kind: "p", runs: [{ text: t('terms-p-eligibility', { defaultValue: 'You must be at least 18 years of age to use the Services. By using the Services you represent and warrant that you meet this requirement and that you have the legal capacity to enter into these Terms.' }) }] },

    { kind: "h2", text: t('terms-h-conduct', { defaultValue: '4. User Conduct' }) },
    { kind: "p", runs: [{ text: t('terms-p-conduct-intro', { defaultValue: 'You agree not to:' }) }] },
    {
      kind: "ul",
      items: [
        [{ text: t('terms-conduct-1', { defaultValue: 'Use the Services for any unlawful purpose or in violation of any applicable law or regulation.' }) }],
        [{ text: t('terms-conduct-2', { defaultValue: 'Attempt to gain unauthorised access to any portion of the Services or any related systems or networks.' }) }],
        [{ text: t('terms-conduct-3', { defaultValue: 'Transmit any harmful, offensive, or disruptive content through the Services.' }) }],
        [{ text: t('terms-conduct-4', { defaultValue: 'Reverse engineer, decompile, or disassemble any part of the Services.' }) }],
        [{ text: t('terms-conduct-5', { defaultValue: 'Use automated means (bots, scrapers, crawlers) to access or collect data from the Services without prior written consent.' }) }],
        [{ text: t('terms-conduct-6', { defaultValue: 'Interfere with or disrupt the integrity or performance of the Services.' }) }],
      ],
    },

    { kind: "h2", text: t('terms-h-ip', { defaultValue: '5. Intellectual Property' }) },
    { kind: "p", runs: [{ text: t('terms-p-ip', { defaultValue: 'All content, features, and functionality of the Services — including but not limited to text, graphics, logos, icons, images, audio clips, 3D models, software, and the overall look and feel — are the exclusive property of RMHStudios or its licensors and are protected by applicable intellectual property laws. You may not reproduce, distribute, modify, create derivative works of, publicly display, or exploit any such content without our express prior written permission.' }) }] },

    { kind: "h2", text: t('terms-h-beta', { defaultValue: '6. Early Access & Beta Features' }) },
    { kind: "p", runs: [{ text: t('terms-p-beta', { defaultValue: 'Certain features of the Services, including RMHLink, are in early access or beta. These features are provided without warranty of any kind and may be modified, suspended, or discontinued at any time. Your use of early access features is entirely at your own risk.' }) }] },

    { kind: "h2", text: t('terms-h-privacy', { defaultValue: '7. Privacy' }) },
    {
      kind: "p",
      runs: [
        { text: t('terms-p-privacy-before-link', { defaultValue: 'Your use of the Services is also governed by our' }) },
        { text: " " },
        { text: t('terms-privacy-link', { defaultValue: 'Privacy Policy' }), href: "/privacy" },
        { text: t('terms-p-privacy-after-link', { defaultValue: ', which is incorporated into these Terms by reference. Please review it carefully.' }) },
      ],
    },

    { kind: "h2", text: t('terms-h-disclaimers', { defaultValue: '8. Disclaimers' }) },
    { kind: "p", runs: [{ text: t('terms-p-disclaimers', { defaultValue: 'THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. RMHSTUDIOS DOES NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.' }) }] },

    { kind: "h2", text: t('terms-h-liability', { defaultValue: '9. Limitation of Liability' }) },
    { kind: "p", runs: [{ text: t('terms-p-liability', { defaultValue: 'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RMHSTUDIOS AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.' }) }] },

    { kind: "h2", text: t('terms-h-governing-law', { defaultValue: '10. Governing Law' }) },
    { kind: "p", runs: [{ text: t('terms-p-governing-law', { defaultValue: 'These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which RMHStudios is registered, without regard to its conflict of law provisions.' }) }] },

    { kind: "h2", text: t('terms-h-changes', { defaultValue: '11. Changes to These Terms' }) },
    { kind: "p", runs: [{ text: t('terms-p-changes', { defaultValue: 'We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Your continued use of the Services after any changes constitutes your acceptance of the new Terms. We encourage you to review these Terms periodically.' }) }] },

    { kind: "h2", text: t('terms-h-contact', { defaultValue: '12. Contact' }) },
    {
      kind: "p",
      runs: [
        { text: t('terms-p-contact-before', { defaultValue: 'If you have questions about these Terms, please contact us at' }) },
        { text: " " },
        { text: "legal@rmhstudios.com", bold: true },
        { text: "." },
      ],
    },
  ], [t]);

  return (
    <LegalCanvasPage
      routeId="/terms"
      title={t('terms-title', { defaultValue: 'Terms of Use' })}
      eyebrow={t('terms-eyebrow', { defaultValue: 'Legal' })}
      updatedDate={t('terms-updated-date', { defaultValue: 'June 11, 2025' })}
      blocks={blocks}
    />
  );
}
