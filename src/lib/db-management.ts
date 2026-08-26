import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Metadata for a single Prisma model field. */
export interface FieldMeta {
  name: string;
  kind: string;
  type: string;
  isRequired: boolean;
  isId: boolean;
  isUnique: boolean;
  isList: boolean;
  isUpdatedAt: boolean;
  hasDefaultValue: boolean;
  relationName?: string | null;
  relationFromFields?: string[];
}

/** Metadata for a single Prisma model (camelCase delegate name). */
export interface ModelMeta {
  name: string;
  fields: FieldMeta[];
}

/** camelCase Prisma delegate names, e.g. `user`, `questionPaper`. */
export const MODEL_NAMES: string[] = Prisma.dmmf.datamodel.models.map((model) =>
  toDelegateName(model.name)
);

function toDelegateName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function toPascalName(delegateName: string): string {
  return delegateName.charAt(0).toUpperCase() + delegateName.slice(1);
}

function getDatamodelModel(delegateName: string) {
  const pascal = toPascalName(delegateName);
  return Prisma.dmmf.datamodel.models.find((m) => m.name === pascal);
}

/** Returns true if `name` is a known Prisma model delegate. */
export function isValidModel(name: string): boolean {
  return MODEL_NAMES.includes(name);
}

function mapFieldMeta(field: Prisma.DMMF.Field): FieldMeta {
  return {
    name: field.name,
    kind: String(field.kind),
    type: String(field.type),
    isRequired: Boolean(field.isRequired),
    isId: Boolean(field.isId),
    isUnique: Boolean(field.isUnique),
    isList: Boolean(field.isList),
    isUpdatedAt: Boolean(field.isUpdatedAt),
    hasDefaultValue: Boolean(field.hasDefaultValue),
    relationName: field.relationName ?? null,
    relationFromFields: field.relationFromFields
      ? [...field.relationFromFields]
      : undefined,
  };
}

/** Returns metadata for every Prisma model in the schema. */
export function getModelsMetadata(): ModelMeta[] {
  return Prisma.dmmf.datamodel.models.map((model) => ({
    name: toDelegateName(model.name),
    fields: model.fields.map(mapFieldMeta),
  }));
}

/** Scalar/enum fields suitable for create/update forms. */
export function getEditableFields(modelName: string): FieldMeta[] {
  const model = getDatamodelModel(modelName);
  if (!model) return [];
  return model.fields
    .filter((f) => f.kind === "scalar" || f.kind === "enum")
    .map(mapFieldMeta);
}

/** Scalar/enum fields to show as table columns. */
export function getDisplayFields(modelName: string): FieldMeta[] {
  return getEditableFields(modelName);
}

/** Finds the related model delegate for a foreign-key scalar field. */
export function getRelatedModelForField(
  modelName: string,
  fieldName: string
): string | null {
  const model = getDatamodelModel(modelName);
  if (!model) return null;

  const relationField = model.fields.find(
    (f) =>
      f.kind === "object" &&
      f.relationFromFields?.includes(fieldName)
  );
  if (!relationField) return null;
  return toDelegateName(String(relationField.type));
}

const LABEL_FIELDS = ["name", "title", "email", "id"];

function pickLabel(row: Record<string, unknown>): string {
  for (const key of LABEL_FIELDS) {
    const value = row[key];
    if (value != null && value !== "") return String(value);
  }
  return String(row.id ?? "");
}

/** Fetches parent rows for a relation `<select>` in the row form. */
export async function getRelationOptions(
  modelName: string,
  fieldName: string
): Promise<Array<{ id: string; label: string }>> {
  const relatedModel = getRelatedModelForField(modelName, fieldName);
  if (!relatedModel || !isValidModel(relatedModel)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[relatedModel];
  const rows = (await delegate.findMany({
    take: 200,
    orderBy: { id: "asc" },
  })) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    label: pickLabel(row),
  }));
}

/** Coerces a raw form/API value into the Prisma type for a field. */
export function castValue(
  field: FieldMeta,
  raw: unknown,
  mode: "create" | "update"
): unknown {
  if (raw === "" || raw === undefined) {
    if (field.isRequired && mode === "create" && !field.hasDefaultValue) {
      return undefined;
    }
    return null;
  }

  switch (field.type) {
    case "Int":
      return Number.parseInt(String(raw), 10);
    case "Float":
      return Number.parseFloat(String(raw));
    case "Boolean":
      return raw === true || raw === "true" || raw === "1";
    case "DateTime":
      return new Date(String(raw));
    default:
      return String(raw);
  }
}

/** Builds a Prisma `data` object from a JSON body for create/update. */
export function buildDataFromBody(
  modelName: string,
  body: Record<string, unknown>,
  mode: "create" | "update"
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const fields = getEditableFields(modelName);

  for (const field of fields) {
    if (mode === "create" && field.isUpdatedAt) continue;
    if (mode === "update" && (field.isId || field.isUpdatedAt)) continue;
    if (mode === "create" && field.isId && field.hasDefaultValue) continue;
    if (mode === "create" && field.name === "createdAt" && field.hasDefaultValue) {
      continue;
    }

    if (!(field.name in body)) {
      if (mode === "create" && !field.isRequired && !field.hasDefaultValue) {
        data[field.name] = null;
      }
      continue;
    }

    const value = castValue(field, body[field.name], mode);
    if (value !== undefined) {
      data[field.name] = value;
    }
  }

  return data;
}

/** Returns the Prisma delegate for a model name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getModelDelegate(modelName: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any)[modelName];
}
