import Anthropic from '@anthropic-ai/sdk';
import { toPascalCase, toCamelCase, toKebabCase, pluralize } from '../utils/naming.js';
import type { ProjectConfig } from '../detect/index.js';

export interface FeatureField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'text' | 'json' | 'decimal';
  required: boolean;
  maxLength?: number;
  defaultValue?: string;
  description?: string;
}

export interface FeatureSpec {
  entityName: string;
  entityNamePlural: string;
  tableName: string;
  routeName: string;
  variableName: string;
  variableNamePlural: string;
  fields: FeatureField[];
  listColumns: string[];
  searchFields: string[];
  sortableFields: string[];
  filterFields: string[];
  description: string;
}

const SYSTEM_PROMPT = `You are a feature specification analyzer for Next.js applications.

Given a feature description, output a JSON specification for code generation.

Rules:
1. Entity names should be PascalCase singular (e.g., "Invoice", "CustomerTicket")
2. Field names should be camelCase (e.g., "dueDate", "totalAmount")
3. Standard fields (id, createdAt, updatedAt) are added automatically — DO NOT include them
4. If the project uses multi-tenancy, workspaceId is added automatically — DO NOT include it
5. Use practical field types: string (short text), text (long text), number, decimal, boolean, date, json
6. Design for real-world use — include fields a user would actually need
7. Don't over-engineer — 5-12 fields is the sweet spot
8. Choose good list columns (3-5 fields shown in table view)
9. Choose searchable fields (text fields users would search by)
10. Choose sortable fields (dates, numbers, names)
11. Choose filter fields (status, type, category — enum-like fields)

Output ONLY valid JSON matching this schema, no markdown or explanation:
{
  "entityName": "PascalCase singular",
  "fields": [
    { "name": "camelCase", "type": "string|number|boolean|date|text|json|decimal", "required": true|false, "description": "what this field is" }
  ],
  "listColumns": ["field1", "field2"],
  "searchFields": ["field1"],
  "sortableFields": ["field1"],
  "filterFields": ["field1"],
  "description": "One-line description of this feature"
}`;

export async function analyzeFeature(
  description: string,
  config: ProjectConfig,
  apiKey?: string
): Promise<FeatureSpec> {
  if (!apiKey) {
    return createFallbackSpec(description);
  }

  try {
    const client = new Anthropic({ apiKey });

    const contextNote = config.stack.database !== 'none'
      ? `\nProject uses ${config.stack.database} for database.`
      : '';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analyze this feature and generate a specification:\n\n"${description}"${contextNote}`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return buildSpec(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`AI analysis failed (${msg}), using fallback spec`);
    return createFallbackSpec(description);
  }
}

function buildSpec(parsed: Record<string, unknown>): FeatureSpec {
  const entityName = parsed.entityName as string;
  const entityNamePlural = pluralize(entityName);
  const routeName = toKebabCase(entityNamePlural);
  const variableName = toCamelCase(entityName);
  const variableNamePlural = toCamelCase(entityNamePlural);

  return {
    entityName,
    entityNamePlural,
    tableName: entityNamePlural,
    routeName,
    variableName,
    variableNamePlural,
    fields: (parsed.fields as FeatureField[]) || [],
    listColumns: (parsed.listColumns as string[]) || ['name'],
    searchFields: (parsed.searchFields as string[]) || ['name'],
    sortableFields: (parsed.sortableFields as string[]) || ['createdAt'],
    filterFields: (parsed.filterFields as string[]) || [],
    description: (parsed.description as string) || entityName,
  };
}

function createFallbackSpec(description: string): FeatureSpec {
  // Extract a reasonable entity name from the description
  const words = description.split(/\s+/).filter(w => w.length > 2);
  const entityName = toPascalCase(words.slice(0, 2).join(' '));
  const entityNamePlural = pluralize(entityName);

  return {
    entityName,
    entityNamePlural,
    tableName: entityNamePlural,
    routeName: toKebabCase(entityNamePlural),
    variableName: toCamelCase(entityName),
    variableNamePlural: toCamelCase(entityNamePlural),
    fields: [
      { name: 'name', type: 'string', required: true, description: 'Name' },
      { name: 'description', type: 'text', required: false, description: 'Description' },
      { name: 'status', type: 'string', required: true, defaultValue: 'active', description: 'Status' },
    ],
    listColumns: ['name', 'status', 'createdAt'],
    searchFields: ['name', 'description'],
    sortableFields: ['name', 'createdAt'],
    filterFields: ['status'],
    description,
  };
}
