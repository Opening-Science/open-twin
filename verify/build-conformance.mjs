#!/usr/bin/env node
/**
 * Generates FHIR conformance resources from verify/conformance/declarations.json.
 *
 * The HL7 validator reports an unresolvable *extension* as an Error — unlike an
 * unresolvable CodeSystem, which is only a Warning. So once these are generated and
 * passed to the validator with `-ig`, the validator itself enforces that every
 * extension the connectors emit has been declared. There is no separate gate script
 * to drift out of sync: emitting an undeclared extension fails the build.
 *
 * This is the seed of the implementation guide. Publishing it properly, with SUSHI
 * and the IG Publisher, is connector-completion work; this exists so CI can validate
 * today rather than after the IG lands.
 *
 * Usage:  node verify/build-conformance.mjs [outDir]
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DECLARATIONS = JSON.parse(readFileSync(join(HERE, 'conformance', 'declarations.json'), 'utf8'));
const OUT = process.argv[2] ?? join(HERE, 'conformance', 'generated');
const BASE = DECLARATIONS.canonicalBase;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const write = (name, resource) => {
  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(resource, null, 2)}\n`);
};

/** Capitalised FHIR type name for an element definition, e.g. 'string' -> 'string'. */
const valueElement = (type) => ({ code: type });

function extensionElements(declaration) {
  const url = `${BASE}/StructureDefinition/${declaration.id}`;

  if (declaration.type !== 'complex') {
    return [
      {
        id: 'Extension',
        path: 'Extension',
        short: declaration.title,
        definition: declaration.description,
        min: 0,
        max: '1'
      },
      { id: 'Extension.extension', path: 'Extension.extension', max: '0' },
      { id: 'Extension.url', path: 'Extension.url', fixedUri: url },
      { id: 'Extension.value[x]', path: 'Extension.value[x]', min: 1, max: '1', type: [valueElement(declaration.type)] }
    ];
  }

  const elements = [
    {
      id: 'Extension',
      path: 'Extension',
      short: declaration.title,
      definition: declaration.description,
      min: 0,
      max: '1'
    },
    {
      id: 'Extension.extension',
      path: 'Extension.extension',
      slicing: { discriminator: [{ type: 'value', path: 'url' }], rules: 'open' },
      min: 0
    },
    { id: 'Extension.url', path: 'Extension.url', fixedUri: url },
    { id: 'Extension.value[x]', path: 'Extension.value[x]', max: '0' }
  ];

  for (const sub of declaration.subExtensions) {
    elements.push(
      {
        id: `Extension.extension:${sub.id}`,
        path: 'Extension.extension',
        sliceName: sub.id,
        short: sub.title,
        definition: sub.description,
        min: 0,
        max: '1'
      },
      { id: `Extension.extension:${sub.id}.extension`, path: 'Extension.extension.extension', max: '0' },
      { id: `Extension.extension:${sub.id}.url`, path: 'Extension.extension.url', fixedUri: sub.id },
      {
        id: `Extension.extension:${sub.id}.value[x]`,
        path: 'Extension.extension.value[x]',
        min: 1,
        max: '1',
        type: [valueElement(sub.type)]
      }
    );
  }
  return elements;
}

let count = 0;

for (const declaration of DECLARATIONS.extensions) {
  write(`StructureDefinition-${declaration.id}`, {
    resourceType: 'StructureDefinition',
    id: declaration.id,
    url: `${BASE}/StructureDefinition/${declaration.id}`,
    version: '0.1.0',
    name: declaration.id.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase()),
    title: declaration.title,
    status: 'draft',
    description: declaration.description,
    fhirVersion: '4.0.1',
    kind: 'complex-type',
    abstract: false,
    context: declaration.context.map((expression) => ({ type: 'element', expression })),
    type: 'Extension',
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Extension',
    derivation: 'constraint',
    differential: { element: extensionElements(declaration) }
  });
  count++;
}

for (const system of DECLARATIONS.codeSystems) {
  write(`CodeSystem-${system.id}`, {
    resourceType: 'CodeSystem',
    id: system.id,
    url: `${BASE}/CodeSystem/${system.id}`,
    version: '0.1.0',
    name: system.id.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase()),
    title: system.title,
    status: 'draft',
    description: system.description,
    caseSensitive: true,
    // The vendors' concept spaces are open — VITRONIC measurement paths in
    // particular are per-scan — so the codes are deliberately not enumerated.
    // `not-present` says exactly that, rather than claiming a complete list.
    content: 'not-present'
  });
  count++;
}

console.log(`Wrote ${count} conformance resources to ${OUT}`);
console.log('Pass to the validator with:  -ig verify/conformance/generated');
