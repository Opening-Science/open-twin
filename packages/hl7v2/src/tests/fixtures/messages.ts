/**
 * Sample messages transcribed from the HL7 Version 2 to FHIR Implementation Guide.
 *
 * Every message below is copied from the IG's own test-conversion page rather than
 * written to suit this connector. Fixtures written by the person writing the mapper
 * agree with the mapper by construction; the IG's do not, and that is the point.
 *
 * Provenance, exactly:
 *
 *   ORU_R01, ADT_A01, MDM_T02
 *     https://github.com/HL7/v2-to-fhir/blob/master/input/pagecontent/test_conversions.md
 *     ("### ADT Messages / #### ADT_A01", "#### ORU_R01", "#### MDM_T02"), published
 *     at https://build.fhir.org/ig/HL7/v2-to-fhir/test_conversions.html. The page's
 *     `<br>` line separators are replaced by the carriage returns the wire format
 *     uses; the segment text is otherwise byte-for-byte as published.
 *
 * The MDM_T02 message is used only for its OBX segments, which are the IG's own
 * example of local coding systems (`L`, and no coding system at all) alongside a
 * LOINC alternate coding. This connector does not convert MDM messages.
 */

const CR = '\r';

/**
 * IG test_conversions.md, "#### ORU_R01".
 *
 * Note MSH-2: this message declares **five** encoding characters, `^~\&#`, the
 * fifth being the v2.7 truncation character. A parser with `|^~\&` hardcoded reads
 * the trailing `#` as data.
 */
export const ORU_R01 = [
  'MSH|^~\\&#|LabApp^9.8.7.6.5^ISO|LabFac^8.7.6.4^ISO|OrdApp^1.2.3.4.5^ISO|OrdFac^2.3.4.4^ISO|20150602100012.43+0100|DEADBEEF|ORU^R01^ORU_R01|20251014154001-425|P|2.5.1|||AL|AL|USA|UNICODE UTF-8|en-US^^ISO639||LRI..get...|',
  'PID|1||1032702^^^OrdOrg&3.4.5.6.7&ISO^MR^OrdFac&2.3.4.5.6&ISO^20190101^20290101||Everywoman^Eve^L^Jr^Dr^^L^^^^G^20000909^20301231^PhD~Original^Eve^L^Jr^^^M^^^19700601&20000908^G||197006010912|F||1002-5^American Indian or Alaska Native^HL70005~2106-3^White^HL70005|1000 House Lane^Appt 123^Ann Arbor^MI^99999^USA^H^^WA||^PRN^PH^^1^555^555-8473~^NET^Internet^eve@test.test|^WPN^PH^^1^555^555-1126^12|en-US^^ISO639|M^Married^HL70002|CHR^Christian^HL70006|12345^^^OrdFac&2.3.4.5.6&ISO^AN||12345^MI^20180219||N^Not Hispanic or Latino&HL70189|1025 House Lane^^Ann Arbor^MI^99999^USA^H^^WA|Y|2|NL^Netherlands^ISO3166||||N|',
  'PV1|1|E^EMERGENCY^HL70004|EMERG^101^01^^^^^^^^DEPID|E^Emergency^HL70007|||857432^Jones^Emily^^^MD^^OrdOrg&3.4.5.6.7.8&ISO^L^9^1000^DN^OrdFac&2.3.4.5.6&ISO^^G^20100101000000^20330101000000^doctor||||||||||||81456267^^^AssignAuth&1.2.3.4.5.6&ISO^VN|T^Third Party Bill^HL70064||||||||||||||||||||||||20150601135800|',
  'PV2|||^Not feeling well|||||201506011609|||||23432^Smith^Gordon^Denny^Jr^MD^^OrdOrg&3.4.5.6.7&ISO^L^9^1000^DN^OrdFac&2.3.4.5.6&ISO^^G^20100101000000^20330101000000^doctor||||||||F|N|||2^Urgent^HL72017|||||||||||||A^Ambulance^HL70430||AC^Acute^HL70432',
  'ORC|RE|ORD777888^OrdFac^2.3.4.4^ISO|LAB4432^LabFac^8.7.6.4^ISO|GORD874244^OrdFac^2.3.4.4^ISO|CM||1^^^20150601^^R ||201506011608|1234567890^PhysicianAssistant^Will^John^III^Mr.^PA^&372526&L^L^^^NPI^^^^G^20140129^^FHL7|5742200012^Radon^Nicholas^^^^^^&372526&L^L^^^NPI|5742200012^Radon^Nicholas^^^^^^&372526&L^L^^^NPI|||||^^^^^^^^Emergency Department|||2^Patient has been informed of responsibility, and agrees to pay for service^HL70339|OrdFac^2.3.4.4^ISO|Emergency Lane&&911^First Floor^Ann Arbor^MI^99999^USA^S&Service Location&HL70190^^WA^9876^^20100612^^^^^^^Attn: ED Doc in Charge|555-555-9110|Emergency Lane&&912^Medical Building I^Ann Arbor^MI^99999^USA^S&Service Location&HL70190^^WA^9876^^20100813^^^^^^^Attn: Office Manager|||||O^Outpatient Order^HL70482',
  'OBR|1|ORD777888^OrdFac^2.3.4.4^ISO|LAB4432^LabFac^8.7.6.4^ISO|51523-9^Grass Pollen Mix^LN|R|201506011608|201506011608|||||||||5742200012^Radon^Nicholas^^^^^^&372526&L^L^^^NPI|^WPN^PH^^1^555^5559908^34|||||201506011811|||F||1^^^20150601^^R|10092000194^Hamlin^Pafford^^^^^^&372526&L^L^^^NPI',
  'NTE|1||Allergy test interpretations are subjective.|RE|8945432^Gonzalez^Maria^^^^^^&372526&L^L^^^NPI|201506011810',
  'PRT|1^^372520^L|AD||RCT^Result Copies To^HL70912^^^^^^Send blind carbon copies to|10092000194^Hamlin^Pafford^^^^^^&372526&L^L^^^NPI||||||||||^^FX^^^323^5555555',
  'OBX|1|NM|6153-1^IgE Blue Grass Kentucky^LN|1|3.9|kU/L|<0.10|A^Abnormal^HL70078||N^None - generic normal range^HL70080|F|||201506011608|CentralLab^Central Laboratory^HL70624|1234^Observer^Test^^^^^^LabFac&8.7.6.5.4&&ISO|||201506011605||||||||||RSLT',
  'OBX|2|NM|6041-8^IgE Bermuda Grass^LN|2|0.59|kU/L|<0.10|A^Abnormal^HL70078||N^None - generic normal range^HL70080|F|||201506011608|CentralLab^Central Laboratory^HL70624|1234^Observer^Test^^^^^^LabFac&8.7.6.5.4&&ISO||||201506011605|||||||||RSLT',
  'OBX|3|SN|6265-3^IgE Timothy Grass^LN|3|<0.10|kU/L|<0.10|N^Normal^HL70078||N^None - generic normal range^HL70080|F|||201506011608|CentralLab^Central Laboratory^HL70624|1234^Observer^Test^^^^^^LabFac&8.7.6.5.4&&ISO||||201506011605|||||||||RSLT'
].join(CR);

