---

## "@open-twin/aggregate": minor

Add declaration-driven runtime measurement resolution and explicit reading eligibility
for a requested key, context, subject reference and exact time window. Support
observation and coded component values without converting units or selecting sources.
Reject withdrawn/cancelled or result-less observation statuses and malformed complex
values, including reversed ranges, invalid temporal values and unusable sampled data.
Reject unit-bearing ranges, ratios and sampled-data origins until declarations can
express their units; unitless complex values remain supported.
Keep the legacy aggregate API unchanged while configured reconciliation is migrated.
