interface RejectionTemplate {
    subject: string;
    body: string;
    category: 'corporate' | 'absurd' | 'oa_fail' | 'oa_pass';
}

const templates: RejectionTemplate[] = [
    // ── Corporate-style rejections ──
    {
        subject: 'Update on Your Application',
        body: 'Thank you for your interest in the {title} position at {company}. After careful consideration, we have decided to move forward with other candidates whose qualifications more closely align with our current needs. We encourage you to apply for future openings.',
        category: 'corporate',
    },
    {
        subject: 'Application Status Update',
        body: 'We appreciate the time you invested in applying for the {title} role at {company}. Unfortunately, we will not be moving forward with your application at this time. This was an extremely competitive process and your background was impressive. We wish you the best in your job search.',
        category: 'corporate',
    },
    {
        subject: 'Thank You for Applying',
        body: 'Dear Applicant, we wanted to personally reach out regarding your application for {title} at {company}. While your experience is valued, we have identified a candidate who is a stronger fit for our team\'s specific needs at this time. Please do not take this as a reflection of your abilities.',
        category: 'corporate',
    },
    {
        subject: 'Your Application to {company}',
        body: 'After a thorough review of all applications for the {title} position, we regret to inform you that we will not be proceeding with your candidacy. The volume of qualified applicants was unprecedented. We will keep your resume on file for 6 months.',
        category: 'corporate',
    },
    {
        subject: 'Important Update from {company} Talent Acquisition',
        body: 'We want to thank you for your interest in the {title} opportunity at {company}. After extensive deliberation, our hiring committee has chosen to advance other candidates. We recognize the effort involved in each application and sincerely appreciate yours.',
        category: 'corporate',
    },
    {
        subject: 'Regarding Your Candidacy',
        body: 'Thank you for considering {company} as your next career destination. We have completed our review for the {title} position and have decided to pursue candidates with a slightly different skill set. We were genuinely impressed with your background and hope you\'ll consider us again in the future.',
        category: 'corporate',
    },
    {
        subject: 'Application Decision — {title}',
        body: 'We appreciate your patience as we reviewed applications for {title}. Unfortunately, we are unable to offer you this position. Our team was humbled by the caliber of candidates who applied. We encourage you to check our careers page regularly for new opportunities.',
        category: 'corporate',
    },
    {
        subject: 'An Update on Your Application',
        body: 'Dear Applicant, after careful evaluation, we have concluded our hiring process for the {title} role at {company}. Regrettably, we are not able to extend an offer at this time. We found your application compelling and hope our paths cross again.',
        category: 'corporate',
    },

    // ── Absurd rejections ──
    {
        subject: 'Application Denied — Insufficient Dragon Slaying Experience',
        body: 'We regret to inform you that your application for {title} at {company} has been declined. While your résumé was impressive, we ultimately went with a candidate who arrived at the interview riding a dragon. We feel this demonstrated superior domain expertise.',
        category: 'absurd',
    },
    {
        subject: 'The Stars Have Spoken',
        body: 'Our astrological hiring committee has reviewed your application for {title} at {company}. Unfortunately, Mercury is in retrograde and your star chart is incompatible with our corporate constellation. Please reapply when the cosmos align more favorably.',
        category: 'absurd',
    },
    {
        subject: 'Application Rejected — Vibes Were Off',
        body: 'Thank you for applying to {title} at {company}. Our Chief Vibes Officer conducted a thorough vibe check of your application and determined that your energy frequency is approximately 2.3 MHz below our minimum vibrational threshold. Better luck next time.',
        category: 'absurd',
    },
    {
        subject: 'We Went With a Time Traveler',
        body: 'We appreciate your application for {title} at {company}. However, a candidate from the year 2087 applied and already has 60 years of experience with technologies that haven\'t been invented yet. We\'re sure you understand.',
        category: 'absurd',
    },
    {
        subject: 'Your Application Was Eaten',
        body: 'We are writing to inform you that your application for {title} was consumed by an office poltergeist before our hiring committee could review it. By the time we recovered the remnants, the position had already been filled. We apologize for any inconvenience caused by the haunting.',
        category: 'absurd',
    },
    {
        subject: 'URGENT: Application Status Update',
        body: 'Your application for {title} at {company} has been processed. Unfortunately, our proprietary AI hiring system (which is definitely not three raccoons in a trench coat) has determined that you are "not raccoon enough" for this role. This decision is final and cannot be appealed.',
        category: 'absurd',
    },
    {
        subject: 'Position Eliminated by Prophecy',
        body: 'Thank you for your interest in {title} at {company}. We regret to inform you that an ancient prophecy has foretold the elimination of this position. The oracle was quite specific. We wish you well in your future endeavors and advise you to beware the Ides of March.',
        category: 'absurd',
    },
    {
        subject: 'Application Review Complete — You Failed the Vibe Check',
        body: 'Dear Applicant, while your technical qualifications for {title} were outstanding, our team of emotional support corgis did not wag their tails during your application review. This is an automatic disqualification per Section 7.4 of our Canine Assessment Protocol.',
        category: 'absurd',
    },
    {
        subject: 'We Offered the Role to a Sentient AI',
        body: 'After careful deliberation, we have offered the {title} position to an AI that demonstrated it could do the job in 0.003 seconds. It also doesn\'t need health insurance, vacation days, or bathroom breaks. We appreciate your humanity, but it was ultimately a liability.',
        category: 'absurd',
    },
    {
        subject: 'Rejected: Your Application Was Too Good',
        body: 'This is not a drill. Your application for {title} at {company} was rejected because it was TOO qualified. Our team felt intimidated and collectively voted to reject you to protect their self-esteem. We hope you understand.',
        category: 'absurd',
    },

    // ── OA fail rejections ──
    {
        subject: 'Online Assessment Results — {title}',
        body: 'Thank you for completing the Online Assessment for {title} at {company}. Unfortunately, your solution did not meet the required time complexity. Our automated system detected an O(2^n) approach where O(n^2) was required. We encourage you to review your understanding of polynomial-time algorithms and consider reapplying in 6 months.',
        category: 'oa_fail',
    },
    {
        subject: 'Assessment Evaluation Complete',
        body: 'We have reviewed your submission for the {title} coding assessment. Your solution passed 14 out of 247 test cases before exceeding the time limit. While we appreciate your effort, our minimum threshold is 247 out of 247. We encourage you to keep practicing.',
        category: 'oa_fail',
    },
    {
        subject: 'Technical Assessment — Not Quite There',
        body: 'Your submission for the {title} Online Assessment at {company} has been evaluated. While your code compiled successfully, our automated review noted that your algorithm has a time complexity of approximately O(n!), which exceeds the required O(n log n) by several orders of magnitude. Specifically, it would take longer than the heat death of the universe to process our largest test case.',
        category: 'oa_fail',
    },
    {
        subject: 'OA Results: {title}',
        body: 'Dear Candidate, your Online Assessment for {title} has been reviewed. Your solution produced correct output for the trivial test cases (n ≤ 3) but timed out on all others. Our engineering team appreciated your creative use of nested for-loops but ultimately decided this approach was incompatible with our performance requirements.',
        category: 'oa_fail',
    },
    {
        subject: 'Assessment Outcome — We Noticed Some Issues',
        body: 'Thank you for your assessment submission for {title}. Our review panel noted the following: (1) Your solution did not terminate within the allotted time. (2) The space complexity exceeded available memory on our evaluation servers. (3) One evaluator reported that their laptop caught fire. We wish you the best in your future assessments.',
        category: 'oa_fail',
    },

    // ── OA pass rejections (the cruelest ones) ──
    {
        subject: 'Congratulations! Also, We\'re Not Hiring',
        body: 'Incredible news! You passed the Online Assessment for {title} at {company} with flying colors. Your solution was elegant, efficient, and frankly, better than what most of our current engineers could produce. Unfortunately, we have decided to eliminate the position entirely due to a restructuring that was announced 4 minutes ago. Thank you for your time.',
        category: 'oa_pass',
    },
    {
        subject: 'You Solved It! (But We Still Can\'t Hire You)',
        body: 'We are genuinely impressed. You appear to have found a polynomial-time solution to an NP-hard problem. Our research division has forwarded your code to MIT and Stanford for peer review. In the meantime, the {title} role has been filled internally by the CEO\'s nephew. We wish you continued success in computational complexity theory.',
        category: 'oa_pass',
    },
    {
        subject: 'Perfect Score! And Some Bad News.',
        body: 'Your assessment results for {title} at {company}: 247/247 test cases passed. Time complexity: O(n^2) as required. We have never seen this before. Our engineers are both amazed and deeply unsettled. Unfortunately, your success has triggered an existential crisis across the engineering department, and we are unable to bring on new team members until morale improves. Expected timeline: never.',
        category: 'oa_pass',
    },
    {
        subject: 'Assessment Passed — Position Frozen',
        body: 'Congratulations on passing the {title} assessment at {company}! Your performance was exceptional. However, due to a budget freeze that was definitely not caused by our CEO buying a yacht, we are unable to extend an offer at this time. We have added you to our "talent pool," which is a spreadsheet nobody will ever look at again.',
        category: 'oa_pass',
    },
    {
        subject: 'You Did Everything Right. It Doesn\'t Matter.',
        body: 'Dear Candidate, we want you to know that your assessment for {title} was flawless. Your code was clean, your approach was optimal, and you finished with 12 minutes to spare. We showed it to our entire engineering team and they gave you a standing ovation. Then HR informed us the headcount was moved to the marketing department. We are truly sorry. This rejection is a reflection of our organization, not of you.',
        category: 'oa_pass',
    },
];

export function getRandomRejection(
    category: 'corporate' | 'absurd' | 'oa_fail' | 'oa_pass',
    jobTitle: string,
    company: string
): { subject: string; body: string } {
    const pool = templates.filter((t) => t.category === category);
    const template = pool[Math.floor(Math.random() * pool.length)];
    return {
        subject: template.subject.replace(/{title}/g, jobTitle).replace(/{company}/g, company),
        body: template.body.replace(/{title}/g, jobTitle).replace(/{company}/g, company),
    };
}

export function getRandomRejectionMessage(
    jobTitle: string,
    company: string,
    isOa: boolean = false,
    oaPassed: boolean = false
): string {
    let category: RejectionTemplate['category'];

    if (isOa) {
        category = oaPassed ? 'oa_pass' : 'oa_fail';
    } else {
        category = Math.random() < 0.5 ? 'corporate' : 'absurd';
    }

    const { subject, body } = getRandomRejection(category, jobTitle, company);
    return `**${subject}**\n\n${body}`;
}
