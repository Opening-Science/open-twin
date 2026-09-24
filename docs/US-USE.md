# US use

Reviewed 24 September 2026. Supplements [Intended use](INTENDED-USE.md);
research and non-medical wellness only. This is deployment guidance, not an FDA
determination, privacy notice or complete state-law assessment.

## Functions and claims

Keep functionality, user interfaces and promotion consistent with the non-medical
purpose. A research label or `not_for_diagnostic_use` flag does not make disease
assessment or treatment functionality a wellness feature. FDA’s
[general-wellness guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)
distinguishes certain excluded software functions from low-risk devices covered
by enforcement discretion; neither means FDA approval.

Do not claim clinical accuracy, FDA approval/clearance, HIPAA compliance or
anonymity without an applicable basis. Substantiate health and performance claims,
including demonstrations and endorsements, and explain the tested scope. Place
the [intended-use notice](INTENDED-USE.md#purpose-and-limits) alongside outputs.
A disclaimer cannot correct contradictory functionality or marketing.

## Privacy and incidents

- **HIPAA:** assess whether the operator is a covered entity or business associate.
  A consumer wellness service may fall outside HIPAA; handling information for a
  covered provider may create different obligations. Where applicable, implement
  required safeguards and business-associate arrangements. FHIR support is not
  compliance. See [HHS guidance](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html).
- **FTC:** assess the [Health Breach Notification Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-318)
  for qualifying personal-health-record services outside HIPAA, including their
  ability to combine health information from multiple sources. Unauthorized
  disclosures can trigger duties, not only hacking. Do not assume an EU location
  or nonprofit status provides an exemption; evaluate the rule’s scope.
- **States:** assess laws for the users and data involved, including
  [Washington’s My Health My Data Act](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy)
  and [California’s CCPA](https://oag.ca.gov/privacy/ccpa), with their respective
  thresholds and exemptions. Health/genetic privacy and breach laws may impose
  additional duties. GDPR or HIPAA compliance does not settle state-law coverage.

Identify the operator, data uses, recipients, retention and rights in a service-specific
notice. Assess consent and deletion requirements, research reuse, analytics,
advertising and AI-provider transfers. Establish an incident-response and
notification process. Make only privacy promises the service actually implements.

## Research and responsibility

Determine whether the [Common Rule](https://www.hhs.gov/ohrp/regulations-and-policy/regulations/common-rule/index.html),
FDA human-subject requirements or institutional policies apply. Obtain required
review and consent, or document an applicable exemption or waiver. A research-only
label does not establish one. Assess additional obligations before including
children or returning individual genetic interpretations.

Have qualified counsel review the actual service and target states before launch.
The MIT warranty disclaimer does not replace compliance or eliminate mandatory
liability. This document does not change the license or clear a medical use.
