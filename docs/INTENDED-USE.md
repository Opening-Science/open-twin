# Intended use and responsibilities

Last updated 24 September 2026 by the project maintainers.
For US audiences, also read [US use](US-USE.md).

## Purpose and limits

Open-twin provides experimental libraries for research and non-medical consumer
wellness. **Medical use is outside the intended scope:** diagnosis, disease
prediction or prevention, clinical monitoring, triage, treatment or other medical
decisions. Interpretations and severity labels are research outputs; confidence
measures rule support, not disease probability. They must not guide care or
replace professional medical advice.

Tests and FHIR checks cover selected inputs and technical properties. Passing
checks does not establish clinical accuracy, safety, performance or regulatory
conformity. Describe the tested scope and uncertainty; see the
[verification baseline](findings/verify-baseline.md).

Operators must display this notice alongside relevant outputs:

> Experimental software for research and non-medical wellness. Not intended for
> diagnosis, treatment or other medical decisions. Outputs may be incomplete or
> incorrect; research scores are not clinically validated assessments.

## EU product boundary

Regulatory status depends on actual functions, intended purpose and claims.
A wellness label, research disclaimer or component boundary does not exempt
medical functionality. Assess device qualification before classification,
including MDR Rule 11. Laboratory or genetic interpretation may fall under the
IVDR rather than the MDR. See the
[MDR](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) and
[IVDR](https://eur-lex.europa.eu/eli/reg/2017/746/oj/eng).

Before deployment, operators should document functions, audience, claims and
regulatory assessment. Medical functionality requires a separate intended-purpose
decision, appropriate evidence and applicable regulatory procedures before use.
This repository claims no medical-device certification or clearance.

## Data and research

FHIR conversion and deterministic IDs **do not anonymise data**. Treat source
records, output bundles and diagnostic reports as potentially sensitive.

Where the GDPR applies, operators must establish controller/processor roles, an
Article 6 legal basis and, for health or genetic data, an Article 9 condition.
Provide transparent notices, data minimisation, access controls, secure
credentials, retention/deletion and rights processes. Assess processor contracts,
international transfers, incident duties and whether a DPIA is required. Research
status alone supplies neither a legal basis nor a consent/ethics exemption. See
[GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), particularly Articles
6, 9, 13–14, 25, 28, 32–35, 44 and 89. Assess the
[Swiss FADP](https://www.edoeb.admin.ch/en/legal-basis-data-protection) separately
where applicable.

Integrators must verify source-patient linkage and measurement meaning, apply
input limits and protect diagnostics. Use synthetic data in public reports;
follow [SECURITY.md](../SECURITY.md). Operators must obtain applicable research
approvals and participant permissions.

## Third-party rights

[MIT](../LICENSE) covers only rights the copyright holders can grant. Terminology,
the [Anchor workbook](evidence/source/2026_07_28_OpenTwin_AnchorLayer_v3_Consolidated.xlsx),
vendor examples, datasets and genomic fixtures may have separate terms. Record
sources, licences, required notices and redistribution permission before
publication. Public availability, provenance or synthetic status does not
establish those rights. Check
[HL7 terms](https://www.hl7.org/fhir/R4/license.html),
[SNOMED licensing](https://www.snomed.org/get-snomed) and the
[LOINC licence](https://loinc.org/license/). Vendor names imply no endorsement.

## Warranty and responsibility

The software is supplied under the MIT licence’s warranty and liability terms,
subject to applicable law. This guidance does not change that licence, certify
compliance, exclude mandatory liability or waive participant or consumer rights.
Each party remains responsible for its own applicable obligations. Operators
need product-specific privacy notices and service terms; obtain qualified EU/US
review of actual functions, claims and data flows before consumer deployment.
