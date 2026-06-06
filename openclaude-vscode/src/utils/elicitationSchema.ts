export interface NormalizedElicitationOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
  recommendationNote?: string;
}

export interface NormalizedElicitationField {
  name: string;
  label: string;
  type:
    | {
        type: 'text';
        placeholder?: string;
        inputMode?: 'text' | 'number' | 'integer';
      }
    | {
        type: 'select';
        options: NormalizedElicitationOption[];
      }
    | {
        type: 'multiselect';
        options: NormalizedElicitationOption[];
      }
    | {
        type: 'confirm';
        default?: boolean;
      };
  required: boolean;
  default?: unknown;
  helperText?: string;
}

export interface NormalizedElicitationRequest {
  fields: NormalizedElicitationField[];
  title?: string;
  helperText?: string;
  submitLabel?: string;
  cancelLabel?: string;
}

const DEFAULT_RECOMMENDATION_NOTE = 'Default choice from the requesting tool.';

const OPTION_RECOMMENDED_KEYS = [
  'recommended',
  'preferred',
  'suggested',
  'x-openclaude-recommended',
  'x-openclaude-preferred',
  'x-openclaude-suggested',
] as const;

const FIELD_RECOMMENDED_VALUE_KEYS = [
  'recommendedValue',
  'recommendedValues',
  'preferredValue',
  'preferredValues',
  'suggestedValue',
  'suggestedValues',
  'x-openclaude-recommended',
  'x-openclaude-recommendedValues',
] as const;

const RECOMMENDATION_NOTE_KEYS = [
  'recommendationNote',
  'recommendedReason',
  'preferredReason',
  'suggestedReason',
  'x-openclaude-recommendation-note',
] as const;

const ENUM_NAME_KEYS = ['enumNames', 'x-enumNames'] as const;
const ENUM_DESCRIPTION_KEYS = ['enumDescriptions', 'x-enumDescriptions'] as const;

export function normalizeElicitationRequest(options: {
  requestedSchema?: Record<string, unknown>;
  legacyFields?: unknown[];
}): NormalizedElicitationRequest {
  const { requestedSchema, legacyFields } = options;

  return {
    fields:
      Array.isArray(legacyFields) && legacyFields.length > 0
        ? (legacyFields as NormalizedElicitationField[])
        : buildFieldsFromSchema(requestedSchema),
    title: pickString(requestedSchema, ['title']),
    helperText: pickString(requestedSchema, ['helperText', 'description']),
    submitLabel: pickString(requestedSchema, ['submitLabel', 'submitText', 'primaryActionLabel']),
    cancelLabel: pickString(requestedSchema, ['cancelLabel', 'cancelText', 'secondaryActionLabel']),
  };
}

function buildFieldsFromSchema(
  requestedSchema?: Record<string, unknown>,
): NormalizedElicitationField[] {
  const properties = asRecord(requestedSchema?.properties);
  if (!properties) {
    return [];
  }

  const required = new Set(toStringArray(requestedSchema?.required));

  return Object.entries(properties)
    .map(([name, rawSchema]) => buildField(name, rawSchema, required.has(name)))
    .filter((field): field is NormalizedElicitationField => Boolean(field));
}

function buildField(
  name: string,
  rawSchema: unknown,
  required: boolean,
): NormalizedElicitationField | undefined {
  const schema = asRecord(rawSchema);
  if (!schema) {
    return undefined;
  }

  const label = pickString(schema, ['title', 'label']) ?? humanizeLabel(name);
  const helperText = pickString(schema, ['helperText', 'description']);
  const defaultValue = schema.default;
  const schemaType = typeof schema.type === 'string' ? schema.type : 'string';

  if (schemaType === 'boolean') {
    return {
      name,
      label,
      required,
      helperText,
      default: defaultValue,
      type: {
        type: 'confirm',
        default: typeof defaultValue === 'boolean' ? defaultValue : undefined,
      },
    };
  }

  const selectOptions = buildSelectOptions(schema);
  if (selectOptions.length > 0) {
    return {
      name,
      label,
      required,
      helperText,
      default: defaultValue,
      type: {
        type: 'select',
        options: selectOptions,
      },
    };
  }

  const multiselectOptions = buildMultiSelectOptions(schema);
  if (multiselectOptions.length > 0) {
    return {
      name,
      label,
      required,
      helperText,
      default: defaultValue,
      type: {
        type: 'multiselect',
        options: multiselectOptions,
      },
    };
  }

  return {
    name,
    label,
    required,
    helperText,
    default: defaultValue,
    type: {
      type: 'text',
      placeholder: resolvePlaceholder(schema),
      inputMode:
        schemaType === 'integer' ? 'integer' : schemaType === 'number' ? 'number' : 'text',
    },
  };
}

function buildSelectOptions(
  schema: Record<string, unknown>,
): NormalizedElicitationOption[] {
  const oneOfOptions = Array.isArray(schema.oneOf) ? schema.oneOf : undefined;
  if (oneOfOptions && oneOfOptions.length > 0) {
    return buildObjectOptions(oneOfOptions, schema);
  }

  const values = Array.isArray(schema.enum) ? schema.enum : undefined;
  if (!values || values.length === 0) {
    return [];
  }

  const labels = pickStringArray(schema, ENUM_NAME_KEYS);
  const descriptions = pickStringArray(schema, ENUM_DESCRIPTION_KEYS);
  return values
    .map((value, index) => buildPrimitiveOption(value, schema, {
      label: labels[index],
      description: descriptions[index],
    }))
    .filter(isNormalizedElicitationOption);
}

