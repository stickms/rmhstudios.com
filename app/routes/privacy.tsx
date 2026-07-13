import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { LegalCanvasPage, type LegalBlock } from '@/components/lockdown/LegalCanvasPage';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation("pages");

  const blocks: LegalBlock[] = useMemo(() => [
    { kind: "h2", text: t("privacy-s1-heading", { defaultValue: "1. Overview" }) },
    { kind: "p", runs: [{ text: t("privacy-s1-body", { defaultValue: 'RMHStudios (“we”, “us”, or “our”) is committed to protecting your personal information. This Privacy Policy explains what data we collect, how we use it, and your rights regarding that data when you use our Services.' }) }] },

    { kind: "h2", text: t("privacy-s2-heading", { defaultValue: "2. Information We Collect" }) },
    { kind: "p", runs: [{ text: t("privacy-s2-intro", { defaultValue: "We may collect the following categories of information:" }) }] },
    {
      kind: "ul",
      items: [
        [
          { text: t("privacy-s2-direct-label", { defaultValue: "Information you provide directly" }), bold: true },
          { text: t("privacy-s2-direct-body", { defaultValue: " — such as your name, email address, or any other information you submit when requesting early access, contacting us, or creating an account." }) },
        ],
        [
          { text: t("privacy-s2-usage-label", { defaultValue: "Usage data" }), bold: true },
          { text: t("privacy-s2-usage-body", { defaultValue: " — including pages visited, features used, time spent on the Services, referring URLs, and device identifiers." }) },
        ],
        [
          { text: t("privacy-s2-technical-label", { defaultValue: "Technical data" }), bold: true },
          { text: t("privacy-s2-technical-body", { defaultValue: " — such as IP address, browser type and version, operating system, and screen resolution." }) },
        ],
        [
          { text: t("privacy-s2-cookies-label", { defaultValue: "Cookies and similar technologies" }), bold: true },
          { text: " — see our " },
          { text: t("privacy-s2-cookie-policy-link", { defaultValue: "Cookie Policy" }), href: "/cookies" },
          { text: t("privacy-s2-cookies-suffix", { defaultValue: " for details." }) },
        ],
      ],
    },

    { kind: "h2", text: t("privacy-s3-heading", { defaultValue: "3. How We Use Your Information" }) },
    { kind: "p", runs: [{ text: t("privacy-s3-intro", { defaultValue: "We use the information we collect to:" }) }] },
    {
      kind: "ul",
      items: [
        [{ text: t("privacy-s3-item1", { defaultValue: "Provide, maintain, and improve the Services." }) }],
        [{ text: t("privacy-s3-item2", { defaultValue: "Process early-access requests and communicate with you about your access status." }) }],
        [{ text: t("privacy-s3-item3", { defaultValue: "Understand how the Services are used so we can improve them." }) }],
        [{ text: t("privacy-s3-item4", { defaultValue: "Detect, prevent, and address security incidents and abuse." }) }],
        [{ text: t("privacy-s3-item5", { defaultValue: "Comply with applicable legal obligations." }) }],
        [{ text: t("privacy-s3-item6", { defaultValue: "Send you product updates and announcements, where you have opted in." }) }],
      ],
    },

    { kind: "h2", text: t("privacy-s4-heading", { defaultValue: "4. Legal Basis for Processing (EEA / UK Users)" }) },
    { kind: "p", runs: [{ text: t("privacy-s4-body", { defaultValue: "If you are located in the European Economic Area or the United Kingdom, our legal bases for processing your personal data include: your consent, the performance of a contract with you, compliance with a legal obligation, and our legitimate interests (such as improving our Services and preventing fraud), where such interests are not overridden by your rights." }) }] },

    { kind: "h2", text: t("privacy-s5-heading", { defaultValue: "5. Data Sharing" }) },
    { kind: "p", runs: [{ text: t("privacy-s5-intro", { defaultValue: "We do not sell your personal data. We may share your information with:" }) }] },
    {
      kind: "ul",
      items: [
        [
          { text: t("privacy-s5-providers-label", { defaultValue: "Service providers" }), bold: true },
          { text: t("privacy-s5-providers-body", { defaultValue: " — trusted third parties that help us operate the Services (e.g., hosting, analytics, email delivery), bound by appropriate data processing agreements." }) },
        ],
        [
          { text: t("privacy-s5-authorities-label", { defaultValue: "Legal authorities" }), bold: true },
          { text: t("privacy-s5-authorities-body", { defaultValue: " — when required by law, legal process, or to protect the rights and safety of RMHStudios, our users, or the public." }) },
        ],
        [
          { text: t("privacy-s5-transfers-label", { defaultValue: "Business transfers" }), bold: true },
          { text: t("privacy-s5-transfers-body", { defaultValue: " — in connection with a merger, acquisition, or sale of assets, subject to standard confidentiality protections." }) },
        ],
      ],
    },

    { kind: "h2", text: t("privacy-s6-heading", { defaultValue: "6. Data Retention" }) },
    { kind: "p", runs: [{ text: t("privacy-s6-body", { defaultValue: "We retain personal data for as long as necessary to fulfil the purposes outlined in this Policy, comply with legal obligations, resolve disputes, and enforce our agreements. When data is no longer needed, we securely delete or anonymise it." }) }] },

    { kind: "h2", text: t("privacy-s7-heading", { defaultValue: "7. Your Rights" }) },
    {
      kind: "p",
      runs: [
        { text: t("privacy-s7-body", { defaultValue: "Depending on your jurisdiction, you may have the right to access, correct, delete, or restrict processing of your personal data, as well as the right to data portability and the right to object to certain processing. To exercise any of these rights, contact us at" }) },
        { text: " " },
        { text: "privacy@rmhstudios.com", bold: true },
        { text: "." },
      ],
    },

    { kind: "h2", text: t("privacy-s8-heading", { defaultValue: "8. Data Security" }) },
    { kind: "p", runs: [{ text: t("privacy-s8-body", { defaultValue: "We implement appropriate technical and organisational measures to protect your data against unauthorised access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure." }) }] },

    { kind: "h2", text: t("privacy-s9-heading", { defaultValue: "9. International Transfers" }) },
    { kind: "p", runs: [{ text: t("privacy-s9-body", { defaultValue: "Your data may be transferred to and processed in countries other than your country of residence. We take steps to ensure that such transfers comply with applicable data protection law, including the use of standard contractual clauses where required." }) }] },

    { kind: "h2", text: t("privacy-s10-heading", { defaultValue: "10. Children's Privacy" }) },
    { kind: "p", runs: [{ text: t("privacy-s10-body", { defaultValue: "The Services are not directed at individuals under 18 years of age. We do not knowingly collect personal data from minors. If you believe we have inadvertently collected such data, please contact us immediately." }) }] },

    { kind: "h2", text: t("privacy-s11-heading", { defaultValue: "11. Changes to This Policy" }) },
    { kind: "p", runs: [{ text: t("privacy-s11-body", { defaultValue: 'We may update this Privacy Policy from time to time. We will post the updated policy on this page and revise the “Last updated” date. For material changes, we will make reasonable efforts to notify you.' }) }] },

    { kind: "h2", text: t("privacy-s12-heading", { defaultValue: "12. Contact" }) },
    {
      kind: "p",
      runs: [
        { text: t("privacy-s12-body", { defaultValue: "For privacy-related enquiries, please contact" }) },
        { text: " " },
        { text: "privacy@rmhstudios.com", bold: true },
        { text: "." },
      ],
    },
  ], [t]);

  return (
    <LegalCanvasPage
      routeId="/privacy"
      title={t("privacy-title", { defaultValue: "Privacy Policy" })}
      eyebrow={t("privacy-eyebrow", { defaultValue: "Legal" })}
      updatedDate={t("privacy-updated-date", { defaultValue: "June 11, 2025" })}
      blocks={blocks}
    />
  );
}
