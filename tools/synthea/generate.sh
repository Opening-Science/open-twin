#!/usr/bin/env bash
# Deterministic Synthea FHIR R4 cohort (N=100 by default). Recipe only — output is gitignored.
# Every input is an optional SYNTHEA_* environment variable; see docs/synthea.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$ROOT/version.lock"

POPULATION="${SYNTHEA_POPULATION:-100}"
SEED="${SYNTHEA_SEED:-42}"
CLINICIAN_SEED="${SYNTHEA_CLINICIAN_SEED:-43}"
STATE="${SYNTHEA_STATE:-Massachusetts}"
# Synthea simulates up to "now" unless given dates, so without these two runs of
# the same seed differ by however far apart they started. Read in UTC (see below).
REFERENCE_DATE="${SYNTHEA_REFERENCE_DATE:-20260101}"
END_DATE="${SYNTHEA_END_DATE:-20260101}"
# Optional cohort filters, all off by default.
AGE="${SYNTHEA_AGE:-}"                   # MIN-MAX on the reference date, e.g. 40-75
GENDER="${SYNTHEA_GENDER:-}"             # M or F
CITY="${SYNTHEA_CITY:-}"                 # a city Synthea knows in $STATE
KEEP_MODULE="${SYNTHEA_KEEP_MODULE:-}"   # keep module JSON: only people it keeps are written
MODULES_DIR="${SYNTHEA_MODULES_DIR:-}"   # extra modules (e.g. Module Builder exports)
JAVA_MAJOR_REQUIRED=21

CACHE_DIR="$ROOT/.cache"
OUT_DIR="${SYNTHEA_OUT_DIR:-$ROOT/out}"
JAR="$CACHE_DIR/synthea-with-dependencies.jar"
PROPS="$ROOT/synthea.properties"

die() {
  echo "synthea: $*" >&2
  exit 1
}

# shasum ships with macOS and most Linux installs; sha256sum is the coreutils
# fallback. Both print "<hash>  <name>", so hashes built from either agree.
if command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  SHA256=(sha256sum)
fi

sha256_of() {
  "${SHA256[@]}" | awk '{print $1}'
}

json_string_or_null() {
  if [[ -n "$1" ]]; then printf '"%s"' "$1"; else printf 'null'; fi
}

