/**
 * Call for Papers Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_site/research/call')({
  head: () => ({
    meta: [
      { title: 'Call for Papers — RMHSTRC 2026 | RMH Studios' },
      { name: 'description', content: 'Call for papers for the 5th Annual RMH Studios Technical Research Conference (RMHSTRC 2026), Rochester, MN, June 19, 2026.' },
    ],
  }),
  component: CallForPapersPage,
});

const sectionTitle =
  'text-2xl md:text-3xl font-black tracking-tight font-(family-name:--site-font-display) text-(--site-text) mb-4 mt-12';
const subTitle =
  'text-xl font-bold text-(--site-text) mb-3 mt-8';
const prose =
  'text-(--site-text-muted) leading-relaxed mb-4';
const list =
  'list-disc list-inside text-(--site-text-muted) leading-relaxed space-y-2 mb-4 ml-4';
const orderedList =
  'list-decimal list-inside text-(--site-text-muted) leading-relaxed space-y-2 mb-4 ml-4';
const code =
  'bg-(--site-bg-subtle) text-(--site-accent) px-1.5 py-0.5 rounded text-sm font-mono';
const tableCell =
  'border border-(--site-border) px-4 py-2 text-(--site-text-muted) text-sm';
const tableHeader =
  'border border-(--site-border) px-4 py-2 text-(--site-text) text-sm font-semibold bg-(--site-bg-subtle)';

function CallForPapersPage() {
  const { t } = useTranslation("research");
  return (
    <main className="min-h-screen pb-20 px-4 md:px-8 pt-20 md:pt-24 bg-(--site-bg)">
      <article className="container mx-auto max-w-4xl relative z-10">
        <Link
          to="/research"
          className="inline-flex items-center gap-1 text-sm text-(--site-accent) hover:underline mb-8"
        >
          {t("back-to-research", { defaultValue: "← Back to Research" })}
        </Link>

        <header className="text-center mb-12 border-b border-(--site-border) pb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-(--site-accent) mb-3">
            {t("call-for-papers", { defaultValue: "Call for Papers" })}
          </p>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight font-(family-name:--site-font-display) text-(--site-text) mb-4">
            {t("conference-title", { defaultValue: "5th Annual RMH Studios Technical Research Conference" })}
          </h1>
          <p className="text-lg text-(--site-text-muted) mb-1">{t("conference-acronym-year", { defaultValue: "RMHSTRC 2026" })}</p>
          <p className="text-(--site-text-muted)">{t("conference-location-date", { defaultValue: "Rochester, Minnesota, USA — June 19, 2026" })}</p>
        </header>

        <h2 className={sectionTitle}>{t("section-overview-title", { defaultValue: "1. Conference Overview" })}</h2>
        <p className={prose}>
          {t("overview-p1", { defaultValue: "The RMH Studios Technical Research Conference (RMHSTRC) is the premier annual venue for original, rigorously peer-reviewed research at the confluence of artificial intelligence, computational mathematics, statistical physics, cognitive science, and interactive-entertainment technology. Now in its fifth year, RMHSTRC 2026 will be held on" })}
          <strong> {t("overview-date", { defaultValue: "June 19, 2026" })}</strong> {t("overview-in", { defaultValue: "in" })} <strong>{t("overview-city", { defaultValue: "Rochester, Minnesota" })}</strong>.
        </p>
        <p className={prose}>
          {t("overview-p2", { defaultValue: "We solicit high-quality, previously unpublished manuscripts that advance the state of the art in any of the conference's topical areas. Accepted papers will appear in the" })} <em>{t("overview-journal", { defaultValue: "RMH Studios Technical Reports" })}</em> {t("overview-p2-cont", { defaultValue: "(ISSN 2996-0142) and will be archived in perpetuity through the RMH Studios Digital Library." })}
        </p>

        <h2 className={sectionTitle}>{t("section-topics-title", { defaultValue: "2. Topics of Interest" })}</h2>
        <p className={prose}>{t("topics-intro", { defaultValue: "We welcome submissions on — but not limited to — the following topics:" })}</p>
        <ul className={list}>
          <li>{t("topic-rl", { defaultValue: "Reinforcement learning and multi-agent systems in game environments" })}</li>
          <li>{t("topic-pcg", { defaultValue: "Procedural content generation and stochastic level design" })}</li>
          <li>{t("topic-topology", { defaultValue: "Computational topology and topological data analysis applied to games or AI" })}</li>
          <li>{t("topic-stat-mech", { defaultValue: "Non-equilibrium statistical mechanics of learning systems" })}</li>
          <li>{t("topic-spectral", { defaultValue: "Spectral graph theory, Markov-chain methods, and ergodic theory" })}</li>
          <li>{t("topic-neuro", { defaultValue: "Neural correlates of flow states, immersion, and cognitive load in gaming" })}</li>
          <li>{t("topic-generative", { defaultValue: "Generative models (GANs, diffusion models, VAEs) for game-asset synthesis" })}</li>
          <li>{t("topic-adaptive", { defaultValue: "Adaptive difficulty systems, player modeling, and Bayesian skill estimation" })}</li>
          <li>{t("topic-category", { defaultValue: "Category-theoretic and algebraic approaches to game mechanics" })}</li>
          <li>{t("topic-formal", { defaultValue: "Formal verification and correctness proofs for game logic" })}</li>
          <li>{t("topic-hci", { defaultValue: "Human-computer interaction and UX research in interactive media" })}</li>
          <li>{t("topic-comp-neuro", { defaultValue: "Computational neuroscience and psychophysiology of play" })}</li>
          <li>{t("topic-hpc", { defaultValue: "High-performance computing, GPU/TPU optimization for real-time AI" })}</li>
          <li>{t("topic-ethics", { defaultValue: "Ethics, fairness, and safety in game AI systems" })}</li>
        </ul>

        <h2 className={sectionTitle}>{t("section-dates-title", { defaultValue: "3. Important Dates" })}</h2>
        <p className={prose}>{t("dates-aoe-note", { defaultValue: "All deadlines are 23:59 Anywhere on Earth (AoE, UTC-12)." })}</p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={tableHeader}>{t("dates-col-milestone", { defaultValue: "Milestone" })}</th>
                <th className={tableHeader}>{t("dates-col-date", { defaultValue: "Date" })}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={tableCell}>{t("date-abstract-reg", { defaultValue: "Abstract registration (optional but encouraged)" })}</td><td className={tableCell}>{t("date-abstract-reg-val", { defaultValue: "April 4, 2026" })}</td></tr>
              <tr><td className={tableCell}>{t("date-full-paper", { defaultValue: "Full paper submission deadline" })}</td><td className={tableCell}>{t("date-full-paper-val", { defaultValue: "April 18, 2026" })}</td></tr>
              <tr><td className={tableCell}>{t("date-desk-rejection", { defaultValue: "Desk-rejection notification" })}</td><td className={tableCell}>{t("date-desk-rejection-val", { defaultValue: "April 25, 2026" })}</td></tr>
              <tr><td className={tableCell}>{t("date-rebuttal", { defaultValue: "Author rebuttal period" })}</td><td className={tableCell}>{t("date-rebuttal-val", { defaultValue: "May 9 – May 16, 2026" })}</td></tr>
              <tr><td className={tableCell}>{t("date-acceptance", { defaultValue: "Acceptance notification" })}</td><td className={tableCell}>{t("date-acceptance-val", { defaultValue: "May 30, 2026" })}</td></tr>
              <tr><td className={tableCell}>{t("date-camera-ready", { defaultValue: "Camera-ready deadline" })}</td><td className={tableCell}>{t("date-camera-ready-val", { defaultValue: "June 7, 2026" })}</td></tr>
              <tr><td className={tableCell}>{t("date-conference", { defaultValue: "Conference date" })}</td><td className={tableCell}>{t("date-conference-val", { defaultValue: "June 19, 2026" })}</td></tr>
            </tbody>
          </table>
        </div>

        <h2 className={sectionTitle}>{t("section-submission-types-title", { defaultValue: "4. Submission Types" })}</h2>
        <p className={prose}>{t("submission-types-intro", { defaultValue: "RMHSTRC 2026 accepts submissions in three categories:" })}</p>

        <h3 className={subTitle}>{t("full-papers-heading", { defaultValue: "4.1 Full Research Papers (10 – 25 pages)" })}</h3>
        <p className={prose}>
          {t("full-papers-desc", { defaultValue: "Original, substantial contributions presenting novel theoretical results, algorithms, empirical studies, or systems. Full papers undergo rigorous double-blind review by at least three members of the Program Committee. Accepted full papers are allocated a 25-minute oral presentation slot followed by 10 minutes of Q&A." })}
        </p>

        <h3 className={subTitle}>{t("short-papers-heading", { defaultValue: "4.2 Short Papers (4 – 9 pages)" })}</h3>
        <p className={prose}>
          {t("short-papers-desc", { defaultValue: "Concise reports of work in progress, negative results of scientific value, or focused case studies. Short papers receive double-blind review by at least two reviewers. Accepted short papers are presented as 5-minute spotlight talks with poster sessions." })}
        </p>

        <h3 className={subTitle}>{t("extended-abstracts-heading", { defaultValue: "4.3 Extended Abstracts (2 – 3 pages)" })}</h3>
        <p className={prose}>
          {t("extended-abstracts-desc", { defaultValue: "Preliminary ideas, position statements, or demonstrations. Extended abstracts are lightly reviewed and presented during the poster session. They are not included in the archival proceedings but are distributed as supplementary material." })}
        </p>

        <h2 className={sectionTitle}>{t("section-formatting-title", { defaultValue: "5. Formatting Requirements" })}</h2>
        <p className={prose}>{t("formatting-intro", { defaultValue: "All submissions must conform to the following specifications. Non-compliant manuscripts will be desk-rejected without review." })}</p>

        <h3 className={subTitle}>{t("general-format-heading", { defaultValue: "5.1 General Format" })}</h3>
        <ul className={list}>
          <li><strong>{t("format-template-label", { defaultValue: "Template:" })}</strong> {t("format-template-desc", { defaultValue: "Authors must use the official RMHSTRC 2026 LaTeX template (" })}<span className={code}>rmhstrc2026.cls</span>{t("format-template-desc2", { defaultValue: "), available on the conference website. Microsoft Word submissions are not accepted." })}</li>
          <li><strong>{t("format-page-size-label", { defaultValue: "Page size:" })}</strong> {t("format-page-size-desc", { defaultValue: "US Letter (8.5 × 11 in / 215.9 × 279.4 mm)." })}</li>
          <li><strong>{t("format-margins-label", { defaultValue: "Margins:" })}</strong> {t("format-margins-desc", { defaultValue: "1 inch (25.4 mm) on all sides." })}</li>
          <li><strong>{t("format-font-label", { defaultValue: "Font:" })}</strong> {t("format-font-desc", { defaultValue: "10 pt Times New Roman (or equivalent serif) for body text. Section headings in 12 pt bold. Mathematics set in Computer Modern or Latin Modern." })}</li>
          <li><strong>{t("format-columns-label", { defaultValue: "Columns:" })}</strong> {t("format-columns-desc", { defaultValue: "Two-column format with 0.25 in (6.35 mm) column separation." })}</li>
          <li><strong>{t("format-line-spacing-label", { defaultValue: "Line spacing:" })}</strong> {t("format-line-spacing-desc", { defaultValue: "Single-spaced body text." })}</li>
          <li><strong>{t("format-page-numbers-label", { defaultValue: "Page numbers:" })}</strong> {t("format-page-numbers-desc", { defaultValue: "Omitted in the submission version; added automatically in camera-ready." })}</li>
        </ul>

        <h3 className={subTitle}>{t("title-block-heading", { defaultValue: "5.2 Title and Author Block" })}</h3>
        <ul className={list}>
          <li>{t("title-block-item1", { defaultValue: "The title must be centered, set in 14 pt bold, and should not exceed two lines." })}</li>
          <li>{t("title-block-item2-pre", { defaultValue: "Author names and affiliations must be" })} <strong>{t("title-block-omitted", { defaultValue: "omitted" })}</strong> {t("title-block-item2-post", { defaultValue: 'in the review version to maintain double-blind integrity. Replace with "Anonymous Author(s)".' })}</li>
          <li>{t("title-block-item3", { defaultValue: "The camera-ready version must include all author names, institutional affiliations, and corresponding-author email addresses." })}</li>
        </ul>

        <h3 className={subTitle}>{t("abstract-keywords-heading", { defaultValue: "5.3 Abstract and Keywords" })}</h3>
        <ul className={list}>
          <li>{t("abstract-item1", { defaultValue: "Every submission must include a structured abstract of no more than 300 words." })}</li>
          <li>{t("abstract-item2", { defaultValue: "Provide 5 – 8 keywords, separated by semicolons, immediately below the abstract." })}</li>
        </ul>

        <h3 className={subTitle}>{t("math-typesetting-heading", { defaultValue: "5.4 Mathematical Typesetting" })}</h3>
        <p className={prose}>{t("math-typesetting-intro", { defaultValue: "Given the highly technical nature of RMHSTRC, rigorous mathematical presentation is essential:" })}</p>
        <ul className={list}>
          <li>{t("math-item1-pre", { defaultValue: "All equations must be numbered sequentially using the" })} <span className={code}>\equation</span> {t("math-item1-or", { defaultValue: "or" })} <span className={code}>\align</span> {t("math-item1-post", { defaultValue: "environments." })}</li>
          <li>{t("math-item2-pre", { defaultValue: "Definitions, theorems, lemmas, propositions, and corollaries must use the" })} <span className={code}>\newtheorem</span> {t("math-item2-post", { defaultValue: "environments provided by the template." })}</li>
          <li>{t("math-item3-pre", { defaultValue: "Proofs should begin with" })} <span className={code}>\begin&#123;proof&#125;</span> {t("math-item3-post", { defaultValue: "and end with a QED symbol." })}</li>
          <li>{t("math-item4", { defaultValue: "Notation must be consistent throughout the manuscript." })}</li>
        </ul>

        <h3 className={subTitle}>{t("figures-tables-heading", { defaultValue: "5.5 Figures, Tables, and Algorithms" })}</h3>
        <ul className={list}>
          <li>{t("figures-item1", { defaultValue: "Figures must be vector graphics (PDF, EPS) or high-resolution raster images (at least 300 DPI)." })}</li>
          <li>{t("figures-item2", { defaultValue: "All figures and tables must be referenced in the text and captioned descriptively." })}</li>
          <li>{t("figures-item3-pre", { defaultValue: "Algorithms should be typeset using the" })} <span className={code}>algorithm2e</span> {t("figures-item3-or", { defaultValue: "or" })} <span className={code}>algorithmicx</span> {t("figures-item3-post", { defaultValue: "package." })}</li>
          <li>{t("figures-item4", { defaultValue: "Color figures are permitted but must remain legible when printed in grayscale." })}</li>
        </ul>

        <h3 className={subTitle}>{t("citations-heading", { defaultValue: "5.6 Citations and References" })}</h3>
        <ul className={list}>
          <li>{t("citations-item1-pre", { defaultValue: "Use the" })} <span className={code}>natbib</span> {t("citations-item1-post", { defaultValue: "package with the author-year citation style." })}</li>
          <li>{t("citations-item2-pre", { defaultValue: "The bibliography must be generated with BibTeX using the provided" })} <span className={code}>rmhstrc2026.bst</span> {t("citations-item2-post", { defaultValue: "style file." })}</li>
          <li>{t("citations-item3", { defaultValue: "All references must be complete: include authors, title, venue or journal, year, volume, pages, and DOI or URL where available." })}</li>
          <li>{t("citations-item4", { defaultValue: "Self-citations should not exceed 15% of total references and must be anonymized in the review version." })}</li>
        </ul>

        <h3 className={subTitle}>{t("supplementary-heading", { defaultValue: "5.7 Supplementary Material" })}</h3>
        <ul className={list}>
          <li>{t("supplementary-item1", { defaultValue: "Authors may attach supplementary material (proofs, code, datasets, extended results) as a separate PDF or ZIP archive." })}</li>
          <li>{t("supplementary-item2-pre", { defaultValue: "Supplementary material is provided for reviewer convenience and" })} <strong>{t("supplementary-must-not", { defaultValue: "must not" })}</strong> {t("supplementary-item2-post", { defaultValue: "be required to understand the core contribution." })}</li>
          <li>{t("supplementary-item3", { defaultValue: "Code submissions should include a README with reproduction instructions. Anonymize repository URLs during review." })}</li>
        </ul>

        <h2 className={sectionTitle}>{t("section-submission-instructions-title", { defaultValue: "6. Submission Instructions" })}</h2>

        <h3 className={subTitle}>{t("file-format-heading", { defaultValue: "6.1 File Format" })}</h3>
        <p className={prose}>{t("file-format-desc", { defaultValue: "Submit a single PDF compiled from the official LaTeX template. The PDF must embed all fonts and must not exceed 20 MB for the main manuscript." })}</p>

        <h3 className={subTitle}>{t("submission-method-heading", { defaultValue: "6.2 Submission Method" })}</h3>
        <p className={prose}>{t("submission-method-desc", { defaultValue: "All submissions must be sent via email to:" })}</p>
        <p className="text-center text-lg font-bold text-(--site-accent) mb-4">
          <a href="mailto:research@rmhstudios.com" className="hover:underline">research@rmhstudios.com</a>
        </p>
        <p className={prose}>{t("submission-subject-intro", { defaultValue: "Use the following email subject-line format:" })}</p>
        <p className="mb-4 ml-4">
          <span className={code}>[RMHSTRC-2026] [Full | Short | Abstract] &lt;Paper Title&gt;</span>
        </p>

        <h3 className={subTitle}>{t("double-blind-heading", { defaultValue: "6.3 Double-Blind Policy" })}</h3>
        <p className={prose}>{t("double-blind-intro", { defaultValue: "RMHSTRC employs a strict double-blind review process. Authors must take care to anonymize their submissions:" })}</p>
        <ul className={list}>
          <li>{t("double-blind-item1", { defaultValue: "Remove all author names, affiliations, and acknowledgements." })}</li>
          <li>{t("double-blind-item2", { defaultValue: 'Replace self-references with "[Anonymous]" or refer to prior work in the third person.' })}</li>
          <li>{t("double-blind-item3", { defaultValue: "Do not include links to non-anonymized code repositories or personal websites." })}</li>
          <li>{t("double-blind-item4", { defaultValue: "Redact funding agency names or grant numbers that could identify the authors." })}</li>
        </ul>

        <h2 className={sectionTitle}>{t("section-review-title", { defaultValue: "7. Review Process and Criteria" })}</h2>
        <p className={prose}>{t("review-intro", { defaultValue: "Each full paper is assigned to at least three Program Committee members. Reviewers evaluate submissions on:" })}</p>
        <ol className={orderedList}>
          <li><strong>{t("review-criterion-1", { defaultValue: "Technical Soundness" })}</strong></li>
          <li><strong>{t("review-criterion-2", { defaultValue: "Novelty and Originality" })}</strong></li>
          <li><strong>{t("review-criterion-3", { defaultValue: "Significance" })}</strong></li>
          <li><strong>{t("review-criterion-4", { defaultValue: "Clarity and Presentation" })}</strong></li>
          <li><strong>{t("review-criterion-5", { defaultValue: "Reproducibility" })}</strong></li>
          <li><strong>{t("review-criterion-6", { defaultValue: "Related Work" })}</strong></li>
        </ol>

        <h2 className={sectionTitle}>{t("section-ethics-title", { defaultValue: "8. Ethical Guidelines and Dual-Use Policy" })}</h2>
        <p className={prose}>{t("ethics-p1", { defaultValue: "All research involving human subjects must have been approved by an IRB or equivalent ethics committee prior to submission." })}</p>
        <p className={prose}>{t("ethics-p2", { defaultValue: "Authors must disclose any potential conflicts of interest, sources of funding, and use of generative AI tools in the preparation of the manuscript." })}</p>

        <h2 className={sectionTitle}>{t("section-camera-ready-title", { defaultValue: "9. Camera-Ready Preparation and Presentation" })}</h2>
        <p className={prose}>{t("camera-ready-intro", { defaultValue: "Accepted papers must incorporate all required revisions. Camera-ready manuscripts are due by" })} <strong>{t("camera-ready-due-date", { defaultValue: "June 7, 2026" })}</strong>.</p>
        <ul className={list}>
          <li>{t("camera-ready-item1", { defaultValue: "De-anonymized author block with full names, affiliations, and ORCID identifiers." })}</li>
          <li>{t("camera-ready-item2", { defaultValue: "A completed copyright-transfer form (provided upon acceptance)." })}</li>
          <li>{t("camera-ready-item3", { defaultValue: "Final PDF compiled from the RMHSTRC 2026 template with embedded fonts." })}</li>
          <li>{t("camera-ready-item4", { defaultValue: "LaTeX source archive for archival typesetting." })}</li>
        </ul>

        <h2 className={sectionTitle}>{t("section-contact-title", { defaultValue: "10. Contact Information" })}</h2>
        <p className={prose}>{t("contact-intro", { defaultValue: "For questions regarding the call for papers, please contact the Program Chair:" })}</p>
        <p className="mb-2 text-(--site-text)">
          <strong>{t("contact-email-label", { defaultValue: "Email:" })}</strong>{' '}
          <a href="mailto:research@rmhstudios.com" className="text-(--site-accent) hover:underline">research@rmhstudios.com</a>
        </p>
        <p className="mb-2 text-(--site-text)">
          <strong>{t("contact-website-label", { defaultValue: "Conference website:" })}</strong>{' '}
          <Link to="/research" className="text-(--site-accent) hover:underline">rmhstudios.com/research</Link>
        </p>

        <div className="mt-12 mb-8 border-t border-(--site-border) pt-8 text-center">
          <p className="text-sm text-(--site-text-muted)">
            {t("closing-message", { defaultValue: "We look forward to your contributions and to an intellectually stimulating program at RMHSTRC 2026." })}
          </p>
        </div>
      </article>
    </main>
  );
}
