import type { TFunction } from 'i18next';

/**
 * The general questions' translated text. Every key is written out as a literal so `pnpm i18n:extract` sees it (a computed
 * `gq-${id}` key is invisible to it); `general-questions.test.ts` holds that each id has one, with the same default.
 */
export function generalQuestionText(t: TFunction<'medschools'>, id: string, fallback: string): string {
  switch (id) {
    case 'reg-why-medicine':
      return t('gq-reg-why-medicine', { defaultValue: 'Why do you want to practise medicine?' });
    case 'reg-why-not-other':
      return t('gq-reg-why-not-other', {
        defaultValue: 'What other careers did you consider, and why did you choose medicine over them?',
      });
    case 'reg-moment':
      return t('gq-reg-moment', { defaultValue: 'Describe one moment that made you sure this is the right path.' });
    case 'reg-why-here-type':
      return t('gq-reg-why-here-type', {
        defaultValue: 'What are you looking for in a medical school, and what kind of training will suit you best?',
      });
    case 'reg-tell-me':
      return t('gq-reg-tell-me', { defaultValue: 'Tell me about yourself.' });
    case 'reg-strengths':
      return t('gq-reg-strengths', {
        defaultValue:
          'What are your two greatest strengths, and how have they shown up in your work with other people?',
      });
    case 'reg-weakness':
      return t('gq-reg-weakness', {
        defaultValue: 'Name a weakness you are working on. What have you done about it so far?',
      });
    case 'reg-other-applicant':
      return t('gq-reg-other-applicant', {
        defaultValue: 'What would you want the committee to know about you that is not in your application?',
      });
    case 'reg-ten-years':
      return t('gq-reg-ten-years', { defaultValue: 'Where do you picture yourself ten years after graduating?' });
    case 'reg-ethics-refuse':
      return t('gq-reg-ethics-refuse', {
        defaultValue: 'A competent patient refuses a treatment you believe would help them. What do you do, and why?',
      });
    case 'reg-ethics-error':
      return t('gq-reg-ethics-error', {
        defaultValue:
          'You notice a teammate made a medication error that has not yet reached the patient. Walk me through your next steps.',
      });
    case 'reg-ethics-family':
      return t('gq-reg-ethics-family', {
        defaultValue: 'A family asks you to keep a serious diagnosis from the patient. How do you respond?',
      });
    case 'reg-ethics-resources':
      return t('gq-reg-ethics-resources', {
        defaultValue:
          'Two patients need the same scarce resource and only one can have it. How would you think about the decision?',
      });
    case 'reg-team-conflict':
      return t('gq-reg-team-conflict', {
        defaultValue:
          'Tell me about a disagreement with someone you worked with. How did it end, and what would you change?',
      });
    case 'reg-team-lead':
      return t('gq-reg-team-lead', {
        defaultValue: 'Describe a time you led without having the title. What did you do?',
      });
    case 'reg-team-feedback':
      return t('gq-reg-team-feedback', {
        defaultValue: 'Tell me about feedback that was hard to hear. What did you do with it?',
      });
    case 'reg-fail':
      return t('gq-reg-fail', {
        defaultValue: 'Describe a time you failed at something that mattered to you. What came next?',
      });
    case 'reg-stress':
      return t('gq-reg-stress', {
        defaultValue:
          'Medical school is demanding. How do you keep going when the workload and the stress are both high?',
      });
    case 'reg-gap':
      return t('gq-reg-gap', {
        defaultValue:
          'Is there anything in your record, such as a grade, a gap or a retake, that you would like to explain?',
      });
    case 'reg-health-system':
      return t('gq-reg-health-system', {
        defaultValue:
          'Which problem in how healthcare is delivered concerns you most, and what could a physician do about it?',
      });
    case 'reg-health-access':
      return t('gq-reg-health-access', {
        defaultValue:
          'Why do some communities have worse access to care than others, and what part could you play in that?',
      });
    case 'reg-health-patient':
      return t('gq-reg-health-patient', {
        defaultValue: 'Tell me about a patient or a person you met in a clinical setting who stayed with you. Why?',
      });
    case 'phd-why-mdphd':
      return t('gq-phd-why-mdphd', { defaultValue: 'Why an MD-PhD and not just one of the two?' });
    case 'phd-why-not-phd':
      return t('gq-phd-why-not-phd', {
        defaultValue: 'Why not a PhD alone and a research career without the clinical training?',
      });
    case 'phd-why-not-md':
      return t('gq-phd-why-not-md', { defaultValue: 'Why not an MD alone, with research on the side?' });
    case 'phd-years':
      return t('gq-phd-years', {
        defaultValue: 'The training takes eight years or more. What will keep you committed through all of it?',
      });
    case 'phd-research':
      return t('gq-phd-research', { defaultValue: 'Describe your research to someone outside your field.' });
    case 'phd-hypothesis':
      return t('gq-phd-hypothesis', {
        defaultValue: 'What was the hypothesis of your main project, and how did you test it?',
      });
    case 'phd-role':
      return t('gq-phd-role', {
        defaultValue: 'Which parts of that project were your own idea or your own work, and which belonged to others?',
      });
    case 'phd-failed-experiment':
      return t('gq-phd-failed-experiment', {
        defaultValue:
          'Tell me about an experiment that did not work. What did you conclude, and what did you try next?',
      });
    case 'phd-next-step':
      return t('gq-phd-next-step', {
        defaultValue:
          'If your project continued for another year, what question would you ask next and how would you design it?',
      });
    case 'phd-paper':
      return t('gq-phd-paper', {
        defaultValue: 'Pick a paper you read recently. What did you find convincing, and what would you question?',
      });
    case 'phd-career':
      return t('gq-phd-career', {
        defaultValue: 'What would your working week look like after training, between the clinic and the laboratory?',
      });
    case 'phd-translate':
      return t('gq-phd-translate', {
        defaultValue: 'How would seeing patients change the research questions you choose to ask?',
      });
    case 'phd-mentor':
      return t('gq-phd-mentor', {
        defaultValue:
          'Describe the working relationship you want with a research mentor, and one you have had that taught you something.',
      });
    case 'phd-clinic-exposure':
      return t('gq-phd-clinic-exposure', {
        defaultValue: 'What have you done to learn what clinical medicine is actually like, and what did it show you?',
      });
    default:
      return fallback;
  }
}
