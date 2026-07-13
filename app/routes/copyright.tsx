import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { LegalCanvasPage, type LegalBlock } from '@/components/lockdown/LegalCanvasPage';

export const Route = createFileRoute('/copyright')({
  component: CopyrightPage,
});

function CopyrightPage() {
  const { t } = useTranslation("pages");
  const year = new Date().getFullYear();

  const blocks: LegalBlock[] = useMemo(() => [
    { kind: "h2", text: t("copyright-ownership-heading", { defaultValue: "Ownership" }) },
    { kind: "p", runs: [{ text: t("copyright-ownership-body", { defaultValue: "Copyright © {{year}} RMHStudios. All rights reserved. The name “RMHStudios”, the name “RMHLink”, the RMHStudios logo, and all associated branding are trademarks or registered trademarks of RMHStudios.", year }) }] },

    { kind: "h2", text: t("copyright-protected-works-heading", { defaultValue: "Protected Works" }) },
    { kind: "p", runs: [{ text: t("copyright-protected-works-body", { defaultValue: "All content made available through the RMHStudios Services — including but not limited to text, graphics, user interface designs, logos, icons, photographs, audio clips, video clips, 3D models, written descriptions, software code, and the overall look and feel of the Services — is protected by copyright, trade dress, and other intellectual property laws of the relevant jurisdiction." }) }] },

    { kind: "h2", text: t("copyright-permitted-use-heading", { defaultValue: "Permitted Use" }) },
    { kind: "p", runs: [{ text: t("copyright-permitted-use-body", { defaultValue: "You may access and view content on the Services for your personal, non-commercial use only. You may share links to pages on the Services, provided the links do not imply any endorsement or affiliation beyond what is expressly stated." }) }] },

    { kind: "h2", text: t("copyright-restrictions-heading", { defaultValue: "Restrictions" }) },
    { kind: "p", runs: [{ text: t("copyright-restrictions-intro", { defaultValue: "Without express prior written permission from RMHStudios, you may not:" }) }] },
    {
      kind: "ul",
      items: [
        [{ text: t("copyright-restriction-1", { defaultValue: "Reproduce, publish, or distribute any content from the Services in any medium." }) }],
        [{ text: t("copyright-restriction-2", { defaultValue: "Create derivative works based on content from the Services, including adaptations, translations, or modifications." }) }],
        [{ text: t("copyright-restriction-3", { defaultValue: "Use any RMHStudios trademark, logo, or trade name in any manner that could cause confusion, imply false endorsement, or disparage RMHStudios." }) }],
        [{ text: t("copyright-restriction-4", { defaultValue: "Frame or mirror any part of the Services on any other website or application without our prior written consent." }) }],
        [{ text: t("copyright-restriction-5", { defaultValue: "Use automated tools to extract, scrape, or reproduce any content from the Services at scale." }) }],
      ],
    },

    { kind: "h2", text: t("copyright-third-party-heading", { defaultValue: "Third-Party Content" }) },
    { kind: "p", runs: [{ text: t("copyright-third-party-body", { defaultValue: "Some content displayed on the Services may be owned by third parties and is used under licence or with permission. Such content remains the property of the respective owners. RMHStudios makes no claim to ownership of third-party content." }) }] },

    { kind: "h2", text: t("copyright-dmca-heading", { defaultValue: "DMCA & Copyright Complaints" }) },
    {
      kind: "p",
      runs: [
        { text: t("copyright-dmca-intro", { defaultValue: "If you believe that your copyrighted work has been reproduced on the Services in a way that constitutes copyright infringement, please send a notice containing the following information to" }) },
        { text: " " },
        { text: "legal@rmhstudios.com", bold: true },
        { text: ":" },
      ],
    },
    {
      kind: "ul",
      items: [
        [{ text: t("copyright-dmca-item-1", { defaultValue: "A description of the copyrighted work you claim has been infringed." }) }],
        [{ text: t("copyright-dmca-item-2", { defaultValue: "A description of where the allegedly infringing material is located on the Services, sufficient for us to locate it." }) }],
        [{ text: t("copyright-dmca-item-3", { defaultValue: "Your contact information, including name, address, telephone number, and email address." }) }],
        [{ text: t("copyright-dmca-item-4", { defaultValue: "A statement that you have a good-faith belief that the disputed use is not authorised by the copyright owner, its agent, or the law." }) }],
        [{ text: t("copyright-dmca-item-5", { defaultValue: "A statement, made under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorised to act on the copyright owner's behalf." }) }],
        [{ text: t("copyright-dmca-item-6", { defaultValue: "An electronic or physical signature of the copyright owner or authorised agent." }) }],
      ],
    },

    { kind: "h2", text: t("copyright-contact-heading", { defaultValue: "Contact" }) },
    {
      kind: "p",
      runs: [
        { text: t("copyright-contact-body", { defaultValue: "For all copyright-related enquiries, please contact" }) },
        { text: " " },
        { text: "legal@rmhstudios.com", bold: true },
        { text: "." },
      ],
    },
  ], [t, year]);

  return (
    <LegalCanvasPage
      routeId="/copyright"
      title={t("copyright-title", { defaultValue: "Copyright Notice" })}
      eyebrow={t("copyright-eyebrow", { defaultValue: "Legal" })}
      updatedDate={t("copyright-updated-date", { defaultValue: "June 11, 2025" })}
      blocks={blocks}
    />
  );
}
