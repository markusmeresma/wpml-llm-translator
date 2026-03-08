const UNIT_KEY_RE = /^field-[a-z][a-z0-9_]*-\d+-\d+$/;
const SOURCE_VALUE_RE = /^[a-z][a-z0-9_]*$/;

export function isAcfLayoutUnit(unitKey: string, sourceText: string): boolean {
  return UNIT_KEY_RE.test(unitKey) && SOURCE_VALUE_RE.test(sourceText);
}
