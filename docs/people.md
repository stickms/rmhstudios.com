# People — the RMH Capital C-suite

> Audience: humans **and** coding agents. This is the leadership of **RMH
> Capital**, the firm at [`/rmh-capital`](../components/rmh-capital/) — its
> executive committee, the six business heads, and the rules for writing them.
> These are the only named people the platform maintains centrally; characters
> inside individual games are defined by their own data modules
> (`lib/<game>/characters.ts` and friends).

**These people are fiction.** RMH Capital is an in-universe firm on a personal
web platform. Nobody here is real, no name is drawn from a living executive, and
no page may present them as real: no photographs of actual people, no
biographies borrowed from anyone, no claim that a real person holds one of these
seats. See §4 before writing a word of their copy.

**Why they exist.** The firm's own pages set out a leadership philosophy —
"decisions close to the client, accountability across the firm", leaders
evaluated on performance, client relationships and compliance record in equal
measure — and until now had nobody to hold it. This file gives the philosophy
faces so that copy across the firm's six businesses stays consistent about who
decides what.

---

## 1. The Executive Committee

Ten officers. The Chair & CEO leads the committee; the other nine own a
firm-wide function that crosses all six businesses.

| Name                   | Title                                     | Remit                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adaeze Okpara**      | **Chair & Chief Executive Officer**       | The platform thesis itself — that one firm following a client across the full arc beats a federation of product lines. Chairs the Executive Committee; the six business heads report to her. |
| **Tomas Lindqvist**    | **President & Chief Operating Officer**   | Runs the firm day to day: operations, the operating plan, and the seams between businesses. The person who makes "one firm" work as a schedule rather than a value.                          |
| **Miriam Castellanos** | **Chief Financial Officer**               | Capital, liquidity, financial controls, and the firm's own balance sheet. Co-owns the compensation framework with the CPO.                                                                   |
| **Hana Iwasaki**       | **Chief Risk Officer**                    | The unified risk framework across advisory, markets, lending and investing. Owns the second of the three structural connectors (§3).                                                         |
| **Yusuf Barakat**      | **Chief Client Officer**                  | The single client record and the coverage model built on it — the first structural connector. Answers for whether the firm actually shows up as one relationship.                            |
| **Priya Bhattacharya** | **General Counsel & Chief Legal Officer** | Legal, corporate governance, and the ethics walls between businesses.                                                                                                                        |
| **Nadia Haddad**       | **Chief Compliance Officer**              | Regulatory compliance, surveillance, and the conflicts regime. Independent of the businesses by design (§3).                                                                                 |
| **Samuel Mwangi**      | **Chief Technology Officer**              | The client-record platform, execution and risk systems, data infrastructure, cyber.                                                                                                          |
| **Giulia Marchetti**   | **Chief Strategy Officer**                | Where the platform expands next: new businesses, geographies, and the case for each. Owns the firm's stated markets — Americas, Europe, Asia.                                                |
| **Farid Rahimi**       | **Chief People Officer**                  | Hiring, development, and the incentive design that rewards bringing the whole platform to a client instead of guarding territory — the third structural connector.                           |

## 2. The six business heads

Each leads one of the firm's six businesses and reports to the CEO. Per the
firm's leadership philosophy they carry **full ownership of their results with
the autonomy to compete**, exercised inside firm-wide risk and financial
controls — "independence never becomes isolation".

| Name                 | Title                               | Business                                     | Stage in the client arc |
| -------------------- | ----------------------------------- | -------------------------------------------- | ----------------------- |
| **Beatriz Quintero** | **Head of Investment Banking**      | Investment Banking — _RMHan Stanley_ (01/06) | Advise & raise          |
| **Daniel Halvorsen** | **Head of Markets**                 | Markets — _RMH Street_ (02/06)               | Execute & access        |
| **Ingrid Bergström** | **Head of Corporate Banking**       | Corporate Banking (03/06)                    | Fund & grow             |
| **Chidi Nwosu**      | **Managing Partner, RMHCombinator** | Venture Capital — _RMHCombinator_ (04/06)    | Back & build            |
| **Anouk Achterberg** | **Managing Partner, RMHcKinsey**    | Management Consulting — _RMHcKinsey_ (05/06) | Strategize & transform  |
| **Marco Sandoval**   | **Managing Partner, RMHstone**      | Private Equity — _RMHstone_ (06/06)          | Own & compound          |

The venture, consulting and private-equity leaders carry **Managing Partner**
rather than Head — those three businesses are partnerships in the firm's
telling, and the title difference is deliberate. Don't normalise it.

**Regional leadership is deliberately unnamed.** The firm lists a global
headquarters plus EMEA and APAC offices; no regional CEO exists yet. Leave that
seat open rather than filling it in passing — it is the kind of detail that
wants a decision, not an improvisation.

## 3. Governance — who answers to whom

Three things about this structure are load-bearing, because the firm's own
copy already promises them:

1. **The control functions are independent.** Risk (Iwasaki), Legal
   (Bhattacharya) and Compliance (Haddad) report to the CEO **and** carry a
   direct line to the Board's Audit & Risk Committee. A business head cannot
   overrule them. This is what "a unified risk and compliance framework runs
   across every business" and "ethics walls are non-negotiable" mean in
   practice, and copy must never show a revenue leader winning an argument
   against a control function.
2. **The three structural connectors have named owners.** The firm claims
   integration is "engineered, not hoped for" and rests it on three connectors
   — so each has someone accountable: _one client record_ → Barakat (CCO);
   _one risk framework_ → Iwasaki (CRO); _one incentive_ → Rahimi (CPO), with
   Castellanos (CFO) on the compensation mechanics.
3. **Everyone is measured on the same triad.** Performance against plan, the
   strength of client relationships, and an unblemished compliance record —
   in equal measure. "Get one without the others, and you have not done the
   job." That line is the firm's, and it applies to the Executive Committee as
   much as to the businesses.

## 4. Writing these people

- **Never present them as real.** No stock headshots implying a real person, no
  borrowed biography, no LinkedIn-shaped detail that invites verification. If a
  page needs a face, use the firm's existing abstract gold-line SVG treatment.
- **No advice in their mouths.** The firm's contact page already disclaims
  material non-public information; an executive quoted forecasting a market, a
  rate or a return turns set dressing into something that reads as financial
  advice. Keep quotes about the firm's philosophy and its clients.
- **Titles exactly as written here**, including "Chair & Chief Executive
  Officer" (not "CEO & Chairman") and the Managing Partner distinction in §2.
- **Every string through `t()`** with a `defaultValue`, in the
  `c-rmh-capital` namespace, like the rest of the firm's pages. Names included —
  transliteration matters in the 16 shipped locales.
- **Voice:** the firm speaks in short declaratives and avoids superlatives
  ("A firm built around the client, not the product"). Its people should sound
  the same — considered, unshowy, faintly severe. Nobody at RMH Capital is
  excited.
- **RMH PMC stays unnamed.** The other in-universe organisation lists role
  archetypes and no individuals, and that remains deliberate — a named
  commander for a private military contractor is a different kind of claim than
  a named banker. Don't mirror this file over there.

## 5. Adding or changing someone

1. **`grep` the name across `lib/`, `components/` and `data/` first.** The
   platform is one universe to a reader, and the games already collide with each
   other — `Vesper` is both a casino hostess in House Always Wins and a
   Breakpoint agent. Don't make an executive the third.
2. Give them a **remit**, not just a title. Every row above answers "what would
   this person be accountable for when something goes wrong?"
3. Update this file and the firm's pages in the same commit, so the roster and
   the rendered site never disagree about who holds a seat.
