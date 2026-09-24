# Intended use and responsibilities

Reviewed 24 September 2026. Applies to the project’s research and non-medical
consumer-wellness scope. For US audiences, also read [US use](US-USE.md).

## Purpose and limits

Open-twin provides experimental health-data conversion and research libraries.
**It is not intended for medical use:** diagnosis, disease prediction or
prevention, clinical monitoring, triage, treatment or other medical decisions.
Experimental interpretations, severity labels and confidence scores are research
outputs, not clinical findings or disease probabilities. They should not guide
care or replace professional medical advice.

Tests and FHIR checks cover selected inputs and technical properties. They do
not establish clinical safety, performance or regulatory conformity. Describe
the tested scope and remaining uncertainty; see the
[verification baseline](findings/verify-baseline.md).

Display this notice alongside relevant outputs, not only in repository documentation:

> Experimental software for research and non-medical wellness. Not intended for
> diagnosis, treatment or other medical decisions. Outputs may be incomplete or
> incorrect; research scores are not clinically validated assessments.

## EU product boundary

Regulatory status depends on the actual functions, intended purpose and claims
of the resulting product. A wellness label, research disclaimer or separate
component does not exempt medical functionality. Assess device qualification
before applying classification rules, including MDR Rule 11. Laboratory or
genetic interpretation may instead fall under the IVDR. See the
[MDR](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) and
[IVDR](https://eur-lex.europa.eu/eli/reg/2017/746/oj/eng).

Before deployment, the responsible operator should document its functions,
audience, claims and regulatory assessment. A move toward medical functionality
requires a separate intended-purpose decision, appropriate evidence and any
applicable regulatory procedures before use. This repository makes no claim of
medical-device certification or clearance.

## Data and research

FHIR conversion and deterministic IDs **do not anonymize data**. Treat source
records, output bundles and diagnostic reports as potentially sensitive.

Where GDPR applies, operators must establish controller/processor roles, an
Article 6 legal basis and, for health or genetic data, an applicable Article 9
condition. Provide transparent notices, data minimisation, access controls,
secure credentials, retention/deletion and rights processes. Assess processor
contracts, international transfers, incident duties and whether a DPIA is required.
Research status alone does not supply a legal basis or waive consent/ethics
requirements. See [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng),
particularly Articles 6, 9, 13–14, 25, 28, 32–35, 44 and 89.

Validate source-patient linkage and measurement meaning before using outputs;
apply input limits and protect diagnostics at the application boundary. Use
synthetic data in public reports and follow [SECURITY.md](../SECURITY.md).
Obtain applicable research approvals and participant permissions.

## Third-party rights

The [MIT license](../LICENSE) covers only rights the project can grant.
Terminology, the Anchor workbook, vendor examples, datasets and genomic fixtures
may have separate terms. Record their source, license, required notices and
redistribution permission before publication. Public availability, a provenance
record or synthetic status does not itself establish those rights. Check
[HL7 terms](https://www.hl7.org/fhir/R4/license.html),
[SNOMED licensing](https://www.snomed.org/get-snomed) and the
[LOINC license](https://loinc.org/license/). Vendor names imply no endorsement.

## Warranty and responsibility

The software is supplied under the MIT license’s warranty and liability terms,
subject to applicable law. This guidance does not change that license, certify
compliance, exclude mandatory liability or waive participant or consumer rights.
Each party remains responsible for its own applicable obligations. Operators
need product-specific privacy notices and service terms; obtain qualified EU/US
review of actual functions, claims and data flows before consumer deployment.