function buildMultiSelectOptions(
  schema: Record<string, unknown>,
): NormalizedElicitationOption[] {
  if (schema.type !== 'array') {
    return [];
  }

  const items = asRecord(schema.items);
  if (!items) {
    return [];
  }

  const anyOfOptions = Array.isArray(items.anyOf)
    ? items.anyOf
    : Array.isArray(items.oneOf)
      ? items.oneOf
      : undefined;
  if (anyOfOptions && anyOfOptions.length > 0) {
    return buildObjectOptions(anyOfOptions, schema);
  }

  const values = Array.isArray(items.enum) ? items.enum : undefined;
  if (!values || values.length === 0) {
    return [];
  }

  const labels = pickStringArray(items, ENUM_NAME_KEYS);
  const descriptions = pickStringArray(items, ENUM_DESCRIPTION_KEYS);
  return values
    .map((value, index) => buildPrimitiveOption(value, schema, {
      label: labels[index],
      description: descriptions[index],
    }))
    .filter(isNormalizedElicitationOption);
}

function buildObjectOptions(
  options: unknown[],
  parentSchema: Record<string, unknown>,
): NormalizedElicitationOption[] {
  return options
    .map((rawOption): NormalizedElicitationOption | undefined => {
      const option = asRecord(rawOption);
      if (!option || !isPrimitive(option.const)) {
        return undefined;
      }

      const value = String(option.const);
      const fieldRecommendation = resolveFieldRecommendation(parentSchema, value);
      const optionRecommendation = resolveOptionRecommendation(option);
      const recommended = optionRecommendation ?? fieldRecommendation.recommended;
      const recommendationNote =
        recommended
          ? pickString(option, RECOMMENDATION_NOTE_KEYS) ??
            fieldRecommendation.note ??
            (matchesDefaultValue(parentSchema.default, value)
              ? DEFAULT_RECOMMENDATION_NOTE
              : undefined)
          : undefined;

      return {
        value,
        label: pickString(option, ['title', 'label', 'name']) ?? humanizeLabel(value),
        description: pickString(option, ['description', 'helperText']),
        recommended,
        recommendationNote,
      } satisfies NormalizedElicitationOption;
    })
    .filter(isNormalizedElicitationOption);
}

function isNormalizedElicitationOption(
  option: NormalizedElicitationOption | undefined,
): option is NormalizedElicitationOption {
  return Boolean(option);
}

function buildPrimitiveOption(
  value: unknown,
  parentSchema: Record<string, unknown>,
  hints: { label?: string; description?: string },
): NormalizedElicitationOption | undefined {
  if (!isPrimitive(value)) {
    return undefined;
  }

  const serializedValue = String(value);
  const fieldRecommendation = resolveFieldRecommendation(parentSchema, serializedValue);
  const recommended = fieldRecommendation.recommended;

  return {
    value: serializedValue,
    label: hints.label ?? humanizeLabel(serializedValue),
    description: hints.description,
    recommended,
    recommendationNote: recommended ? fieldRecommendation.note : undefined,
  };
}

function resolveFieldRecommendation(
  schema: Record<string, unknown>,
  optionValue: string,
): { recommended: boolean; note?: string } {
  const explicitValues = new Set<string>();
  for (const key of FIELD_RECOMMENDED_VALUE_KEYS) {
    const raw = schema[key];
    if (isPrimitive(raw)) {
      explicitValues.add(String(raw));
    } else if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (isPrimitive(entry)) {
          explicitValues.add(String(entry));
        }
      }
    }
  }

  const explicitRecommended = explicitValues.has(optionValue);
  const defaultRecommended =
    explicitValues.size === 0 && matchesDefaultValue(schema.default, optionValue);

  if (!explicitRecommended && !defaultRecommended) {
    return { recommended: false };
  }

  return {
    recommended: true,
    note:
      pickString(schema, RECOMMENDATION_NOTE_KEYS) ??
      (defaultRecommended ? DEFAULT_RECOMMENDATION_NOTE : undefined),
  };
}

function resolveOptionRecommendation(
  option: Record<string, unknown>,
): boolean | undefined {
  for (const key of OPTION_RECOMMENDED_KEYS) {
    if (typeof option[key] === 'boolean') {
      return option[key] as boolean;
    }
  }
  return undefined;
}

function resolvePlaceholder(schema: Record<string, unknown>): string | undefined {
  const directPlaceholder = pickString(schema, ['placeholder']);
  if (directPlaceholder) {
    return directPlaceholder;
  }

  if (Array.isArray(schema.examples)) {
    const firstExample = schema.examples.find((entry) => typeof entry === 'string');
    if (typeof firstExample === 'string') {
      return firstExample;
    }
  }

  if (typeof schema.format === 'string') {
    switch (schema.format) {
      case 'email':
        return 'user@example.com';
      case 'uri':
        return 'https://example.com';
      case 'date':
        return 'YYYY-MM-DD';
      case 'date-time':
        return 'YYYY-MM-DDTHH:mm:ssZ';
      default:
        break;
    }
  }

  return undefined;
}

function matchesDefaultValue(defaultValue: unknown, optionValue: string): boolean {
  if (Array.isArray(defaultValue)) {
    return defaultValue.some((entry) => isPrimitive(entry) && String(entry) === optionValue);
  }

  return isPrimitive(defaultValue) && String(defaultValue) === optionValue;
}

function pickString(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key].trim().length > 0) {
      return record[key] as string;
    }
  }

  return undefined;
}

function pickStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
): string[] {
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).map((entry) => String(entry));
    }
  }

  return [];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function humanizeLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
