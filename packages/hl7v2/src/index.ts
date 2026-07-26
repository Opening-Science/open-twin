export {
  type ConversionResult,
  type ConvertOptions,
  convertMessage,
  VERSION
} from './fhir/bundleBuilder';
export { obrToDiagnosticReport } from './fhir/diagnosticReport';
export { pv1ToEncounter } from './fhir/encounter';
export { noteFrom, obxToObservation } from './fhir/observation';
export { pidToPatient } from './fhir/patient';
export { CONNECTOR, IssueLog, type Location, locate } from './issues';
export { type QuantityInput, type QuantityResult, toQuantity } from './units/quantity';
export { convertUcum, isValidUcum } from './units/ucum';
export {
  type CweResult,
  codingFrom,
  cweToCodeableConcept,
  cxToIdentifier,
  type DatatypeContext,
  eiToIdentifier,
  hdToUri,
  xpnToHumanName
} from './v2/datatypes';
export {
  type Precision,
  parseV2DateTime,
  type V2DateTime,
  type V2DateTimeResult,
  v2Date,
  v2Instant
} from './v2/datetime';
export {
  DEFAULT_ENCODING,
  type EncodingCharacters,
  type EncodingResult,
  readEncodingCharacters,
  unescapeText
} from './v2/encoding';
export {
  component,
  field,
  findSegment,
  findSegments,
  type ParsedMessage,
  type ParseResult,
  parseMessage,
  type Repetition,
  repetition,
  repetitions,
  type Segment,
  subcomponent
} from './v2/parser';
export {
  ADMINISTRATIVE_GENDER,
  DIAGNOSTIC_REPORT_STATUS,
  ENCOUNTER_CLASS,
  ENCOUNTER_STATUS,
  HL7V2_LOCAL_SYSTEM,
  IDENTIFIER_TYPE_SYSTEM,
  INTERPRETATION_CODES,
  knownValueType,
  NAME_USE,
  OBSERVATION_INTERPRETATION_SYSTEM,
  OBSERVATION_STATUS,
  resolveCodingSystem
} from './v2/tables';
