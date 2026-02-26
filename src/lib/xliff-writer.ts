import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export interface RebuildXliffInput {
  fileKey: string;
  xml: string;
  translationsByUnitKey: Map<string, string>;
}

export interface RebuildXliffResult {
  xml: string;
  updatedCount: number;
  missingUnitKeys: string[];
}

function getOrCreateTargetNode(unitNode: Element, document: Document): Element {
  const existingTarget = unitNode.getElementsByTagName("target").item(0);

  if (existingTarget) {
    return existingTarget;
  }

  const targetNode = document.createElement("target");
  unitNode.appendChild(targetNode);
  return targetNode;
}

function replaceWithCData(targetNode: Element, value: string, document: Document): void {
  while (targetNode.firstChild) {
    targetNode.removeChild(targetNode.firstChild);
  }

  targetNode.appendChild(document.createCDATASection(value));
}

export function rebuildXliffTargets(input: RebuildXliffInput): RebuildXliffResult {
  const parser = new DOMParser({
    errorHandler: {
      warning() {},
      error() {},
      fatalError() {}
    }
  });

  const document = parser.parseFromString(input.xml, "application/xml");
  const parseErrors = document.getElementsByTagName("parsererror");

  if (parseErrors.length > 0) {
    throw new Error(`Invalid XML in ${input.fileKey}`);
  }

  const foundUnitKeys = new Set<string>();
  let updatedCount = 0;
  const transUnits = document.getElementsByTagName("trans-unit");

  for (let index = 0; index < transUnits.length; index += 1) {
    const transUnit = transUnits.item(index);

    if (!transUnit) {
      continue;
    }

    const unitKey = transUnit.getAttribute("id");

    if (!unitKey) {
      continue;
    }

    const replacement = input.translationsByUnitKey.get(unitKey);

    if (replacement === undefined) {
      continue;
    }

    const targetNode = getOrCreateTargetNode(transUnit, document);
    replaceWithCData(targetNode, replacement, document);

    foundUnitKeys.add(unitKey);
    updatedCount += 1;
  }

  const missingUnitKeys = [...input.translationsByUnitKey.keys()].filter((key) => !foundUnitKeys.has(key));
  const outputXml = new XMLSerializer().serializeToString(document);

  return {
    xml: outputXml,
    updatedCount,
    missingUnitKeys
  };
}
