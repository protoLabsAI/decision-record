import { z, ZodTypeAny } from "zod";

type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  return convert(schema);
}

function convert(schema: ZodTypeAny): JsonSchema {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  switch (def.typeName) {
    case "ZodString":
      return convertString(schema as z.ZodString);
    case "ZodNumber":
      return convertNumber(schema as z.ZodNumber);
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: (schema as z.ZodEnum<[string, ...string[]]>).options };
    case "ZodLiteral":
      return { const: (schema as z.ZodLiteral<unknown>).value as unknown };
    case "ZodArray":
      return {
        type: "array",
        items: convert((schema as z.ZodArray<ZodTypeAny>).element),
      };
    case "ZodObject":
      return convertObject(schema as z.ZodObject<z.ZodRawShape>);
    case "ZodOptional":
      return convert((schema as z.ZodOptional<ZodTypeAny>).unwrap());
    case "ZodNullable":
      return convert((schema as z.ZodNullable<ZodTypeAny>).unwrap());
    case "ZodDefault":
      return convert((schema as z.ZodDefault<ZodTypeAny>)._def.innerType);
    case "ZodUnion":
      return {
        anyOf: ((schema as z.ZodUnion<readonly [ZodTypeAny, ...ZodTypeAny[]]>).options).map(
          (opt) => convert(opt)
        ),
      };
    case "ZodRecord":
      return {
        type: "object",
        additionalProperties: convert((schema as z.ZodRecord<z.ZodString, ZodTypeAny>).valueSchema),
      };
    case "ZodUnknown":
    case "ZodAny":
      return {};
    default:
      return {};
  }
}

function convertString(schema: z.ZodString): JsonSchema {
  const result: JsonSchema = { type: "string" };
  for (const check of schema._def.checks) {
    if (check.kind === "min") result["minLength"] = check.value;
    if (check.kind === "max") result["maxLength"] = check.value;
    if (check.kind === "regex") result["pattern"] = check.regex.source;
    if (check.kind === "email") result["format"] = "email";
    if (check.kind === "url") result["format"] = "uri";
    if (check.kind === "uuid") result["format"] = "uuid";
    if (check.kind === "datetime") result["format"] = "date-time";
  }
  if (schema.description) result["description"] = schema.description;
  return result;
}

function convertNumber(schema: z.ZodNumber): JsonSchema {
  const result: JsonSchema = { type: "number" };
  for (const check of schema._def.checks) {
    if (check.kind === "min") result["minimum"] = check.value;
    if (check.kind === "max") result["maximum"] = check.value;
    if (check.kind === "int") result["type"] = "integer";
  }
  if (schema.description) result["description"] = schema.description;
  return result;
}

function convertObject(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const shape = schema.shape;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const key of Object.keys(shape)) {
    const field = shape[key]!;
    properties[key] = convert(field);
    const def = (field as unknown as { _def: { typeName: string } })._def;
    if (def.typeName !== "ZodOptional" && def.typeName !== "ZodDefault") {
      required.push(key);
    }
  }
  const out: JsonSchema = {
    type: "object",
    properties,
  };
  if (required.length > 0) out["required"] = required;
  if (schema.description) out["description"] = schema.description;
  return out;
}
