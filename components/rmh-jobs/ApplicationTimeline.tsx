'use client';

import { CheckCircle2, XCircle, Clock, FileCode2, AlertTriangle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

interface Application {
    id: string;
    status: string;
    outcome: string | null;
    rejectionMessage: string | null;
    createdAt: string;
    job: {
        id: string;
        title: string;
        company: string;
        type: string;
    };
    assessment: {
        id: string;
        status: string;
        problemId: string;
        expiresAt: string;
        startedAt: string | null;
        submittedAt: string | null;
        evaluationResult: string | null;
    } | null;
}

export function ApplicationTimeline({ applications }: { applications: Application[] }) {
    const { t } = useTranslation("c-rmh-jobs");

    if (applications.length === 0) {
        return (
            <div className="text-center py-16" style={{ color: 'var(--jobs-text-muted)' }}>
                <p className="text-lg mb-2">{t("no-applications-yet", { defaultValue: "No applications yet" })}</p>
                <p className="text-sm">{t("no-applications-hint", { defaultValue: "Browse jobs and start applying. Every journey begins with a rejection." })}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {applications.map((app) => (
                <ApplicationCard key={app.id} application={app} />
            ))}
        </div>
    );
}

function ApplicationCard({ application: app }: { application: Application }) {
    const { t } = useTranslation("c-rmh-jobs");
    const statusConfig = getStatusConfig(app, t);

    return (
        <div
            className="p-4 rounded-lg border"
            style={{
                background: 'var(--jobs-surface)',
                borderColor: 'var(--jobs-border)',
                borderRadius: 'var(--jobs-radius)',
            }}
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <Link
                        to={`/secret/jobs/${app.job.id}` as string}
                        className="font-semibold hover:text-(--jobs-accent) transition-colors"
                    >
                        {app.job.title}
                    </Link>
                    <p className="text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
                        {app.job.company}
                    </p>
                </div>
                <span className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusConfig.className}`}>
                    {statusConfig.icon}
                    {statusConfig.label}
                </span>
            </div>

            {/* Timeline steps */}
            <div className="flex items-center gap-1 text-xs mb-3" style={{ color: 'var(--jobs-text-subtle)' }}>
                <span className="text-(--jobs-accent)">{t("timeline-applied", { defaultValue: "Applied" })}</span>
                <span className="mx-1">→</span>
                {app.status === 'pending' && (
                    <span style={{ color: 'var(--jobs-warning)' }}>{t("timeline-under-review", { defaultValue: "Under Review..." })}</span>
                )}
                {app.status === 'rejected' && !app.assessment && (
                    <span style={{ color: 'var(--jobs-danger)' }}>{t("timeline-rejected", { defaultValue: "Rejected" })}</span>
                )}
                {(app.status === 'oa_invited' || app.status === 'oa_completed' || (app.status === 'rejected' && app.assessment)) && (
                    <>
                        <span className="text-(--jobs-accent)">{t("timeline-oa-invited", { defaultValue: "OA Invited" })}</span>
                        <span className="mx-1">→</span>
                        {app.assessment?.submittedAt ? (
                            <>
                                <span className="text-(--jobs-accent)">{t("timeline-oa-submitted", { defaultValue: "OA Submitted" })}</span>
                                {app.status === 'oa_completed' && (
                                    <>
                                        <span className="mx-1">→</span>
                                        <span style={{ color: 'var(--jobs-warning)' }}>{t("timeline-under-review", { defaultValue: "Under Review..." })}</span>
                                    </>
                                )}
                                {app.status === 'rejected' && (
                                    <>
                                        <span className="mx-1">→</span>
                                        <span style={{ color: 'var(--jobs-danger)' }}>{t("timeline-rejected", { defaultValue: "Rejected" })}</span>
                                    </>
                                )}
                            </>
                        ) : app.assessment ? (
                            <span style={{ color: 'var(--jobs-warning)' }}>{t("timeline-oa-pending", { defaultValue: "OA Pending" })}</span>
                        ) : null}
                    </>
                )}
            </div>

            {/* OA action button */}
            {app.assessment && !app.assessment.submittedAt && app.status === 'oa_invited' && (
                <Link
                    to={`/secret/jobs/assessment/${app.assessment.id}` as string}
                    className="jobs-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                    style={{ borderRadius: 'var(--jobs-radius-sm)' }}
                >
                    <FileCode2 size={14} />
                    {t("start-online-assessment", { defaultValue: "Start Online Assessment" })}
                </Link>
            )}

            {/* Rejection message */}
            {app.rejectionMessage && app.status === 'rejected' && (
                <div
                    className="rejection-letter mt-3 p-3 rounded text-xs leading-relaxed whitespace-pre-wrap"
                    style={{ borderRadius: 'var(--jobs-radius-sm)' }}
                    dangerouslySetInnerHTML={{ __html: app.rejectionMessage.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
                />
            )}

            <p className="text-xs mt-3" style={{ color: 'var(--jobs-text-subtle)' }}>
                {t("applied-date", { defaultValue: "Applied {{date}}", date: new Date(app.createdAt).toLocaleDateString() })}
            </p>
        </div>
    );
}

function getStatusConfig(app: Application, t: (key: string, opts: { defaultValue: string }) => string) {
    switch (app.status) {
        case 'pending':
            return {
                label: t("status-under-review", { defaultValue: "Under Review" }),
                className: 'status-pending',
                icon: <Clock size={12} />,
            };
        case 'rejected':
            return {
                label: t("status-rejected", { defaultValue: "Rejected" }),
                className: 'status-rejected',
                icon: <XCircle size={12} />,
            };
        case 'oa_invited':
            if (app.assessment?.submittedAt) {
                return {
                    label: t("status-oa-complete", { defaultValue: "OA Complete" }),
                    className: 'status-oa-invited',
                    icon: <CheckCircle2 size={12} />,
                };
            }
            return {
                label: t("status-oa-invited", { defaultValue: "OA Invited" }),
                className: 'status-oa-invited',
                icon: <AlertTriangle size={12} />,
            };
        case 'oa_completed':
            return {
                label: t("status-oa-completed", { defaultValue: "OA Completed" }),
                className: 'status-oa-invited',
                icon: <CheckCircle2 size={12} />,
            };
        default:
            return {
                label: app.status,
                className: 'status-pending',
                icon: <Clock size={12} />,
            };
    }
}
