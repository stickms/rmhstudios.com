import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowIcon, PageHead, Plate, type PlateKind } from './shared';

type BizProps = {
  id: string;
  ordinal: string;
  stage: string;
  name: string;
  alias?: string;
  desc: string;
  caps: string[];
  plate: PlateKind;
  wide: boolean;
  last?: boolean;
};

function Biz({ id, ordinal, stage, name, alias, desc, caps, plate, wide, last }: BizProps) {
  return (
    <section className="sec sec--tight" id={id}>
      <div className="wrap">
        <div className="offset">
          <div className="o-lead biz-lead rv stack">
            <p className="meta">
              {ordinal} / 06 · {stage}
            </p>
            <h2 className="h2">{name}</h2>
            {alias ? <p className="trio-alias">{alias}</p> : null}
          </div>
          <div className="o-wide rv d1">
            <p className="body ink">{desc}</p>
            <div className="rows biz-caps">
              {caps.map((cap) => (
                <div className="row" key={cap}>
                  <p className="row-title">{cap}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={wide ? 'o-full' : 'o-wide'}>
            <div className="rv-wipe">
              <Plate kind={plate} className={wide ? 'plate--wide' : ''} />
            </div>
          </div>
        </div>
        {last ? null : <hr className="rule rv-rule biz-end" />}
      </div>
    </section>
  );
}

export default function BusinessesPage() {
  const { t } = useTranslation('c-rmh-capital');

  return (
    <>
      <PageHead
        title={t('businesses-headline', {
          defaultValue: 'Six businesses. One continuous relationship.',
        })}
        lede={t('businesses-lede-businesses-page', {
          defaultValue:
            'Each business leads in its discipline. Together, they let a client raise, grow, advise, transact, and own — every step ordered along the arc a company travels, from first round to public markets and beyond.',
        })}
      />

      <Biz
        id="investment-banking"
        ordinal="01"
        stage={t('ib-stage', { defaultValue: 'Advise & raise' })}
        name="Investment Banking"
        alias="RMHan Stanley"
        desc={t('ib-desc', {
          defaultValue:
            'We advise companies on the decisions that define them — mergers and acquisitions, public offerings, and complex financings. Sector teams pair deep industry knowledge with the full reach of the platform, so a single mandate can draw on markets, lending, and capital across the firm.',
        })}
        caps={[
          t('ib-cap-1', { defaultValue: 'Mergers & acquisitions' }),
          t('ib-cap-2', { defaultValue: 'Equity capital markets' }),
          t('ib-cap-3', { defaultValue: 'Debt capital markets' }),
          t('ib-cap-4', { defaultValue: 'Leveraged finance' }),
          t('ib-cap-5', { defaultValue: 'Industry coverage' }),
        ]}
        plate="colonnade"
        wide
      />

      <Biz
        id="markets"
        ordinal="02"
        stage={t('markets-stage', { defaultValue: 'Execute & access' })}
        name="Markets"
        alias="RMH Street"
        desc={t('markets-desc', {
          defaultValue:
            'Our markets business connects institutional clients to liquidity across equities, credit, and rates. Sales, trading, and research work as one team, delivering execution, market intelligence, and a clear read on conditions — built to serve the mid-market clients larger banks overlook.',
        })}
        caps={[
          t('markets-cap-1', { defaultValue: 'Equities' }),
          t('markets-cap-2', { defaultValue: 'Credit & rates' }),
          t('markets-cap-3', { defaultValue: 'Electronic execution' }),
          t('markets-cap-4', { defaultValue: 'Research' }),
          t('markets-cap-5', { defaultValue: 'Market-making' }),
        ]}
        plate="louvres"
        wide={false}
      />

      <Biz
        id="corporate-banking"
        ordinal="03"
        stage={t('corp-stage', { defaultValue: 'Fund & grow' })}
        name="Corporate Banking"
        desc={t('corp-desc', {
          defaultValue:
            'As companies scale, they need credit that scales with them. We provide revolving facilities, term loans, and structured lending alongside treasury and cash-management solutions — a banking relationship designed to grow into capital markets and advisory as the company matures.',
        })}
        caps={[
          t('corp-cap-1', { defaultValue: 'Revolving credit' }),
          t('corp-cap-2', { defaultValue: 'Term lending' }),
          t('corp-cap-3', { defaultValue: 'Structured finance' }),
          t('corp-cap-4', { defaultValue: 'Treasury services' }),
          t('corp-cap-5', { defaultValue: 'Relationship banking' }),
        ]}
        plate="ingot"
        wide
      />

      <Biz
        id="venture-capital"
        ordinal="04"
        stage={t('vc-stage', { defaultValue: 'Back & build' })}
        name="Venture Capital"
        alias="RMHCombinator"
        desc={t('vc-desc', {
          defaultValue:
            'We meet founders at the very beginning. Through an accelerator, an early-stage fund, and a venture studio, we provide first capital, hands-on support, and a network — the start of a relationship that can carry a company all the way to the public markets, with the whole firm behind it.',
        })}
        caps={[
          t('vc-cap-1', { defaultValue: 'Accelerator' }),
          t('vc-cap-2', { defaultValue: 'Seed & early-stage fund' }),
          t('vc-cap-3', { defaultValue: 'Venture studio' }),
          t('vc-cap-4', { defaultValue: 'Founder services' }),
        ]}
        plate="disc"
        wide={false}
      />

      <Biz
        id="management-consulting"
        ordinal="05"
        stage={t('consulting-stage', { defaultValue: 'Strategize & transform' })}
        name="Management Consulting"
        alias="RMHcKinsey"
        desc={t('consulting-desc', {
          defaultValue:
            "Strategy and execution advisory, delivered with the firm's capital and markets reach at hand. Our consultants work on the questions that change a company's trajectory — strategy, operations, organization, and digital transformation — and stay accountable for results, not slideware.",
        })}
        caps={[
          t('consulting-cap-1', { defaultValue: 'Corporate strategy' }),
          t('consulting-cap-2', { defaultValue: 'Operations' }),
          t('consulting-cap-3', { defaultValue: 'Organization design' }),
          t('consulting-cap-4', { defaultValue: 'Digital transformation' }),
        ]}
        plate="orb"
        wide
      />

      <Biz
        id="private-equity"
        ordinal="06"
        stage={t('pe-stage', { defaultValue: 'Own & compound' })}
        name="Private Equity"
        alias="RMHstone"
        desc={t('pe-desc', {
          defaultValue:
            'At the far end of the arc, we invest our own conviction. Through growth-equity and impact-housing strategies, RMH Capital takes ownership positions alongside the companies and communities we know best — closing the loop between advising a client and building value with them.',
        })}
        caps={[
          t('pe-cap-1', { defaultValue: 'Growth equity' }),
          t('pe-cap-2', { defaultValue: 'Impact housing' }),
          t('pe-cap-3', { defaultValue: 'Co-investment' }),
          t('pe-cap-4', { defaultValue: 'Long-term ownership' }),
        ]}
        plate="colonnade"
        wide={false}
        last
      />

      <section className="sec">
        <div className="wrap">
          <hr className="rule rv-rule" />
          <div className="offset">
            <div className="o-head rv">
              <h2 className="h2">
                {t('cta-headline', { defaultValue: 'The advantage is in the connections.' })}
              </h2>
            </div>
            <div className="o-body rv d1 stack">
              <p className="body">
                {t('cta-desc', {
                  defaultValue:
                    'A founder we back through venture can become a banking client, an advisory client, and a co-investment partner over a decade. Talk to us about where you are on the arc.',
                })}
              </p>
              <div className="actions">
                <Link className="cta cta--solid" to="/rmh-capital/contact">
                  {t('cta-link-businesses-page', { defaultValue: 'Start a conversation' })}{' '}
                  <ArrowIcon />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
