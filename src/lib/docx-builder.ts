import path from "path";
import fs from "fs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  Footer,
  PageNumber,
  NumberFormat,
  SectionType,
  convertInchesToTwip,
} from "docx";
import sharp from "sharp";
import type { QuestionPaper, PaperSection, PaperQuestion } from "@prisma/client";
import type { PaperHeaderConfig, PaperFooterConfig, NumberingFormat } from "@/lib/types";
import { formatQuestionLabel, formatSubquestionLabel } from "@/lib/types";
import {
  getSubquestions,
  getTopLevelQuestions,
} from "@/lib/paper-questions";

/**
 * Examint — DOCX Builder
 *
 * Builds a complete DOCX question paper from the QuestionPaper database record
 * and its related sections and questions.
 *
 * Library used: `docx` (MIT) — pure TypeScript DOCX generation.
 * Image embedding: `sharp` reads pixel dimensions of local image files, then
 * `docx` ImageRun embeds them as raw binary buffers.
 *
 * DOCX structure:
 *   1. Header section: styled table (logo left, school details right)
 *   2. Paper title (Bold, large)
 *   3. Instructions (if any)
 *   4. For each section:
 *      a. Section title (bold, underlined)
 *      b. Section instructions (italic, if any)
 *      c. For each question: numbered label + text/image + marks (right-aligned)
 *   5. Footer: page numbers (optional), signature line (optional), custom text
 */

/** Maximum width for embedded images in the document, in pixels. */
const MAX_IMAGE_WIDTH_PX = 500;

/** A4 page width in EMUs (English Metric Units). 1 inch = 914400 EMU. */
const A4_PAGE_WIDTH_EMU = 12240; // in twips (1 twip = 1/1440 inch); used with convertInchesToTwip

/** Uploads directory absolute path — images are stored here on the server. */
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

/**
 * Full paper data structure passed to `buildDocx()`.
 * Extends the Prisma model with nested relations.
 */
export interface FullPaperData {
  paper: QuestionPaper;
  sections: Array<
    PaperSection & {
      questions: PaperQuestion[];
    }
  >;
}

/**
 * Builds a DOCX file buffer from the given paper data.
 *
 * @param data - The complete paper with sections and questions from the DB.
 * @returns A Promise resolving to a Buffer containing the DOCX file bytes,
 *          ready to be streamed to the client as a download.
 */
