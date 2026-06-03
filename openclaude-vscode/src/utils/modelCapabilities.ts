export interface ModelCapabilityDescriptor {
  value?: string;
  id?: string;
  apiName?: string;
  displayName?: string;
  name?: string;
  description?: string;
  supportsImages?: boolean;
  supportsImageInput?: boolean;
  supportsVision?: boolean;
  modalities?: string[];
  classification?: string[];
  capabilities?: {
    supportsImages?: boolean;
    supportsImageInput?: boolean;
    supportsVision?: boolean;
  };
}

const IMAGE_MODALITY_HINTS = new Set(['image', 'images', 'vision', 'multimodal']);
const VISION_NAME_HINT =
  /\b(vision|multimodal|omni|vl|llava|pixtral|internvl|paligemma|molmo|screen(?:shot)?|image)\b/;
const MODEL_FAMILY_HINT =
  /\b(gpt-4o|gpt-5|o3|o4|claude-3\.5|claude-4|gemini|gemma-3|gemma-4|pixtral|llava|qwen(?:2\.5)?-vl|kimi|grok-2|grok-3|glm-4v|phi-4-multimodal|llama-3\.2(?:-[0-9]+b)?-vision)\b/;

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function hasExplicitVisionSupport(model: ModelCapabilityDescriptor): boolean {
  return [
    model.supportsImages,
    model.supportsImageInput,
    model.supportsVision,
    model.capabilities?.supportsImages,
    model.capabilities?.supportsImageInput,
    model.capabilities?.supportsVision,
  ].some((value) => value === true);
}

function hasExplicitVisionDenial(model: ModelCapabilityDescriptor): boolean {
  return [
    model.supportsImages,
    model.supportsImageInput,
    model.supportsVision,
    model.capabilities?.supportsImages,
    model.capabilities?.supportsImageInput,
    model.capabilities?.supportsVision,
  ].some((value) => value === false);
}

function hasVisionModalities(model: ModelCapabilityDescriptor): boolean {
  const tags = [
    ...(Array.isArray(model.modalities) ? model.modalities : []),
    ...(Array.isArray(model.classification) ? model.classification : []),
  ];

  return tags.some((tag) => IMAGE_MODALITY_HINTS.has(normalizeText(tag)));
}

function hasVisionNameHints(model: ModelCapabilityDescriptor): boolean {
  const haystack = [
    model.value,
    model.id,
    model.apiName,
    model.displayName,
    model.name,
    model.description,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  return VISION_NAME_HINT.test(haystack) || MODEL_FAMILY_HINT.test(haystack);
}

export function resolveModelSupportsImages(
  model: ModelCapabilityDescriptor | undefined,
): boolean {
  if (!model) {
    return false;
  }

  if (hasExplicitVisionSupport(model)) {
    return true;
  }

  if (hasVisionModalities(model) || hasVisionNameHints(model)) {
    return true;
  }

  if (hasExplicitVisionDenial(model)) {
    return false;
  }

  return false;
}

function modelIdentifierCandidates(model: ModelCapabilityDescriptor): string[] {
  return [
    model.value,
    model.id,
    model.apiName,
    model.name,
    model.displayName,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

export function findModelDescriptor(
  models: ModelCapabilityDescriptor[],
  modelName: string | undefined,
): ModelCapabilityDescriptor | undefined {
  const normalizedName = normalizeText(modelName);
  if (!normalizedName) {
    return undefined;
  }

  return models.find((model) =>
    modelIdentifierCandidates(model).includes(normalizedName),
  );
}

export function resolveModelSupportsImagesForSelection(
  modelName: string | undefined,
  models: ModelCapabilityDescriptor[],
  fallback?: ModelCapabilityDescriptor,
): boolean {
  const descriptor =
    findModelDescriptor(models, modelName)
    ?? fallback
    ?? (modelName ? { value: modelName, displayName: modelName } : undefined);

  return resolveModelSupportsImages(descriptor);
}
