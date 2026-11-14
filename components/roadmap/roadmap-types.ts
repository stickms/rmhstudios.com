export type Milestone =
  {
    title: string;
    body: string;
  };

export type YearSection =
  {
    year: string;
    tagline: string;
    milestones: Milestone[];
  };
