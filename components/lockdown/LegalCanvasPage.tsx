/**
 * Canvas version of the legal-page layout (Terms/Privacy/Cookies/Copyright/
 * Security). One structured content model drives BOTH renderings:
 *   - LegalScene: the Konva scene (visual parity with lockdown.css's fixed
 *     Apple-dark palette — legal pages never followed the site themes);
 *   - LegalMirror: the semantic DOM mirror (SSR for crawlers, live for AT),
 *     matching the old LegalLayout element-for-element.
 *
 * Routes build `blocks` with t() in the DOM tree, so locale changes flow
 * through scene props automatically.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CanvasPage } from "@/canvas-ui/runtime/CanvasPage";
import { Box } from "@/canvas-ui/runtime/layout/LayoutTree";
import { tw } from "@/canvas-ui/runtime/tw";
import { CanvasText } from "@/canvas-ui/text/Text";
import { RichText, type TextRun } from "@/canvas-ui/text/RichText";
import { ScrollView } from "@/canvas-ui/widgets/ScrollView";
import { CanvasLink } from "@/canvas-ui/widgets/Link";
import { Icon, type IconNode } from "@/canvas-ui/widgets/Icon";

/** lucide chevron-left */
const CHEVRON_LEFT: IconNode = [["path", { d: "m15 18-6-6 6-6" }]];

// Fixed legal-page palette (lockdown.css) — intentionally theme-independent.
// NOTE: color values used inside tw() arbitrary classes must be space-free
// (class strings split on whitespace, same rule as real Tailwind).
const LEGAL = {
  bg: "#000000",
  navBg: "rgba(0,0,0,0.82)",
  hairline: "rgba(255,255,255,0.10)",
  title: "#f5f5f7",
  body: "#a1a1a6",
  strong: "rgba(245,245,247,0.88)",
  link: "rgba(245,245,247,0.75)",
  dim: "#6e6e73",
  faint: "#515154",
  sep: "#3a3a3c",
  navTitle: "rgba(245,245,247,0.65)",
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
};

export type LegalBlock =
  | { kind: "h2"; text: string }
  | { kind: "p"; runs: TextRun[] }
  | { kind: "ul"; items: TextRun[][] };

export const LEGAL_LINKS = [
  { href: "/terms", key: "terms-of-use", defaultLabel: "Terms of Use" },
  { href: "/privacy", key: "privacy-policy", defaultLabel: "Privacy Policy" },
  { href: "/cookies", key: "cookie-policy", defaultLabel: "Cookie Policy" },
  { href: "/copyright", key: "copyright", defaultLabel: "Copyright" },
  { href: "/security", key: "security", defaultLabel: "Security" },
];

interface LegalSceneProps extends Record<string, unknown> {
  title: string;
  eyebrow: string;
  updatedLine: string;
  backLabel: string;
  blocks: LegalBlock[];
  footerLinks: Array<{ href: string; label: string }>;
}

const bodyTypo = {
  fontSize: 16,
  lineHeight: 27,
  fontFamily: LEGAL.font,
  color: LEGAL.body,
  boldColor: LEGAL.strong,
  boldWeight: 500,
  linkColor: LEGAL.link,
};

