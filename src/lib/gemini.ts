import type { GeminiExtractedBlock, ContentItemType, CONTENT_ITEM_TYPES as _ } from "@/lib/types";
import { CONTENT_ITEM_TYPES } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";

/**
 * Examint — Google Gemini Vision API Wrapper
 *
 * This module handles all communication with the Google Gemini 3.6 Flash API.
 * It is called exclusively from the `/api/extract` route handler (server-side only).
 *
 * API used: Gemini 3.6 Flash (gemini-3.6-flash)
 * - Free tier: 15 requests per minute per API key.
 * - Each teacher uses their own Google AI Studio key, so quota is per-teacher.
 * - Input: base64-encoded image (JPEG/PNG/WebP) + structured text prompt.
 * - Output: JSON array of extracted content blocks.
 *
 * The prompt instructs Gemini to return a JSON array so we can parse it
 * deterministically without relying on freeform text parsing.
 */

/** Gemini REST API base URL. Uses the stable v1 endpoint. */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1";

/** Model name for Gemini 3.6 Flash — current stable model as of 2026. */
const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * The structured extraction prompt sent to Gemini with each image.
 *
 * The prompt:
 * 1. Instructs Gemini to analyse the image as educational content.
 * 2. Asks it to identify and categorise each distinct block of content.
 * 3. Specifies the exact JSON output format so we can parse reliably.
 * 4. For photo/diagram regions, asks for a brief AI-generated description
 *    instead of attempting OCR (images are stored separately).
 */
const EXTRACTION_PROMPT = `You are an educational content extractor. Analyse this image which contains content from a school textbook, handout, or question paper.

Identify each distinct block of content and classify it into one of these types:
- "question": A numbered or lettered exam question or exercise
- "paragraph": A block of explanatory or descriptive text
- "heading": A section title or chapter heading
- "diagram": A chart, graph, table, or technical drawing
- "photo": A photograph or realistic illustration
- "other": Anything that does not fit the above categories

Return ONLY a valid JSON array (no markdown, no explanation) in exactly this format:
[
  { "type": "question", "text": "What is the SI unit of force?" },
  { "type": "paragraph", "text": "Newton's second law states that..." },
  { "type": "diagram", "text": "Bar chart showing rainfall data for 2023" }
]

Rules:
- For text content (question, paragraph, heading, other): copy the text verbatim from the image.
- For visual content (diagram, photo): write a brief one-sentence description of what is shown.
- Preserve the reading order (top-to-bottom, left-to-right).
- If the image contains only a diagram or photo with no text, return a single item describing it.
- Do not include page numbers, headers, or footers as separate items.
- Return an empty array [] only if the image contains no educational content.`;

/**
 * Represents the raw response structure from the Gemini generateContent API.
 * Only the fields we actually use are typed here.
 */
interface GeminiAPIResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Sends a base64-encoded image to the Gemini 1.5 Flash API and extracts
 * structured content blocks from it.
 *
 * @param imageBase64 - The image encoded as a base64 string (without the
 *   "data:image/..." prefix — just the raw base64 data).
 * @param mimeType - The MIME type of the image ("image/jpeg", "image/png",
 *   or "image/webp"). Must match the actual image format.
 * @param apiKey - The teacher's personal Google AI Studio API key, decrypted
 *   from the database before this call.
 * @returns A promise that resolves to an array of GeminiExtractedBlock objects.
 * @throws Error with a descriptive message on API failure, quota exhaustion,
 *   or malformed response.
 */
