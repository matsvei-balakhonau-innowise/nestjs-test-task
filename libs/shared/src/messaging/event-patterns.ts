export const EVENT_PATTERNS = {
  SERVICE_A_ACTION: 'service_a.action',
} as const;

export type EventPattern =
  (typeof EVENT_PATTERNS)[keyof typeof EVENT_PATTERNS];
