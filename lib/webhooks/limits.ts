/** Webhook limits shared by the developer API (`/api/v1/webhooks`) and the console. */

/** Endpoints one member may register. */
export const MAX_WEBHOOK_ENDPOINTS = 10;

/** How long a rotated-out secret keeps signing deliveries alongside the new one. */
export const SECRET_OVERLAP_MS = 24 * 60 * 60 * 1000;