export async function extractContentFromImage(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  apiKey: string
): Promise<GeminiExtractedBlock[]> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            // The text prompt instructs Gemini on how to process the image.
            text: EXTRACTION_PROMPT,
          },
          {
            // The image is sent inline as base64. Gemini supports images up
            // to 20 MB in base64 form; our sharp resize step keeps it well below.
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      /**
       * temperature: 0.1 — very low temperature for deterministic, factual
       * extraction. We do not want creative variations in the output.
       */
      temperature: 0.1,
      /**
       * responseMimeType: instructs Gemini to return its response as JSON.
       * This is the "structured output" mode and reduces hallucinated formatting.
       */
      responseMimeType: "application/json",
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    throw new Error(
      `Network error while contacting Gemini API: ${String(networkError)}. ` +
        "Please check your internet connection and try again."
    );
  }

  const data: GeminiAPIResponse = await response.json();

  // Handle API-level errors (invalid key, quota exceeded, etc.)
  if (!response.ok || data.error) {
    const errorMessage = data.error?.message ?? `HTTP ${response.status}`;
    const errorCode = data.error?.code ?? response.status;

    if (errorCode === 400 && errorMessage.includes("API_KEY_INVALID")) {
      throw new Error(
        "Invalid Gemini API key. Please check your key in Settings and try again."
      );
    }
    if (errorCode === 429) {
      throw new Error(
        "Gemini API quota exceeded (15 requests/minute). Please wait a moment and try again."
      );
    }
    throw new Error(`Gemini API error (${errorCode}): ${errorMessage}`);
  }

  // Extract the text content from the first candidate.
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error(
      "Gemini returned an empty response. The image may not contain recognisable content."
    );
  }

  // Parse the JSON array returned by Gemini.
  return parseGeminiResponse(rawText);
}

/**
 * Parses and validates the raw text response from Gemini into an array of
 * GeminiExtractedBlock objects.
 *
 * Gemini is prompted to return only valid JSON, but we still sanitise the
 * output defensively in case it includes markdown fences or extra whitespace.
 *
 * @param rawText - The raw text string from the Gemini API response.
 * @returns Validated array of GeminiExtractedBlock objects.
 * @throws Error if the response cannot be parsed as a valid JSON array.
 */
function parseGeminiResponse(rawText: string): GeminiExtractedBlock[] {
  // Strip potential markdown code fences (```json ... ```) that Gemini
  // sometimes adds despite being instructed not to.
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Gemini returned a response that is not valid JSON. Raw response: "${rawText.slice(0, 200)}"`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Gemini response is not a JSON array as expected. Please try again."
    );
  }

  // Validate and normalise each block, filtering out malformed entries.
  const blocks: GeminiExtractedBlock[] = [];
  for (const item of parsed) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).text === "string" &&
      typeof (item as Record<string, unknown>).type === "string"
    ) {
      const raw = item as { type: string; text: string };
      // Normalise the type — if Gemini returns an unrecognised type, fall
      // back to "other" so the block is still shown to the teacher.
      const type: ContentItemType = (
        CONTENT_ITEM_TYPES as string[]
      ).includes(raw.type)
        ? (raw.type as ContentItemType)
        : "other";

      blocks.push({ type, text: raw.text.trim() });
    }
  }

  return blocks;
}

/**
 * Makes a minimal Gemini API call to verify that the provided API key is valid.
 * Used by the "Test Key" button on the Teacher Settings page.
 *
 * @param apiKey - The API key to test (plain text, not encrypted).
 * @returns `{ valid: true }` if the key works, or `{ valid: false, error: string }`
 *          if the key is invalid or the network request fails.
 */
export async function testGeminiApiKey(
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Say the word: OK" }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });

    const data: GeminiAPIResponse = await response.json();

    if (data.error) {
      return { valid: false, error: data.error.message };
    }

    return { valid: response.ok };
  } catch (err) {
    return {
      valid: false,
      error: `Network error: ${String(err)}`,
    };
  }
}

/**
 * Returns the decrypted Gemini API key for a user.
 * Used by server-side routes (e.g. /api/extract) that call Gemini.
 */
export async function getDecryptedGeminiKey(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiApiKey: true },
  });

  if (!user?.geminiApiKey) return "";
  return decrypt(user.geminiApiKey);
}
