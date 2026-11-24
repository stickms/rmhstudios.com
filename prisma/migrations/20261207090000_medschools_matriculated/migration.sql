-- AlterEnum: a private tracker milestone ("Matriculating"); never shared as a public event. Additive, existing rows are untouched.
ALTER TYPE "MedMilestoneType" ADD VALUE 'MATRICULATED' AFTER 'ACCEPTANCE';
