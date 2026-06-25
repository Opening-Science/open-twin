# open-twin-provider-oura

A provider for connecting Oura devices and APIs to the Open Twin ecosystem. This package retrieves user and device data from Oura and transforms it into an open, standardized format for interoperable processing and further analysis.

# Features

t.b.d.

# Installation

t.b.d. (npm install @open-twin/provider-oura)

# Usage

t.b.d.

# Oura to FHIR Mappings

## Sleep

| OURA Data Feature | FHIR Correspondence | LOINC Code |
| ----------------- | ------------------- | -----------------|
| bedtime_start | Observation.effectivePeriod |  |
| bedtime_end | Observation.effectivePeriod |  |
| id | Observation.identifier |  |
| score | Observation.valueQuantity | 93832-4 |

# Personal

| OURA Data Feature | FHIR Correspondence | LOINC Code |
| ----------------- | ------------------- | -----------------|
| weight | Observation.valueQuantity | 29463-7 |
| height | Observation.valueQuantity | 8302-2 |
| gender | Patient.gender | 99501-9 |
| age | Now() - Patient.birthDate | |
| | |

# Disclaimer

This project is an independent and unofficial integration for Oura services and devices. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with Oura LLC or Oura Health Oy.

“Oura” is a trademark of Oura Health Oy. All product names, logos, and brands are property of their respective owners.

# Trademarks

“Oura” is a trademark of Oura Health Oy.

Use of these names does not imply endorsement or affiliation.

# License

MIT