validate_filters() {
  if [[ -n "$AGE" ]]; then
    [[ "$AGE" =~ ^([0-9]{1,3})-([0-9]{1,3})$ ]] || die "SYNTHEA_AGE must be MIN-MAX, e.g. 40-75, got: $AGE"
    ((10#${BASH_REMATCH[1]} <= 10#${BASH_REMATCH[2]})) || die "SYNTHEA_AGE minimum is above maximum: $AGE"
  fi
  [[ -z "$GENDER" || "$GENDER" == "M" || "$GENDER" == "F" ]] || die "SYNTHEA_GENDER must be M or F, got: $GENDER"
  [[ "$STATE" =~ ^[A-Za-z][A-Za-z\ .\'-]*$ ]] || die "SYNTHEA_STATE must be a US state name, got: $STATE"
  [[ -z "$CITY" || "$CITY" =~ ^[A-Za-z][A-Za-z\ .\'-]*$ ]] || die "SYNTHEA_CITY must be a city name, got: $CITY"
  [[ -z "$KEEP_MODULE" || -f "$KEEP_MODULE" ]] || die "SYNTHEA_KEEP_MODULE is not a file: $KEEP_MODULE"
  [[ -z "$MODULES_DIR" || -d "$MODULES_DIR" ]] || die "SYNTHEA_MODULES_DIR is not a folder: $MODULES_DIR"
  return 0
}

# The output folder is deleted and recreated on every run. Refuse folders that
# hold anything this script did not write, so a mistyped SYNTHEA_OUT_DIR cannot
# delete unrelated files. Only the chosen folder itself is ever removed.
prepare_out_dir() {
  [[ -n "$OUT_DIR" ]] || die "SYNTHEA_OUT_DIR is empty"
  mkdir -p "$OUT_DIR"
  OUT_DIR="$(cd "$OUT_DIR" && pwd)"
  case "$OUT_DIR" in
    / | "$HOME" | "$ROOT" | "$(cd "$ROOT/../.." && pwd)") die "refusing to use $OUT_DIR as the output folder" ;;
  esac
  local entry
  for entry in "$OUT_DIR"/* "$OUT_DIR"/.[!.]*; do
    [[ -e "$entry" ]] || continue
    case "$(basename "$entry")" in
      fhir | metadata | x12 | modules | manifest.json | keep-module.json) ;;
      *) die "$OUT_DIR holds files this script did not write ($(basename "$entry")); use an empty folder" ;;
    esac
  done
  rm -rf "$OUT_DIR"
  mkdir -p "$OUT_DIR"
}

# Hash over file contents and names relative to the folder, never absolute paths,
# so the same modules in two places hash the same.
modules_hash() {
  (cd "$1" && find . -type f -name '*.json' -print0 | LC_ALL=C sort -z | xargs -0 "${SHA256[@]}") | sha256_of
}

# The same value as `cd fhir && sha256sum *.json | sort | sha256sum` (below).
fhir_content_hash() {
  (cd "$OUT_DIR/fhir" && find . -maxdepth 1 -type f -name '*.json' -print0 | xargs -0 "${SHA256[@]}") |
    sed 's#  \./#  #' | LC_ALL=C sort | sha256_of
}

require_java() {
  command -v java >/dev/null 2>&1 || die "Java $JAVA_MAJOR_REQUIRED+ is required (java not on PATH)"
  local ver major
  ver="$(java -version 2>&1 | head -n1)"
  major="$(java -XshowSettings:properties -version 2>&1 | awk -F= '/java.specification.version/ {gsub(/ /,"",$2); print $2; exit}')"
  case "$major" in
    1.*) major="${major#1.}" ;;
  esac
  major="${major%%.*}"
  [[ -n "$major" && "$major" -ge "$JAVA_MAJOR_REQUIRED" ]] ||
    die "Java $JAVA_MAJOR_REQUIRED+ required; found: $ver"
}

ensure_jar() {
  mkdir -p "$CACHE_DIR"
  if [[ ! -f "$JAR" ]]; then
    command -v curl >/dev/null 2>&1 || die "curl is required to download the Synthea JAR"
    echo "synthea: downloading $SYNTHEA_VERSION …"
    curl -fsSL -o "$JAR.partial" "$SYNTHEA_JAR_URL"
    mv "$JAR.partial" "$JAR"
  fi
  local actual
  actual="$(sha256_of <"$JAR")"
  [[ "$actual" == "$SYNTHEA_JAR_SHA256" ]] ||
    die "JAR checksum mismatch (expected $SYNTHEA_JAR_SHA256, got $actual). Delete $JAR and re-run."
}

write_manifest() {
  local patient_count config_sha keep_sha="" modules_sha="" content_sha
  patient_count="$(find "$OUT_DIR/fhir" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
  # Hash file contents only. Hashing shasum's output also hashed the paths, so the
  # same config gave a different hash in every checkout.
  config_sha="$(cat "$PROPS" "$ROOT/version.lock" | sha256_of)"
  # Copies of the inputs next to the manifest, so the output folder alone can be rerun.
  if [[ -n "$KEEP_MODULE" ]]; then
    cp "$KEEP_MODULE" "$OUT_DIR/keep-module.json"
    keep_sha="$(sha256_of <"$KEEP_MODULE")"
  fi
  if [[ -n "$MODULES_DIR" ]]; then
    cp -R "$MODULES_DIR/." "$OUT_DIR/modules"
    modules_sha="$(modules_hash "$MODULES_DIR")"
  fi
  content_sha="$(fhir_content_hash)"
  cat >"$OUT_DIR/manifest.json" <<EOF
{
  "syntheaVersion": "$SYNTHEA_VERSION",
  "jarSha256": "$SYNTHEA_JAR_SHA256",
  "seed": $SEED,
  "clinicianSeed": $CLINICIAN_SEED,
  "population": $POPULATION,
  "state": "$STATE",
  "referenceDate": "$REFERENCE_DATE",
  "endDate": "$END_DATE",
  "city": $(json_string_or_null "$CITY"),
  "age": $(json_string_or_null "$AGE"),
  "gender": $(json_string_or_null "$GENDER"),
  "keepModuleSha256": $(json_string_or_null "$keep_sha"),
  "modulesDirSha256": $(json_string_or_null "$modules_sha"),
  "exporter": "fhir",
  "configHash": "$config_sha",
  "patientFileCount": $patient_count,
  "fhirContentSha256": "$content_sha"
}
EOF
}

# Synthea parses dates leniently (20260230 becomes 2 March), so reject anything
# that is not a real calendar date rather than record a date Synthea didn't use.
valid_date() {
  [[ "$1" =~ ^[0-9]{8}$ ]] || return 1
  local y=$((10#${1:0:4})) m=$((10#${1:4:2})) d=$((10#${1:6:2})) max
  case "$m" in
    1 | 3 | 5 | 7 | 8 | 10 | 12) max=31 ;;
    4 | 6 | 9 | 11) max=30 ;;
    2) max=$((y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) ? 29 : 28)) ;;
    *) return 1 ;;
  esac
  ((d >= 1 && d <= max))
}

valid_date "$REFERENCE_DATE" || die "SYNTHEA_REFERENCE_DATE must be a real date as YYYYMMDD, got: $REFERENCE_DATE"
valid_date "$END_DATE" || die "SYNTHEA_END_DATE must be a real date as YYYYMMDD, got: $END_DATE"
validate_filters

require_java
ensure_jar
[[ -f "$PROPS" ]] || die "missing $PROPS"

prepare_out_dir

filters=()
[[ -n "$AGE" ]] && filters+=(-a "$AGE")
[[ -n "$GENDER" ]] && filters+=(-g "$GENDER")
[[ -n "$KEEP_MODULE" ]] && filters+=(-k "$(cd "$(dirname "$KEEP_MODULE")" && pwd)/$(basename "$KEEP_MODULE")")
[[ -n "$MODULES_DIR" ]] && filters+=(-d "$(cd "$MODULES_DIR" && pwd)")
place=("$STATE")
[[ -n "$CITY" ]] && place+=("$CITY")

echo "synthea: generating N=$POPULATION seed=$SEED clinicianSeed=$CLINICIAN_SEED reference=$REFERENCE_DATE end=$END_DATE ($SYNTHEA_VERSION)"
(
  cd "$ROOT"
  # Synthea reads the dates in the JVM's time zone; UTC keeps output the same on
  # every machine.
  java -Duser.timezone=UTC -jar "$JAR" \
    -c "$PROPS" \
    -s "$SEED" \
    -cs "$CLINICIAN_SEED" \
    -p "$POPULATION" \
    -r "$REFERENCE_DATE" \
    -e "$END_DATE" \
    ${filters[@]+"${filters[@]}"} \
    "--exporter.baseDirectory=$OUT_DIR/" \
    "${place[@]}"
)

write_manifest
echo "synthea: wrote $OUT_DIR/manifest.json"
cat "$OUT_DIR/manifest.json"
