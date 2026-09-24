# Intended use and integration responsibilities

Maintainer: project maintainers. Last reviewed: 24 September 2026.
Review this statement when functionality, audiences, claims or distribution change.

The data-protection and medical-device references below address the EU. For US
users, participants or deployments, also read the [US supplement](US-USE.md).
Both may apply to the same service.

## Purpose and evidence

Open-twin targets developers building research tools and non-medical
consumer-wellness applications. Its connectors import and organize measurements
in FHIR R4. The project does not claim suitability for diagnosis, prevention,
prediction or prognosis of disease, medical monitoring, treatment or triage.

Experimental interpretation modules are intended for **research hypothesis
generation only**. Their heuristic rules can produce severity labels and
confidence values. These describe rule outputs and support; they are not
validated assessments of disease probability or organ health. Keep these outputs
out of consumer medical conclusions, alerts and treatment recommendations.

CI checks registered example bundles, selected terminology and units, and test
fixtures. Passing those checks does not establish clinical performance, accuracy
for every input, or regulatory conformity. The
[verification baseline](findings/verify-baseline.md) records advisory review
debt and known gaps. State the tested scope whenever describing validation.

Suggested notice alongside research interpretation outputs:

> Experimental research output. Severity labels and confidence values describe
> heuristic rules; they are not clinically validated conclusions or disease
> probabilities. Do not use them for diagnosis or treatment decisions.

## Deployment boundaries

A disclaimer or `not_for_diagnostic_use` field does not determine regulatory
status. Intended purpose depends on the functionality, instructions, presentation
and promotional claims of the resulting product. EU medical-device qualification
must be assessed before applying classification rules such as MDR Rule 11.
Laboratory or genetic interpretation may also require an IVDR assessment.
See [MDR Article 2 and Annex VIII](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng)
and [IVDR Articles 1–2](https://eur-lex.europa.eu/eli/reg/2017/746/oj/eng).

Before consumer deployment, obtain a qualified assessment of the actual product
and its claims. Separating an interpretation component does not by itself exempt
the combined product. These intended-purpose statements do not amend the MIT
license or certify a downstream application's compliance.

## Participant data

FHIR conversion and deterministic UUIDs **do not anonymize data**. Outputs may
retain vendor identifiers, demographics and health or genetic information.
Diagnostic reports should also be treated as potentially sensitive.

Where GDPR applies to real participant data, the host operator must:

- Establish controller/processor roles, an Article 6 legal basis and an applicable
  Article 9 condition for special-category data. A research label alone is not a
  lawful basis. Explain purposes and recipients to participants.
- Implement access controls, protected token storage, data minimisation,
  retention/deletion procedures and a participant-rights process.
- Assess international transfers and whether the processing requires a data
  protection impact assessment. Research safeguards depend on the study and
  applicable EU and national law.

See [GDPR Articles 6, 9, 25, 32, 35, 44 and 89](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
The library supplies none of these organisational arrangements automatically.
Use synthetic fixtures in issues and tests; report security concerns through
[SECURITY.md](../SECURITY.md).

## Third-party rights

The [MIT license](../LICENSE) covers rights the project can grant in its code and
documentation. It does not grant rights to vendor services or independently
licensed terminology, datasets and other third-party content.

Before redistributing terminology, the Anchor workbook/catalogue, vendor examples
or genomic fixtures, record the source, version, applicable terms, required notices
and evidence of permission. Public availability and synthetic data status do not
themselves establish permission to redistribute. A provenance record identifies a
source; it is not a license clearance.

HL7's FHIR specification is CC0, with separate
[third-party and trademark provisions](https://www.hl7.org/fhir/R4/license.html).
Check [SNOMED licensing and registration](https://www.snomed.org/get-snomed)
for the relevant territories and distribution, and the current
[LOINC license](https://loinc.org/license/). The repository does not establish
that every intended redistribution has been cleared. Vendor names identify
integrations and do not imply endorsement.
