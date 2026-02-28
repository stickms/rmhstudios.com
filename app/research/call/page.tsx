import Link from 'next/link';

export const metadata = {
  title: 'Call for Papers — RMHSTRC 2026 | RMH Studios',
  description:
    'Call for papers for the 5th Annual RMH Studios Technical Research Conference (RMHSTRC 2026), Rochester, MN, June 19, 2026.',
};

/* ------------------------------------------------------------------ */
/*  Style helpers – keep the page self-contained                       */
/* ------------------------------------------------------------------ */
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

export default function CallForPapersPage() {
  return (
    <main className="min-h-screen pb-20 px-4 md:px-8 pt-20 md:pt-24 bg-(--site-bg)">
      <article className="container mx-auto max-w-4xl relative z-10">

        {/* Back link */}
        <Link
          href="/research"
          className="inline-flex items-center gap-1 text-sm text-(--site-accent) hover:underline mb-8"
        >
          &larr; Back to Research
        </Link>

        {/* Header */}
        <header className="text-center mb-12 border-b border-(--site-border) pb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-(--site-accent) mb-3">
            Call for Papers
          </p>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight font-(family-name:--site-font-display) text-(--site-text) mb-4">
            5th Annual RMH Studios Technical Research Conference
          </h1>
          <p className="text-lg text-(--site-text-muted) mb-1">
            RMHSTRC 2026
          </p>
          <p className="text-(--site-text-muted)">
            Rochester, Minnesota, USA &mdash; June 19, 2026
          </p>
        </header>

        {/* -------------------------------------------------------------- */}
        {/*  1. Overview                                                    */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>1. Conference Overview</h2>
        <p className={prose}>
          The RMH Studios Technical Research Conference (RMHSTRC) is the premier
          annual venue for original, rigorously peer-reviewed research at the
          confluence of artificial intelligence, computational mathematics,
          statistical physics, cognitive science, and interactive-entertainment
          technology. Now in its fifth year, RMHSTRC 2026 will be held on
          <strong> June 19, 2026</strong> in <strong>Rochester, Minnesota</strong>.
        </p>
        <p className={prose}>
          We solicit high-quality, previously unpublished manuscripts that
          advance the state of the art in any of the conference&apos;s topical
          areas. Accepted papers will appear in the <em>RMH Studios Technical
          Reports</em> (ISSN 2996-0142) and will be archived in perpetuity
          through the RMH Studios Digital Library.
        </p>

        {/* -------------------------------------------------------------- */}
        {/*  2. Topics of Interest                                          */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>2. Topics of Interest</h2>
        <p className={prose}>
          We welcome submissions on — but not limited to — the following
          topics:
        </p>
        <ul className={list}>
          <li>Reinforcement learning and multi-agent systems in game environments</li>
          <li>Procedural content generation and stochastic level design</li>
          <li>Computational topology and topological data analysis applied to games or AI</li>
          <li>Non-equilibrium statistical mechanics of learning systems</li>
          <li>Spectral graph theory, Markov-chain methods, and ergodic theory</li>
          <li>Neural correlates of flow states, immersion, and cognitive load in gaming</li>
          <li>Generative models (GANs, diffusion models, VAEs) for game-asset synthesis</li>
          <li>Adaptive difficulty systems, player modeling, and Bayesian skill estimation</li>
          <li>Category-theoretic and algebraic approaches to game mechanics</li>
          <li>Formal verification and correctness proofs for game logic</li>
          <li>Human-computer interaction and UX research in interactive media</li>
          <li>Computational neuroscience and psychophysiology of play</li>
          <li>High-performance computing, GPU/TPU optimization for real-time AI</li>
          <li>Ethics, fairness, and safety in game AI systems</li>
        </ul>

        {/* -------------------------------------------------------------- */}
        {/*  3. Important Dates                                             */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>3. Important Dates</h2>
        <p className={prose}>
          All deadlines are 23:59 Anywhere on Earth (AoE, UTC-12).
        </p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={tableHeader}>Milestone</th>
                <th className={tableHeader}>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={tableCell}>Abstract registration (optional but encouraged)</td><td className={tableCell}>April 4, 2026</td></tr>
              <tr><td className={tableCell}>Full paper submission deadline</td><td className={tableCell}>April 18, 2026</td></tr>
              <tr><td className={tableCell}>Desk-rejection notification</td><td className={tableCell}>April 25, 2026</td></tr>
              <tr><td className={tableCell}>Author rebuttal period</td><td className={tableCell}>May 9 &ndash; May 16, 2026</td></tr>
              <tr><td className={tableCell}>Acceptance notification</td><td className={tableCell}>May 30, 2026</td></tr>
              <tr><td className={tableCell}>Camera-ready deadline</td><td className={tableCell}>June 7, 2026</td></tr>
              <tr><td className={tableCell}>Conference date</td><td className={tableCell}>June 19, 2026</td></tr>
            </tbody>
          </table>
        </div>

        {/* -------------------------------------------------------------- */}
        {/*  4. Submission Types                                            */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>4. Submission Types</h2>
        <p className={prose}>
          RMHSTRC 2026 accepts submissions in three categories:
        </p>

        <h3 className={subTitle}>4.1 Full Research Papers (10 &ndash; 25 pages)</h3>
        <p className={prose}>
          Original, substantial contributions presenting novel theoretical
          results, algorithms, empirical studies, or systems. Full papers
          undergo rigorous double-blind review by at least three members of
          the Program Committee. Accepted full papers are allocated a 25-minute
          oral presentation slot followed by 10 minutes of Q&amp;A.
        </p>

        <h3 className={subTitle}>4.2 Short Papers (4 &ndash; 9 pages)</h3>
        <p className={prose}>
          Concise reports of work in progress, negative results of scientific
          value, or focused case studies. Short papers receive double-blind
          review by at least two reviewers. Accepted short papers are presented
          as 5-minute spotlight talks with poster sessions.
        </p>

        <h3 className={subTitle}>4.3 Extended Abstracts (2 &ndash; 3 pages)</h3>
        <p className={prose}>
          Preliminary ideas, position statements, or demonstrations.
          Extended abstracts are lightly reviewed and presented during the
          poster session. They are not included in the archival proceedings
          but are distributed as supplementary material.
        </p>

        {/* -------------------------------------------------------------- */}
        {/*  5. Formatting Requirements                                     */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>5. Formatting Requirements</h2>
        <p className={prose}>
          All submissions must conform to the following specifications.
          Non-compliant manuscripts will be desk-rejected without review.
        </p>

        <h3 className={subTitle}>5.1 General Format</h3>
        <ul className={list}>
          <li>
            <strong>Template:</strong> Authors must use the official RMHSTRC
            2026 LaTeX template (<span className={code}>rmhstrc2026.cls</span>),
            available on the conference website. Microsoft Word submissions are
            not accepted.
          </li>
          <li>
            <strong>Page size:</strong> US Letter (8.5 &times; 11 in /
            215.9 &times; 279.4 mm).
          </li>
          <li>
            <strong>Margins:</strong> 1 inch (25.4 mm) on all sides.
          </li>
          <li>
            <strong>Font:</strong> 10 pt Times New Roman (or equivalent
            serif) for body text. Section headings in 12 pt bold.
            Mathematics set in Computer Modern or Latin Modern.
          </li>
          <li>
            <strong>Columns:</strong> Two-column format with 0.25 in
            (6.35 mm) column separation.
          </li>
          <li>
            <strong>Line spacing:</strong> Single-spaced body text.
          </li>
          <li>
            <strong>Page numbers:</strong> Omitted in the submission
            version; added automatically in camera-ready.
          </li>
        </ul>

        <h3 className={subTitle}>5.2 Title and Author Block</h3>
        <ul className={list}>
          <li>
            The title must be centered, set in 14 pt bold, and should not
            exceed two lines.
          </li>
          <li>
            Author names and affiliations must be <strong>omitted</strong> in
            the review version to maintain double-blind integrity. Replace
            with &ldquo;Anonymous Author(s)&rdquo;.
          </li>
          <li>
            The camera-ready version must include all author names,
            institutional affiliations, and corresponding-author email
            addresses.
          </li>
        </ul>

        <h3 className={subTitle}>5.3 Abstract and Keywords</h3>
        <ul className={list}>
          <li>
            Every submission must include a structured abstract of no more
            than 300 words. The abstract should clearly state the problem,
            methodology, principal results, and significance.
          </li>
          <li>
            Provide 5 &ndash; 8 keywords, separated by semicolons, immediately
            below the abstract.
          </li>
        </ul>

        <h3 className={subTitle}>5.4 Mathematical Typesetting</h3>
        <p className={prose}>
          Given the highly technical nature of RMHSTRC, rigorous mathematical
          presentation is essential:
        </p>
        <ul className={list}>
          <li>
            All equations must be numbered sequentially using the
            <span className={code}>\equation</span> or
            <span className={code}>\align</span> environments. Inline
            mathematics should use <span className={code}>$...$</span> delimiters.
          </li>
          <li>
            Definitions, theorems, lemmas, propositions, and corollaries
            must use the <span className={code}>\newtheorem</span> environments
            provided by the template and be numbered within sections
            (e.g., Theorem 3.2).
          </li>
          <li>
            Proofs should begin with <span className={code}>\begin&#123;proof&#125;</span>
            and end with a QED symbol (<span className={code}>\qedsymbol</span>).
          </li>
          <li>
            Notation must be consistent throughout the manuscript. Authors
            are encouraged to include a notation table in an appendix if the
            symbol set is extensive.
          </li>
        </ul>

        <h3 className={subTitle}>5.5 Figures, Tables, and Algorithms</h3>
        <ul className={list}>
          <li>
            Figures must be vector graphics (PDF, EPS) or high-resolution
            raster images (at least 300 DPI). Screen captures and JPEG
            artifacts are grounds for desk rejection.
          </li>
          <li>
            All figures and tables must be referenced in the text and
            captioned descriptively. Captions appear below figures and above
            tables.
          </li>
          <li>
            Algorithms should be typeset using the
            <span className={code}>algorithm2e</span> or
            <span className={code}>algorithmicx</span> package with clear
            input/output specifications.
          </li>
          <li>
            Color figures are permitted but must remain legible when
            printed in grayscale.
          </li>
        </ul>

        <h3 className={subTitle}>5.6 Citations and References</h3>
        <ul className={list}>
          <li>
            Use the <span className={code}>natbib</span> package with the
            author-year citation style
            (<span className={code}>\citep</span>, <span className={code}>\citet</span>).
          </li>
          <li>
            The bibliography must be generated with BibTeX using the
            provided <span className={code}>rmhstrc2026.bst</span> style file.
          </li>
          <li>
            All references must be complete: include authors, title, venue or
            journal, year, volume, pages, and DOI or URL where available.
          </li>
          <li>
            Self-citations should not exceed 15% of total references and must
            be anonymized in the review version.
          </li>
        </ul>

        <h3 className={subTitle}>5.7 Supplementary Material</h3>
        <ul className={list}>
          <li>
            Authors may attach supplementary material (proofs, code,
            datasets, extended results) as a separate PDF or ZIP archive.
          </li>
          <li>
            Supplementary material is provided for reviewer convenience and
            <strong> must not</strong> be required to understand the core
            contribution. The main paper must be self-contained.
          </li>
          <li>
            Code submissions should include a README with reproduction
            instructions. Anonymize repository URLs during review.
          </li>
        </ul>

        {/* -------------------------------------------------------------- */}
        {/*  6. Submission Instructions                                     */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>6. Submission Instructions</h2>

        <h3 className={subTitle}>6.1 File Format</h3>
        <p className={prose}>
          Submit a single PDF compiled from the official LaTeX template. The
          PDF must embed all fonts and must not exceed 20 MB for the main
          manuscript. Supplementary archives must not exceed 100 MB.
        </p>

        <h3 className={subTitle}>6.2 Submission Method</h3>
        <p className={prose}>
          All submissions must be sent via email to:
        </p>
        <p className="text-center text-lg font-bold text-(--site-accent) mb-4">
          <a href="mailto:research@rmhstudios.com" className="hover:underline">
            research@rmhstudios.com
          </a>
        </p>
        <p className={prose}>
          Use the following email subject-line format:
        </p>
        <p className="mb-4 ml-4">
          <span className={code}>[RMHSTRC-2026] [Full | Short | Abstract] &lt;Paper Title&gt;</span>
        </p>
        <p className={prose}>
          Attach the PDF manuscript and any supplementary archives directly to
          the email. You will receive an automated acknowledgement within 24
          hours confirming receipt. If you do not receive confirmation, contact
          the Program Chair at the same address.
        </p>

        <h3 className={subTitle}>6.3 Double-Blind Policy</h3>
        <p className={prose}>
          RMHSTRC employs a strict double-blind review process. Authors must
          take care to anonymize their submissions:
        </p>
        <ul className={list}>
          <li>Remove all author names, affiliations, and acknowledgements.</li>
          <li>
            Replace self-references with &ldquo;[Anonymous]&rdquo; or refer to
            prior work in the third person.
          </li>
          <li>
            Do not include links to non-anonymized code repositories or
            personal websites.
          </li>
          <li>
            Redact funding agency names or grant numbers that could identify
            the authors.
          </li>
        </ul>

        {/* -------------------------------------------------------------- */}
        {/*  7. Review Process                                              */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>7. Review Process and Criteria</h2>
        <p className={prose}>
          Each full paper is assigned to at least three Program Committee
          members with relevant expertise. Short papers receive at least two
          reviews. Reviewers evaluate submissions on the following criteria,
          each scored 1 (lowest) to 10 (highest):
        </p>
        <ol className={orderedList}>
          <li>
            <strong>Technical Soundness:</strong> Correctness of theoretical
            claims, proofs, and experimental methodology.
          </li>
          <li>
            <strong>Novelty and Originality:</strong> Degree to which the work
            advances beyond the current state of the art.
          </li>
          <li>
            <strong>Significance:</strong> Potential impact on the field and
            relevance to the RMHSTRC community.
          </li>
          <li>
            <strong>Clarity and Presentation:</strong> Quality of writing,
            organization, and figure/table presentation.
          </li>
          <li>
            <strong>Reproducibility:</strong> Availability of sufficient detail,
            data, and/or code to reproduce the reported results.
          </li>
          <li>
            <strong>Related Work:</strong> Thoroughness and accuracy of the
            literature survey.
          </li>
        </ol>
        <p className={prose}>
          After the initial review round, authors of borderline papers will be
          invited to submit a rebuttal (max 1 page) addressing reviewer
          concerns. Final decisions are made by the Program Committee during
          a calibration meeting, taking into account reviewer scores, the
          rebuttal, and discussion among reviewers.
        </p>

        {/* -------------------------------------------------------------- */}
        {/*  8. Ethics and Dual-Use                                         */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>8. Ethical Guidelines and Dual-Use Policy</h2>
        <p className={prose}>
          All research involving human subjects must have been approved by an
          Institutional Review Board (IRB) or equivalent ethics committee
          prior to submission. The approval reference number must be stated
          in the camera-ready manuscript.
        </p>
        <p className={prose}>
          Authors must disclose any potential conflicts of interest, sources
          of funding, and use of generative AI tools in the preparation of
          the manuscript. RMHSTRC reserves the right to reject or withdraw
          papers found to violate ethical standards or to present work with
          clear and unmitigated dual-use risks.
        </p>

        {/* -------------------------------------------------------------- */}
        {/*  9. Camera-Ready and Presentation                               */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>9. Camera-Ready Preparation and Presentation</h2>
        <p className={prose}>
          Accepted papers must incorporate all required revisions identified
          during the review process. Camera-ready manuscripts are due by
          <strong> June 7, 2026</strong> and must include:
        </p>
        <ul className={list}>
          <li>De-anonymized author block with full names, affiliations, and ORCID identifiers.</li>
          <li>A completed copyright-transfer form (provided upon acceptance).</li>
          <li>Final PDF compiled from the RMHSTRC 2026 template with embedded fonts.</li>
          <li>LaTeX source archive for archival typesetting.</li>
        </ul>
        <p className={prose}>
          At least one author of each accepted paper must register for the
          conference and present the work in person. Failure to present will
          result in withdrawal from the proceedings.
        </p>

        {/* -------------------------------------------------------------- */}
        {/*  10. Contact                                                    */}
        {/* -------------------------------------------------------------- */}
        <h2 className={sectionTitle}>10. Contact Information</h2>
        <p className={prose}>
          For questions regarding the call for papers, formatting, or the
          submission process, please contact the Program Chair:
        </p>
        <p className="mb-2 text-(--site-text)">
          <strong>Email:</strong>{' '}
          <a href="mailto:research@rmhstudios.com" className="text-(--site-accent) hover:underline">
            research@rmhstudios.com
          </a>
        </p>
        <p className="mb-2 text-(--site-text)">
          <strong>Conference website:</strong>{' '}
          <Link href="/research" className="text-(--site-accent) hover:underline">
            rmhstudios.com/research
          </Link>
        </p>

        <div className="mt-12 mb-8 border-t border-(--site-border) pt-8 text-center">
          <p className="text-sm text-(--site-text-muted)">
            We look forward to your contributions and to an intellectually
            stimulating program at RMHSTRC 2026.
          </p>
        </div>
      </article>
    </main>
  );
}
