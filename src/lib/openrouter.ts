import OpenAI from "openai";

import { getEnv } from "./env.js";

export interface TranslateUnitInput {
  sourceLang: string;
  targetLang: string;
  resname?: string | null;
  restype?: string | null;
  sourceText: string;
}

let openRouterClient: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
  if (openRouterClient) {
    return openRouterClient;
  }

  const env = getEnv();

  openRouterClient = new OpenAI({
    apiKey: env.openRouterApiKey,
    baseURL: "https://openrouter.ai/api/v1"
  });

  return openRouterClient;
}

function buildPrompt(input: TranslateUnitInput): string {
  return `You are translating website content.

Source language: ${input.sourceLang}
Target language: ${input.targetLang}

Content context:
- resname: ${input.resname ?? "n/a"}
- restype: ${input.restype ?? "n/a"}

Rules:
- Translate naturally for a professional B2B website.
- Preserve any HTML tags exactly as they appear.
- Do not add or remove tags, placeholders, or product codes.
- Do not add explanations or commentary.
- Return only the translated text.

Text to translate:
<<<
${input.sourceText}
>>>`;
}

interface TextContentPart {
  type: "text";
  text: string;
}

function isTextContentPart(part: unknown): part is TextContentPart {
  if (!part || typeof part !== "object") {
    return false;
  }

  const candidate = part as Record<string, unknown>;
  return candidate.type === "text" && typeof candidate.text === "string";
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const joined = content
      .filter(isTextContentPart)
      .map((part) => part.text)
      .join("")
      .trim();

    return joined;
  }

  return "";
}

export interface TranslateResult {
  text: string;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export async function translateWithOpenRouter(input: TranslateUnitInput): Promise<TranslateResult> {
  const env = getEnv();
  const client = getOpenRouterClient();
  const prompt = buildPrompt(input);

  const start = performance.now();

  const completion = await client.chat.completions.create({
    model: env.openRouterModel,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const durationMs = Math.round(performance.now() - start);

  const content = completion.choices[0]?.message?.content;
  const translatedText = extractTextContent(content);

  if (!translatedText) {
    throw new Error("OpenRouter returned an empty translation");
  }

  return {
    text: translatedText,
    durationMs,
    promptTokens: completion.usage?.prompt_tokens ?? null,
    completionTokens: completion.usage?.completion_tokens ?? null
  };
}
