#!/usr/bin/env bash
# Deterministic Synthea FHIR R4 cohort (N=100). Recipe only — output is gitignored.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$ROOT/version.lock"

POPULATION="${SYNTHEA_POPULATION:-100}"
SEED="${SYNTHEA_SEED:-42}"
CLINICIAN_SEED="${SYNTHEA_CLINICIAN_SEED:-43}"
STATE="${SYNTHEA_STATE:-Massachusetts}"
JAVA_MAJOR_REQUIRED=21

CACHE_DIR="$ROOT/.cache"
OUT_DIR="$ROOT/out"
JAR="$CACHE_DIR/synthea-with-dependencies.jar"
PROPS="$ROOT/synthea.properties"

die() {
  echo "synthea: $*" >&2
  exit 1
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
  actual="$(shasum -a 256 "$JAR" | awk '{print $1}')"
  [[ "$actual" == "$SYNTHEA_JAR_SHA256" ]] ||
    die "JAR checksum mismatch (expected $SYNTHEA_JAR_SHA256, got $actual). Delete $JAR and re-run."
}

write_manifest() {
  local patient_count config_sha
  patient_count="$(find "$OUT_DIR/fhir" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
  config_sha="$(shasum -a 256 "$PROPS" "$ROOT/version.lock" | shasum -a 256 | awk '{print $1}')"
  cat >"$OUT_DIR/manifest.json" <<EOF
{
  "syntheaVersion": "$SYNTHEA_VERSION",
  "jarSha256": "$SYNTHEA_JAR_SHA256",
  "seed": $SEED,
  "clinicianSeed": $CLINICIAN_SEED,
  "population": $POPULATION,
  "state": "$STATE",
  "exporter": "fhir",
  "configHash": "$config_sha",
  "patientFileCount": $patient_count
}
EOF
}

require_java
ensure_jar
[[ -f "$PROPS" ]] || die "missing $PROPS"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "synthea: generating N=$POPULATION seed=$SEED clinicianSeed=$CLINICIAN_SEED ($SYNTHEA_VERSION)"
(
  cd "$ROOT"
  java -jar "$JAR" \
    -c "$PROPS" \
    -s "$SEED" \
    -cs "$CLINICIAN_SEED" \
    -p "$POPULATION" \
    "$STATE"
)

write_manifest
echo "synthea: wrote $OUT_DIR/manifest.json"
cat "$OUT_DIR/manifest.json"
