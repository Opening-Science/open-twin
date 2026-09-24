# US use: claims, privacy and research

Maintainer: project maintainers. Last reviewed: 24 September 2026.

This supplements [Intended use and integration responsibilities](INTENDED-USE.md)
for research and non-medical consumer wellness. It identifies deployment decisions;
it is not an FDA determination, a privacy notice or a complete state-law survey.
Publishing source code and operating a service that handles participant data are
different activities. Assess the responsibilities of each party actually involved.

## FDA boundary

Keep consumer features within the project's non-medical wellness purpose.
Experimental interpretation remains research-only. Do not expose disease-risk,
organ-dysfunction or treatment conclusions to consumers merely by adding a
wellness label or `not_for_diagnostic_use` flag.

FDA's [January 2026 general-wellness guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)
distinguishes software excluded from the device definition from certain low-risk
devices subject to an enforcement-discretion policy. Neither amounts to FDA
approval. Evaluate each function, its risks, UI, instructions and marketing;
the project's own research label does not settle its regulatory status.

Suggested notice, where it accurately describes the product:

> Experimental software for research and non-medical wellness. Not intended to
> diagnose, treat, cure or prevent disease. Research interpretations are not
> clinically validated and must not guide medical decisions. FHIR conformance
> checks do not establish FDA approval or clearance.

Place relevant limits alongside outputs and in onboarding, not solely in this
repository. A notice cannot contradict what the product actually does or implies.

## Claims and evidence

Keep a record of each public health or performance claim, its supporting evidence
and tested scope. Apply this to the README, demonstrations, screenshots, app-store
text and testimonials. Avoid unsubstantiated claims such as clinically accurate,
detects disease, FDA approved, HIPAA compliant or anonymous. Describe observed
technical test results precisely. FDA's guidance addresses consistent labeling;
the [FTC endorsement guides](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255)
also require truthful, substantiated endorsements and relevant disclosures.

## Health-data responsibilities

**HIPAA is role-dependent.** Determine whether the operator is a covered entity or
acts as a business associate handling protected health information on its behalf.
A direct-to-consumer wellness service may fall outside HIPAA; a provider-facing
deployment may not. Where applicable, implement the required safeguards and
business-associate arrangements. FHIR support does not establish compliance.
See [45 CFR 160.102–103](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-160/subpart-A).

**FTC breach duties can apply outside HIPAA.** A service combining wearable,
user-entered or other health information may meet the personal-health-record
definition. Assess the [Health Breach Notification Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-318)
against actual roles and data flows, including the capacity to draw from multiple
sources. Covered breaches include unauthorized disclosures, not only hacking.
The rule expressly reaches qualifying foreign and domestic entities holding US
citizens' or residents' information. EU location or nonprofit status is not an
automatic exclusion. Assign an incident owner and notification process before
collecting real data; assess HIPAA and state breach duties where applicable.

**State requirements need a separate assessment.** Washington's
[My Health My Data Act](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy)
can reach out-of-state services targeting Washington consumers and provides for
private enforcement. Where applicable, implement its consumer-health privacy
policy, consent, deletion and sale-authorization requirements. Also assess
[California's CCPA](https://oag.ca.gov/privacy/ccpa) and other applicable health,
genetic and general privacy laws. Check the launch population, entity thresholds
and exemptions; HIPAA or GDPR compliance alone does not settle these questions.

Before launch, publish a product-specific notice identifying the operator,
data categories, purposes, recipients, retention, rights and contact route.
Document any research reuse, analytics, advertising, AI-provider transfers or
model training. Implement required choices before processing. Do not promise
no sharing, no sale, deletion or anonymity unless the actual service supports it.
These libraries do not supply that notice, consent flow or incident process.

## Research and additional audiences

The study sponsor should document whether the
[Common Rule](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-46/subpart-A),
FDA human-subject requirements or institutional policies apply. Obtain any
required review and consent, or document the applicable exemption or waiver.
A research-only label is not such a determination. General-wellness deployment
does not by itself make every study subject to the Common Rule.

Before adding children or returning individual genetic interpretations, assess
the additional privacy, consent and regulatory requirements for that population
and activity. They are not cleared by this document.

## Release record

Have US-qualified counsel review the actual product and target states. Record
the intended functions, supported claims, data flows, applicable regimes,
responsible operator and unresolved issues. Review the service's terms and
liability provisions separately; do not treat the MIT warranty disclaimer as a
waiver of participant rights or a substitute for compliance.

This supplement leaves the MIT license unchanged.