function LegalScene({ title, eyebrow, updatedLine, backLabel, blocks, footerLinks }: LegalSceneProps) {
  return (
    <Box name="legal-page" style={tw("flex flex-col w-full h-full bg-[#000000]")}>
      {/* Sticky top nav — 52px hairline bar. */}
      <Box
        name="legal-nav"
        style={tw(`flex flex-row items-center gap-4 h-[52px] w-full px-8 bg-[${LEGAL.navBg}]`)}
      >
        <CanvasLink
          to="/"
          label={backLabel}
          style={tw("flex flex-row items-center gap-1.5")}
          name="legal-back"
        >
          <Icon node={CHEVRON_LEFT} size={14} color={LEGAL.dim} strokeWidth={2.2} />
          <CanvasText style="text-sm font-medium text-[#6e6e73]">RMHStudios</CanvasText>
        </CanvasLink>
        <CanvasText style={`text-sm text-[${LEGAL.sep}]`}>/</CanvasText>
        <CanvasText style={`text-sm font-medium text-[${LEGAL.navTitle}]`}>{title}</CanvasText>
      </Box>
      {/* Nav bottom hairline (per-side borders draw as 1px boxes on canvas). */}
      <Box name="legal-nav-hairline" style={tw(`w-full h-px bg-[${LEGAL.hairline}]`)} />

      <ScrollView
        name="legal-scroll"
        style={tw("flex flex-col flex-1 w-full overflow-hidden")}
        contentStyle={tw("flex flex-col w-full items-center")}
      >
        <Box name="legal-content" style={tw("flex flex-col w-full max-w-[740px] px-8 pt-16 pb-24")}>
          <CanvasText name="legal-eyebrow" style={`text-xs font-semibold uppercase tracking-widest text-[${LEGAL.dim}]`}>
            {eyebrow}
          </CanvasText>
          <Box style={tw("h-4")} />
          <CanvasText name="legal-title" style={`text-5xl font-bold tracking-tight text-[${LEGAL.title}]`}>
            {title}
          </CanvasText>
          <Box style={tw("h-3")} />
          <CanvasText name="legal-date" style={`text-sm text-[${LEGAL.faint}]`}>{updatedLine}</CanvasText>
          <Box style={tw("h-12")} />

          {blocks.map((block, i) => {
            if (block.kind === "h2") {
              return (
                <Box key={i} style={tw(`flex flex-col w-full ${i === 0 ? "" : "mt-10"} mb-3`)}>
                  <CanvasText style={`text-xl font-semibold text-[${LEGAL.title}]`}>{block.text}</CanvasText>
                </Box>
              );
            }
            if (block.kind === "p") {
              return (
                <Box key={i} style={tw("flex flex-col w-full mb-4")}>
                  <RichText runs={block.runs} typography={bodyTypo} />
                </Box>
              );
            }
            return (
              <Box key={i} style={tw("flex flex-col w-full mb-4 gap-2 pl-2")}>
                {block.items.map((runs, j) => (
                  <Box key={j} style={tw("flex flex-row w-full gap-3 items-start")}>
                    <CanvasText style={`text-base text-[${LEGAL.body}]`}>•</CanvasText>
                    <Box style={tw("flex flex-col flex-1 min-w-0")}>
                      <RichText runs={runs} typography={bodyTypo} />
                    </Box>
                  </Box>
                ))}
              </Box>
            );
          })}

          {/* Footer — centered legal links + copyright. */}
          <Box name="legal-footer-hairline" style={tw(`w-full h-px mt-16 bg-[${LEGAL.hairline}]`)} />
          <Box
            name="legal-footer"
            style={tw("flex flex-row flex-wrap justify-center items-center gap-8 w-full pt-7")}
          >
            {footerLinks.map((l) => (
              <CanvasLink key={l.href} to={l.href} textStyle={`text-xs font-medium text-[${LEGAL.faint}]`}>
                {l.label}
              </CanvasLink>
            ))}
            <CanvasText style={`text-xs font-medium text-[${LEGAL.faint}]`}>
              {`© ${new Date().getFullYear()} RMHStudios`}
            </CanvasText>
          </Box>
        </Box>
      </ScrollView>
    </Box>
  );
}

/** Semantic DOM mirror — matches the retired LegalLayout element-for-element. */
function LegalMirror({ title, eyebrow, updatedLine, backLabel, blocks, footerLinks }: LegalSceneProps) {
  return (
    <div>
      <nav aria-label="Legal navigation">
        <a href="/" aria-label={backLabel}>
          RMHStudios
        </a>
        <span>{title}</span>
      </nav>
      <main>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <p>{updatedLine}</p>
        <div>
          {blocks.map((block, i) => {
            if (block.kind === "h2") return <h2 key={i}>{block.text}</h2>;
            if (block.kind === "p") return <p key={i}>{block.runs.map((r, j) => renderRun(r, j))}</p>;
            return (
              <ul key={i}>
                {block.items.map((runs, j) => (
                  <li key={j}>{runs.map((r, k) => renderRun(r, k))}</li>
                ))}
              </ul>
            );
          })}
        </div>
      </main>
      <footer role="contentinfo">
        {footerLinks.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
        <span>© {new Date().getFullYear()} RMHStudios</span>
      </footer>
    </div>
  );
}

function renderRun(run: TextRun, key: number) {
  if (run.href) {
    return (
      <a key={key} href={run.href}>
        {run.text}
      </a>
    );
  }
  if (run.bold) return <strong key={key}>{run.text}</strong>;
  return <span key={key}>{run.text}</span>;
}

export function LegalCanvasPage({
  routeId,
  title,
  eyebrow,
  updatedDate,
  blocks,
}: {
  routeId: string;
  title: string;
  eyebrow: string;
  updatedDate: string;
  blocks: LegalBlock[];
}) {
  const { t } = useTranslation("c-lockdown");
  const sceneProps: LegalSceneProps = useMemo(
    () => ({
      title,
      eyebrow,
      updatedLine: t("last-updated", { defaultValue: "Last updated: {{date}}", date: updatedDate }),
      backLabel: t("back-to-rmhstudios", { defaultValue: "Back to RMHStudios" }),
      blocks,
      footerLinks: LEGAL_LINKS.map((l) => ({ href: l.href, label: t(l.key, { defaultValue: l.defaultLabel }) })),
    }),
    [t, title, eyebrow, updatedDate, blocks]
  );

  return (
    <CanvasPage
      routeId={routeId}
      scene={LegalScene}
      sceneProps={sceneProps}
      mirror={<LegalMirror {...sceneProps} />}
      shell="fullscreen"
      title={title}
    />
  );
}
