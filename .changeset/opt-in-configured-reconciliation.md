---
"@open-twin/aggregate": minor
---

BREAKING: aggregate now performs basic bundling by default. Enable reconciliation
with reconciliation: { enabled: true, catalogue, configuration } to apply saved
strict or fallback source preferences. Configuration is required and validated;
reliability grades and legacy measurement/day mappings are never implicit fallbacks.

Automatically discover declared shared measurements at exact matching instants or
complete period boundaries. Return structured selections, fallbacks, abstentions,
and discovery diagnostics. Missing or partial times cannot establish an occasion.
Reconciliation results now identify a key and window instead of a measure and day.

Retain source resource ids and fullUrls, coalesce identical resources at an address,
and reject conflicting addresses. Derived measurements support observation and
component values and reference original source fullUrls. Every considered source
Observation needs a fullUrl before derived provenance can be created.
The existing one-subject and connector-attribution requirements remain.

Preserve the contained targets required by derived metadata, including transitive
references, without copying unrelated panel-only resources. Keep back-references
pointing at the original container and reject missing or ambiguous targets.
Identical fragment subject labels in separate resources do not imply patient identity.

Resolve relative subject identities using their containing entry's RESTful base.
Equal patient ids from different servers or service roots are not the same subject.
Unbased relative subjects now fail validation on both bundling and reconciliation;
supply a common absolute or URN subject identity. Explicit reading requests compare
against resolved subject identities as well.

Rebase copied relative metadata references to their original absolute targets,
including inside retained contained resources. Preserve the selected source's
original effective[x], local UTC offset and precision; normalized windows are
used only for comparison, reporting and stable identity.

Add an explicit save option to configuration generation. Save-enabled calls return
the configuration and absolute path of a timestamped, uniquely named JSON snapshot.
Directories are created as needed and existing files are never overwritten.
One-argument generation remains storage-free with its existing return shape;
validation, updates and aggregation still perform no persistence.