/**
 * IG test_conversions.md, "#### ADT_A01".
 *
 * Its single OBX is `8302-2^Body Height^LN` with `190` and `cm^centimeter^UCUM` —
 * a LOINC-coded numeric with a UCUM unit whose *display* (`centimeter`) is not a
 * UCUM symbol, which is precisely the pair a mapper must not confuse.
 */
export const ADT_A01 = [
  'MSH|^~\\&|SndApp^1.2.3.4.5.2^ISO|SndFac^1.2.3.4.5.1^ISO|RcvApp^1.2.3.4.6.2^ISO|RcvFac^1.2.3.4.6.1^ISO|20150601135823+0100|ADTADM|ADT^A01^ADT_A01|4637382|P|2.5.1|||AL|NE|USA|ASCII|en|||SndOrg^L^0009^1^1000^AssignAuth&1.2.3.4.5&ISO^XX^AssignFac&1.2.3.4.5.3&ISO^^67890|RecOrg^L^0011^2^1000^AssignAuth&1.2.3.4.6&ISO^XX^AssignFac&1.2.3.4.5.6.3&ISO^^45678|^ftp://www.goodhealth.org/somearea/someapp^URI|^ftp://www.goodlab.org/somearea/someapp^URI',
  'EVN|A01|20150601135823+0100||ADT_EVENT|23432^Smith^Gordon^Denny^Jr^MD^^AssignAuth&1.2.3.4.5.6&ISO^L^9^1000^DN^ AssignFac&1.2.3.4.5.6.3&ISO^^G^20100101000000+0100^20330101000000+0100^doctor|20150601135822+0100|EventFac^1.2.3.4.5.4^ISO',
  'PID|1||1032702^^^V2FHIR&1.2.3.4.5&ISO^MR^AssignFac&1.2.3.4.5.6.3&ISO^20190101^20290101~N09204074^^^WADMV&1.3.4.7&ISO^DL^^20180601^20280531||Everywoman^Eve^L^Jr^Dr^^L^^^^G^20000909^20301231^PhD~Original^Eve^L^Jr^^^M^^^19700601&20000908^G|Madewell|197006010912|F||1002-5^American Indian or Alaska Native^HL70005~2106-3^White^HL70005|1000 House Lane^Appt 123^Ann Arbor ^MI^99999^USA^H^^WA~212 Resort Drive^^Miami^FL^99999^USA^V^^^^^^20210901^20211115||^PRN^PH^^1^555^555-8473~^NET^Internet^eve@test.test|^WPN^PH^^1^555^555-1126^12|en^English^HL70296|M^Married^HL70002|C^Catholic^HL70006|12345^^^ V2FHIR&1.2.3.4.5&ISO^AN|000-00-0000|J342342^^^MI&1.2.5.2.&ISO^DL||N^ Not Hispanic or Latino&HL70189|Indianapolis Indiana|Y|2|USA^United States^HL70399||||N|N||20150601135712|SndApp^1.2.3.4.5.2^ISO|||||364^Birch Creek Tribe^https://terminology.hl7.org/3.1.0/CodeSystem-v3-TribalEntityUS.html||^^internet^me@northpole.earth|',
  'PD1|||East Hospital^L^^^^AssignAuth&1.2.3.4.5.6&ISO^XX^ SndFac&1.2.3.4.5&ISO^^4324B|23432^Smith^Gordon^Denny^Jr^MD^^ AssignAuth&1.2.3.4.5.6&ISO^L^9^1000^DN^AssignFac&1.2.3.4.5.6.3&ISO^^G^20100101000000^20330101000000^doctor|N^Not a student^HL70231|W|U^Unknown^HL70315|||||||Pleasant Valley Church',
  'NK1||Everyone^Elliot^BRO^Brother^HL70396|123 High Street^^Mountainville^CA^99995',
  'PV1|1|E^EMERGENCY^HL70004|EMERG^101^01^^^^^^^^DEPID|E^Emergency^HL70007||EMERG^103^02^^^^^^^^DEPID|214425290^Doctor^Emory^E^Sr^Dr^MD^^AssignAuth&1.2.3.4.5.6&ISO^L^1^M10^NPI^AssignFac&1.2.3.4.5.6.3&ISO^^G^20100101000000^20330101000000^doctor|||EMR^Emergency^HL70069||||||VIP^very important person^HL70099|2144252903^Doctor^Emory^E^Sr^Dr^MD^^AssignAuth&1.2.3.4.5.6&ISO^L^1^M10^NPI^AssignFac&1.2.3.4.5.6.3&ISO^^G^20100101000000^20330101000000^doctor||81456267^^^ AssignAuth&1.2.3.4.5.6&ISO^VN||||||||||||||||||||Adm*Conf|||||20150601135800|||',
  'PV2||GENERAL|165002^Accident-prone^SNM||||||20150606|5||Address opportunities to be less accident prone.|214425290^Doctor^Emory^E^Sr^Dr^MD^^AssignAuth&1.2.3.4.5.6&ISO^L^1^M10^NPI^AssignFac&1.2.3.4.5.6.3&ISO^^G^20100101000000^20330101000000^doctor||||||||N^No Pubicity^HL70215|N|||2^Urgent^HL72017|||||||||||||A^Ambulance^HL70430||AC^Acute^HL70432',
  'OBX|1|NM|8302-2^Body Height^LN||190|cm^centimeter^UCUM|||||F|',
  'AL1|1|LA^Pollen Allergy^HL70127|^Timothy Grass|MO^Moderate^HL70128|Sneeze|',
  'IN1|1|||MyInsurancePlan||||||125189^^^MyInsurancePlan&1.2.3.7.4.2&ISO^SN|Acme^L&Legal&HL70396|20150101|20151231||HMO^Health Maintenance Organization^HL70086|Everywoman^Eve^L^Jr^Dr^^L^^^^G^20000909^20301231^PhD~Original^Eve^L^Jr^^^M^^^19700601&20000908^G|SEL^Self^HL70396||||||||||||||||||||||||||||||||125189^^^MyInsurancePlan&1.2.3.7.4.2&ISO^SN|',
  'IN3|||||||||||||||||||||Case Manager Smith|'
].join(CR);

