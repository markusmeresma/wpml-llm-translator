import { DOMParser } from "@xmldom/xmldom";

import { splitHtmlIntoSegments } from "./html-splitter.js";

export interface HtmlSegment {
  index: number;
  text: string;
}

export interface ParsedXliffUnit {
  unitKey: string;
  resname: string | null;
  restype: string | null;
  sourceText: string;
  sourceHtmlTemplate?: string;
  segments?: HtmlSegment[];
}

export interface ParsedXliffFile {
  originalAttr: string;
  externalHref: string | null;
  units: ParsedXliffUnit[];
}

interface ParseXliffOptions {
  fileKey: string;
  xml: string;
}

function getFirstElementText(element: Element | null): string {
  if (!element) {
    return "";
  }

  const parts: string[] = [];

  for (let i = 0; i < element.childNodes.length; i += 1) {
    const child = element.childNodes.item(i);

    if (child.nodeType === child.TEXT_NODE || child.nodeType === child.CDATA_SECTION_NODE) {
      parts.push(child.nodeValue ?? "");
    }
  }

  return parts.join("");
}

export function parseXliffFile(options: ParseXliffOptions): ParsedXliffFile {
  const parser = new DOMParser({
    errorHandler: {
      warning() {},
      error() {},
      fatalError() {}
    }
  });

  const doc = parser.parseFromString(options.xml, "application/xml");
  const parseErrors = doc.getElementsByTagName("parsererror");

  if (parseErrors.length > 0) {
    throw new Error(`Invalid XML in ${options.fileKey}`);
  }

  const fileNodes = doc.getElementsByTagName("file");

  if (fileNodes.length !== 1) {
    throw new Error(`Expected exactly one <file> in ${options.fileKey}, found ${fileNodes.length}`);
  }

  const fileNode = fileNodes.item(0);

  if (!fileNode) {
    throw new Error(`Missing <file> node in ${options.fileKey}`);
  }

  const originalAttr = fileNode.getAttribute("original");

  if (!originalAttr) {
    throw new Error(`Missing <file original=\"...\"> in ${options.fileKey}`);
  }

  const externalFileNodes = fileNode.getElementsByTagName("external-file");
  const externalFileNode = externalFileNodes.length > 0 ? externalFileNodes.item(0) : null;
  const externalHref = externalFileNode?.getAttribute("href") ?? null;

  const unitNodes = fileNode.getElementsByTagName("trans-unit");
  const units: ParsedXliffUnit[] = [];

  for (let index = 0; index < unitNodes.length; index += 1) {
    const unitNode = unitNodes.item(index);

    if (!unitNode) {
      continue;
    }

    const unitKey = unitNode.getAttribute("id");

    if (!unitKey) {
      throw new Error(`trans-unit without id in ${options.fileKey} at position ${index}`);
    }

    const sourceNodes = unitNode.getElementsByTagName("source");
    const sourceNode = sourceNodes.item(0);

    if (!sourceNode) {
      throw new Error(`trans-unit ${unitKey} has no <source> in ${options.fileKey}`);
    }

    const sourceText = getFirstElementText(sourceNode);
    const splitResult = splitHtmlIntoSegments(sourceText);

    const unit: ParsedXliffUnit = {
      unitKey,
      resname: unitNode.getAttribute("resname"),
      restype: unitNode.getAttribute("restype"),
      sourceText
    };

    if (splitResult) {
      unit.sourceHtmlTemplate = splitResult.template;
      unit.segments = splitResult.segments.map((text, i) => ({
        index: i + 1,
        text
      }));
    }

    units.push(unit);
  }

  return {
    originalAttr,
    externalHref,
    units
  };
}
