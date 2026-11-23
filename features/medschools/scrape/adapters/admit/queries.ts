/**
 * GraphQL documents for the Admit.org connector. Each mirrors the operation the Admit web client (med.admit.org)
 * sends, captured 2026-11-20, but selects ONLY the fields the adapter uses: never a display name, avatar, reaction or
 * the caller's vote. `$limit`/`$offset` are `Int!` on the interview overview and `Float!` on `getAllCycleResults`.
 */
export interface AdmitOperation {
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
}

/** Slug the web client sends to mean "every school" on the feed. */
export const ALL_SCHOOLS_SLUG = 'allSchools';

export const RECENT_UPDATES: AdmitOperation = {
  operationName: 'getRecentSchoolCycleUpdates',
  query: `query getRecentSchoolCycleUpdates($filterOwnSchools: Boolean!, $slug: String!) {
  getRecentSchoolCycleUpdates(filterOwnSchools: $filterOwnSchools, slug: $slug) {
    cycle_update_id
    school {
      slug
    }
    user_id
    current_status
    current_status_date
  }
}`,
  variables: { filterOwnSchools: false, slug: ALL_SCHOOLS_SLUG },
};

/**
 * One profile lookup answers two questions: the MD/PhD flag (spec 4a) and the applicant's dated history, which reaches
 * back to their cycle start. It selects md_phd and the history entries' school slug and four dates/decision, never a
 * display name, avatar, GPA, MCAT, user id or any other profile field. The history is read only to be turned into
 * anonymous events keyed by member inside the adapter.
 */
export const PROFILE_FLAG: AdmitOperation = {
  operationName: 'getCycleTrackProfileByUserId',
  query: `query getCycleTrackProfileByUserId($userId: String!) {
  getCycleTrackProfileByUserId(userId: $userId) {
    md_phd
    history {
      school {
        slug
      }
      secondary_submitted
      interview_received
      decision_date
      decision
    }
  }
}`,
};

/**
 * Member discovery for the history backfill: the user id of each row of `getAllCycleResults`, one status at a time
 * (a status filter returns the latest update of that status per school). Nothing else is selected. `$limit`/`$offset`
 * are `Float!`, `limit` at most 100.
 */
export const RESULT_USERS: AdmitOperation = {
  operationName: 'getAllCycleResults',
  query: `query getAllCycleResults($status: [ApplicationTrackerStatusEnum!], $filterOwnSchools: Boolean!, $limit: Float!, $offset: Float!) {
  getAllCycleResults(status: $status, filterOwnSchools: $filterOwnSchools, limit: $limit, offset: $offset) {
    user_id
  }
}`,
  variables: { filterOwnSchools: false, limit: 100, offset: 0 },
};

/** The status filters the discovery walks, one request series each. */
export const RESULT_STATUSES = ['INTERVIEW', 'ACCEPTED', 'WITHDRAWN', 'REJECTED', 'WAITLISTED', 'HOLD'] as const;

export const INTERVIEW_SCHOOLS: AdmitOperation = {
  operationName: 'GetMedicalInterviewSchoolsOverview',
  query: `query GetMedicalInterviewSchoolsOverview($filterOwnSchools: Boolean!, $limit: Int!, $offset: Int!, $sortColumn: MedicalInterviewSchoolsSortBy!, $sortOrder: String!) {
  getMedicalInterviewSchoolsOverview(filterOwnSchools: $filterOwnSchools, limit: $limit, offset: $offset, sortColumn: $sortColumn, sortOrder: $sortOrder) {
    totalCount
    schools {
      avg_interview_difficulty
      interview_count
      total_interview_count
      school {
        slug
        name
        shorthand_name
        city
        state
      }
    }
  }
}`,
  variables: { filterOwnSchools: false, limit: 100, offset: 0, sortColumn: 'SCHOOL_RANK', sortOrder: 'ASC' },
};

export const INTERVIEW_OVERVIEW: AdmitOperation = {
  operationName: 'GetMedicalInterviewOverview',
  query: `query GetMedicalInterviewOverview($schoolSlug: String!) {
  getMedicalInterviewOverview(schoolSlug: $schoolSlug) {
    avg_interview_difficulty
    interview_count
    interview_format
    interview_type
    most_common_interview_sessions
    total_interview_count
  }
}`,
};

export const INTERVIEW_QUESTIONS: AdmitOperation = {
  operationName: 'GetInterviewsForSchool',
  query: `query GetInterviewsForSchool($schoolSlug: String!) {
  getInterviewsForSchool(schoolSlug: $schoolSlug) {
    questions {
      id
      body
      votes
    }
  }
}`,
};

export const INTERVIEW_FEEDBACK: AdmitOperation = {
  operationName: 'GetInterviewFeedbackForSchool',
  query: `query GetInterviewFeedbackForSchool($schoolSlug: String!) {
  getInterviewFeedbackForSchool(schoolSlug: $schoolSlug) {
    positive
    negative
    before_interview
  }
}`,
};

export const SCHOOL_STATS: AdmitOperation = {
  operationName: 'getSchoolStats',
  query: `query getSchoolStats($filterOwnSchools: Boolean!, $filterBy: SchoolInformationResidenceType!, $sortOrder: String!, $sortBy: SchoolInformationSortBy!, $page: Float!, $pageSize: Float!) {
  getSchoolStats(filterOwnSchools: $filterOwnSchools, filterBy: $filterBy, sortOrder: $sortOrder, sortBy: $sortBy, page: $page, pageSize: $pageSize) {
    id
    school {
      slug
    }
    application_number
    application_to_interview_pct
    interview_number
    interview_to_admitted_pct
    admitted_number
    mcat
    gpa
    residence_type
    research_hours
    clinical_hours
    non_clinical_hours
  }
}`,
  variables: { filterOwnSchools: false, filterBy: 'GLOBAL', sortOrder: 'ASC', sortBy: 'RANK', page: 1, pageSize: 999 },
};

/**
 * School crests: the school object of `getAllCycleResults` (latest update per school, so one row per school that has
 * one), selecting ONLY school fields. The row also carries user_display_name, user_profile_image_url and user_id;
 * none is requested. `$limit`/`$offset` are `Float!`, `limit` at most 100.
 */
export const SCHOOL_CRESTS: AdmitOperation = {
  operationName: 'getAllCycleResults',
  query: `query getAllCycleResults($status: [ApplicationTrackerStatusEnum!], $filterOwnSchools: Boolean!, $limit: Float!, $offset: Float!) {
  getAllCycleResults(status: $status, filterOwnSchools: $filterOwnSchools, limit: $limit, offset: $offset) {
    school {
      slug
      name
      shorthand_name
      state
      city
      crest_url
    }
  }
}`,
  variables: {
    status: ['INTERVIEW', 'ACCEPTED', 'WITHDRAWN', 'REJECTED', 'WAITLISTED', 'HOLD'],
    filterOwnSchools: false,
    limit: 100,
    offset: 0,
  },
};
