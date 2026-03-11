export const GRACE_PERIOD: number = 30;
export const CANCELLABLE_PERIOD_MINUTES: number = 5;
export const GRACE_PERIOD_EARLY_ENTERANCE_MINUTES: number = 15;
export const GRACE_PERIOD_TO_LEAVE_AFTER_SESSION_END_TIME: number = 10;
export const MAX_ALLOWED_HOURS_TO_EXTEND_SESSION: number = 8;
export const OCCUPANCY_CHECK_DELAY_AFTER_ENTRY = 10 * 60 * 1000;
export const MAX_RESERVATION_HOURS = 5




export const RESERVATION_CHECK_IF_IT_HAS_CONTINUE = 10;
//BILLING
export const REGULAR_RATE_PER_MINUTE = 0.5; // EGP per minute
export const PENALTY_RATE_PER_MINUTE = 1.0; // EGP per minute (Higher rate)
export const CONFLICT_FEE = 20.0; // EGP fixed fee for causing conflict
export const MINIMUM_CHARGE = 5.0; // EGP minimum charge for any session
export const NO_SHOW_PENALTY_AMOUNT = 100.0;
export const HOLDAMOUNT_WHILE_RESERVATIONS = 10000;