export async function buildDocx(data: FullPaperData): Promise<Buffer> {
  const { paper, sections } = data;

  // Parse header and footer config from JSON strings stored in SQLite.
  const headerConfig: PaperHeaderConfig = JSON.parse(
    paper.headerConfig || "{}"
  );
  const footerConfig: PaperFooterConfig = JSON.parse(
    paper.footerConfig || "{}"
  );
  const numberingFormat = paper.numberingFormat as NumberingFormat;

  // Build document children (all block-level elements in the document body).
  const children: (Paragraph | Table)[] = [];

  // 1. Header table: logo on the left, school details on the right.
  const headerTable = await buildHeaderTable(headerConfig);
  if (headerTable) {
    children.push(headerTable);
    children.push(new Paragraph({ text: "" })); // spacer
  }

  // 2. Paper title.
  children.push(
    new Paragraph({
      text: paper.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    })
  );

  // 3. Global instructions (from headerConfig).
  if (headerConfig.instructions) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: headerConfig.instructions,
            italics: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  // 4. Sections and questions.
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  for (const section of sortedSections) {
    children.push(...(await buildSectionContent(section, numberingFormat)));
  }

  // 5. Signature line (footer area, added as body content since DOCX footers
  //    have limited formatting support in the `docx` library).
  if (footerConfig.signatureLine) {
    children.push(new Paragraph({ text: "" }));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${footerConfig.signatureLine}: _______________________`,
          }),
        ],
        spacing: { before: 400 },
      })
    );
  }

  if (footerConfig.customText) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: footerConfig.customText,
            italics: true,
            size: 18, // 9pt
          }),
        ],
        alignment: AlignmentType.CENTER,
      })
    );
  }

  // Build the DOCX Document.
  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        // Page number footer (if enabled).
        footers: footerConfig.showPageNumbers
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun("Page "),
                      new TextRun({
                        children: [PageNumber.CURRENT],
                      }),
                      new TextRun(" of "),
                      new TextRun({
                        children: [PageNumber.TOTAL_PAGES],
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
    numbering: {
      config: [
        {
          reference: "exam-numbering",
          levels: [
            {
              level: 0,
              format: NumberFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
  });

  return await Packer.toBuffer(doc);
}

/**
 * Builds the header table element containing the school logo (left column)
 * and school/exam details (right column).
 *
 * Layout:
 *   ┌─────────────┬──────────────────────────────────────┐
 *   │  [Logo]     │  School Name (bold, large)            │
 *   │             │  Subject | Class | Date               │
 *   └─────────────┴──────────────────────────────────────┘
 *
 * @param config - The parsed PaperHeaderConfig object.
 * @returns A Table element if there is any header content, or null if the
 *          header config is completely empty (newly created paper).
 */
async function buildHeaderTable(
  config: PaperHeaderConfig
): Promise<Table | null> {
  const hasContent =
    config.schoolName ||
    config.subject ||
    config.className ||
    config.date ||
    config.logoUrl;

  if (!hasContent) return null;

  // Build the logo cell content.
  const logoCellChildren: (Paragraph | Table)[] = [];
  if (config.logoUrl) {
    const logoImageRun = await buildImageRun(config.logoUrl, 80);
    if (logoImageRun) {
      logoCellChildren.push(
        new Paragraph({ children: [logoImageRun], alignment: AlignmentType.CENTER })
      );
    }
  }
  if (logoCellChildren.length === 0) {
    logoCellChildren.push(new Paragraph({ text: "" }));
  }

  // Build the school details cell content.
  const detailsCellChildren: Paragraph[] = [];

  if (config.schoolName) {
    detailsCellChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: config.schoolName,
            bold: true,
            size: 28, // 14pt
          }),
        ],
        alignment: AlignmentType.CENTER,
      })
    );
  }

  const metaLine = [config.subject, config.className, config.date]
    .filter(Boolean)
    .join("  |  ");

  if (metaLine) {
    detailsCellChildren.push(
      new Paragraph({
        children: [new TextRun({ text: metaLine, size: 22 })],
        alignment: AlignmentType.CENTER,
      })
    );
  }

  if (detailsCellChildren.length === 0) {
    detailsCellChildren.push(new Paragraph({ text: "" }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: logoCellChildren,
          }),
          new TableCell({
            width: { size: 80, type: WidthType.PERCENTAGE },
            children: detailsCellChildren,
          }),
        ],
      }),
    ],
  });
}

/**
 * Builds the DOCX content elements for a single paper section.
 *
 * @param section - The PaperSection with its nested questions array.
 * @param numberingFormat - The paper's numbering format (e.g. "1." or "Q1.").
 * @returns An array of Paragraph/Table elements for this section.
 */
async function buildSectionContent(
  section: PaperSection & { questions: PaperQuestion[] },
  numberingFormat: NumberingFormat
): Promise<(Paragraph | Table)[]> {
  const elements: (Paragraph | Table)[] = [];

  // Section title — bold, slightly larger.
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: section.title,
          bold: true,
          size: 24, // 12pt
          underline: {},
        }),
      ],
      spacing: { before: 400, after: 100 },
    })
  );

  // Section instructions (optional).
  if (section.instructions) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.instructions,
            italics: true,
            size: 20, // 10pt
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Top-level questions, sorted by order.
  const topLevelQuestions = getTopLevelQuestions(section.questions);

  for (let i = 0; i < topLevelQuestions.length; i++) {
    const question = topLevelQuestions[i];
    const label = formatQuestionLabel(i + 1, numberingFormat);
    const subquestions = getSubquestions(section.questions, question.id);
    const questionElements = await buildQuestionContent(
      question,
      label,
      subquestions
    );
    elements.push(...questionElements);
  }

  return elements;
}

/**
 * Builds DOCX content for a single question/content block.
 *
 * For text questions: a single Paragraph with the numbered label, the text,
 * and the marks right-aligned via tab stops.
 * For photo/diagram questions: the description paragraph followed by an
 * embedded ImageRun.
 *
 * @param question - The PaperQuestion record (uses snapshot fields, not source).
 * @param label - The pre-formatted label string (e.g. "Q3." or "(iii)").
 * @returns An array of Paragraph elements for this question.
 */
async function buildQuestionContent(
  question: PaperQuestion,
  label: string,
  subquestions: PaperQuestion[] = []
): Promise<Paragraph[]> {
  const elements: Paragraph[] = [];
  const hasSubs = subquestions.length > 0;
  const marksText =
    !hasSubs && question.marks > 0
      ? `[${question.marks} mark${question.marks !== 1 ? "s" : ""}]`
      : "";

  elements.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${label}  `, bold: true }),
        new TextRun({ text: question.snapshotText ?? "" }),
        ...(marksText
          ? [new TextRun({ text: `\t${marksText}`, bold: true })]
          : []),
      ],
      spacing: { before: 120, after: hasSubs ? 60 : 120 },
      tabStops: [
        {
          type: "right" as const,
          position: A4_PAGE_WIDTH_EMU - convertInchesToTwip(2),
        },
      ],
    })
  );

  if (question.snapshotImageUrl) {
    const imageRun = await buildImageRun(question.snapshotImageUrl, MAX_IMAGE_WIDTH_PX);
    if (imageRun) {
      elements.push(
        new Paragraph({
          children: [imageRun],
          spacing: { before: 80, after: hasSubs ? 60 : 200 },
        })
      );
    }
  }

  let subTotal = 0;
  for (let i = 0; i < subquestions.length; i++) {
    const sub = subquestions[i];
    const subLabel = formatSubquestionLabel(i + 1);
    subTotal += sub.marks;
    const subMarksText =
      sub.marks > 0
        ? `[${sub.marks} mark${sub.marks !== 1 ? "s" : ""}]`
        : "";

    elements.push(
      new Paragraph({
        children: [
          new TextRun({ text: `     ${subLabel}  `, bold: true }),
          new TextRun({ text: sub.snapshotText ?? "" }),
          ...(subMarksText
            ? [new TextRun({ text: `\t${subMarksText}`, bold: true })]
            : []),
        ],
        spacing: { before: 60, after: 60 },
        indent: { left: convertInchesToTwip(0.4) },
        tabStops: [
          {
            type: "right" as const,
            position: A4_PAGE_WIDTH_EMU - convertInchesToTwip(2),
          },
        ],
      })
    );

    if (sub.snapshotImageUrl) {
      const imageRun = await buildImageRun(sub.snapshotImageUrl, MAX_IMAGE_WIDTH_PX);
      if (imageRun) {
        elements.push(
          new Paragraph({
            children: [imageRun],
            spacing: { before: 60, after: 60 },
            indent: { left: convertInchesToTwip(0.4) },
          })
        );
      }
    }
  }

  if (hasSubs) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `\tTotal: ${subTotal} mark${subTotal !== 1 ? "s" : ""}`,
            bold: true,
          }),
        ],
        spacing: { before: 60, after: 200 },
        tabStops: [
          {
            type: "right" as const,
            position: A4_PAGE_WIDTH_EMU - convertInchesToTwip(2),
          },
        ],
      })
    );
  }

  return elements;
}

