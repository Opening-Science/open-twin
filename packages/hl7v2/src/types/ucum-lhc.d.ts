/**
 * Minimal ambient types for `@lhncbc/ucum-lhc`, which ships no declarations.
 *
 * `@open-twin/fhir-core` declares the same module for its own test, but ambient
 * declarations do not cross package boundaries, so this package carries its own.
 *
 * The package is CommonJS with `exports.UcumLhcUtils = ...` and no `type` or
 * `exports` field. Only the named export is declared: the default import resolves
 * to `undefined` under some ES module loaders, so declaring it would type-check a
 * call that throws at run time.
 */
declare module '@lhncbc/ucum-lhc' {
  interface ValidationResult {
    status: 'valid' | 'invalid' | 'error';
    ucumCode?: string | null;
    msg?: string[];
    suggestions?: unknown;
  }

  interface ConversionResult {
    status: 'succeeded' | 'failed' | 'error';
    toVal?: number | null;
    msg?: string[];
  }

  interface UcumLhcUtilsInstance {
    validateUnitString(unitString: string, suggest?: boolean): ValidationResult;
    convertUnitTo(fromUnitCode: string, fromVal: number, toUnitCode: string, suggest?: boolean): ConversionResult;
  }

  interface UcumLhcUtilsFactory {
    getInstance(): UcumLhcUtilsInstance;
  }

  const UcumLhcUtils: UcumLhcUtilsFactory;

  export {
    type ConversionResult,
    UcumLhcUtils,
    type UcumLhcUtilsFactory,
    type UcumLhcUtilsInstance,
    type ValidationResult
  };
}
