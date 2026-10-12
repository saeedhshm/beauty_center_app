export const MARKET_TIME_ZONE = 'Africa/Cairo';

// Proposed daytime default while exact day boundaries stay undecided.
// Documented in docs/bookings.md; enforced for schedule input and slot output.
export const DAYTIME_START_MINUTES = 9 * 60;
export const DAYTIME_END_MINUTES = 22 * 60;
// Grid step for offered slot start times. Buffer time between bookings stays 0
// until a transfer duration is approved.
export const SLOT_STEP_MINUTES = 30;
// Upper bound for one availability/slots query range.
export const MAX_SLOTS_RANGE_DAYS = 14;