/**
 * IG test_conversions.md, "#### MDM_T02", OBX segments only.
 *
 * OBX|4 is the IG's own example of a local identifier with a LOINC alternate:
 * `1111.2^PHQ-9 Depression Screen PDF^L^44249-1^PHQ-9 quick depression assessment
 * panel [Reported.PHQ]^LN`. `1111.2` is a code in the sender's dictionary; `44249-1`
 * is LOINC. Only the second may be published under http://loinc.org.
 */
export const MDM_T02_OBX = [
  'OBX|1|TX|85202^Transcription Authentication Interface Message Text|1|Transcription Authentication Interface Message Text||||||F',
  'OBX|3|ST|&GDT^Critical Values-String||Table formatting from the original result was not included.||||||F',
  'OBX|4|ED|1111.2^PHQ-9 Depression Screen PDF^L^44249-1^PHQ-9 quick depression assessment panel [Reported.PHQ]^LN||CareCoordination^AP^PDF^Base64^<Base64 encoded>||||||F'
];

/** The MDM_T02 header, for tests that need a message rather than a bare segment. */
export const MDM_T02_HEADER = 'MSH|^~\\&|HIE|REDDING HOSPITAL|||20230814022400||MDM^T02^MDM_T02|10819306|P|2.5.1';

/** Joins segments with the carriage return the wire format uses. */
export function message(...segments: string[]): string {
  return segments.join(CR);
}