/**
 * Reads a local image file from the uploads directory, obtains its pixel
 * dimensions via `sharp`, and returns a `docx` ImageRun element.
 *
 * The image is scaled proportionally so its width does not exceed `maxWidthPx`.
 *
 * @param imageUrl - The relative image path as stored in the database
 *   (e.g. "/uploads/userId/uuid.jpg" or a bare filename).
 * @param maxWidthPx - Maximum width for the embedded image in pixels.
 * @returns An ImageRun element, or null if the file cannot be read.
 */
async function buildImageRun(
  imageUrl: string,
  maxWidthPx: number
): Promise<ImageRun | null> {
  try {
    // Resolve the local file path from the URL stored in the DB.
    // The DB stores paths like "/api/uploads/userId/file.jpg"; we strip the
    // API prefix and map to the filesystem uploads/ directory.
    const relativePath = imageUrl
      .replace(/^\/api\/uploads\//, "")
      .replace(/^\/uploads\//, "");

    const filePath = path.join(UPLOADS_DIR, relativePath);

    if (!fs.existsSync(filePath)) {
      console.warn(`[docx-builder] Image file not found: ${filePath}`);
      return null;
    }

    const imageBuffer = fs.readFileSync(filePath);

    // Use sharp to get the actual pixel dimensions of the image.
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width ?? maxWidthPx;
    const originalHeight = metadata.height ?? maxWidthPx;

    // Scale the image proportionally to fit within maxWidthPx.
    const scale = Math.min(1, maxWidthPx / originalWidth);
    const displayWidth = Math.round(originalWidth * scale);
    const displayHeight = Math.round(originalHeight * scale);

    return new ImageRun({
      data: imageBuffer,
      transformation: {
        width: displayWidth,
        height: displayHeight,
      },
    });
  } catch (err) {
    console.error(`[docx-builder] Failed to embed image ${imageUrl}:`, err);
    return null;
  }
}
