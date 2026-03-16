import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { readFileIfExists } from '../utils/fs.js';
import type { ProjectConfig } from '../detect/index.js';
import type { FeatureSpec } from './analyzer.js';

export interface GeneratedFile {
  path: string;
  content: string;
  description: string;
}

function buildSystemPrompt(config: ProjectConfig): string {
  const ext = config.project.language === 'typescript' ? 'ts' : 'js';
  const extx = config.project.language === 'typescript' ? 'tsx' : 'jsx';

  return `You are an expert Next.js code generator. You generate production-quality feature code that matches the EXACT patterns of an existing project.

## Project Stack
- Framework: Next.js ${config.project.frameworkVersion} (${config.project.router === 'app' ? 'App Router' : 'Pages Router'})
- Language: ${config.project.language}
- Database: ${config.stack.database}
- Auth: ${config.stack.auth}
- Styling: ${config.stack.styling}
- Source directory: ${config.project.srcDir ? 'src/' : 'root'}

## CRITICAL RULES

1. **Match existing patterns EXACTLY.** If reference files use a specific import style, ORM pattern, error handling approach, or component structure — copy it precisely.

2. **NEVER modify existing files.** Only generate NEW files. If you need a database client import, use the same import path shown in reference files.

3. **Multi-tenancy:** If reference files scope queries by workspaceId, userId, or orgId — do the same. If they don't, don't add it.

4. **Safe zones:** NEVER generate files in these paths: ${config.safeZones.join(', ')}

5. **File extensions:** Use .${ext} for logic files, .${extx} for React components.

6. **Imports:** Use the EXACT same import patterns as reference files. If they import from '@/lib/db', you import from '@/lib/db'. If they import from '../../../lib/db', use the same pattern.

7. **Auth pattern:** Match the auth pattern from reference files exactly. If they use \`auth()\`, you use \`auth()\`. If they use \`getServerSession\`, you use that. If they use Clerk's \`currentUser()\`, match it.

8. **Database pattern:** Match the ORM/query pattern exactly:
   - Prisma: use prisma.entity.findMany(), etc.
   - Drizzle: use db.select().from(table), etc.
   - Raw SQL: use the same connection/query pattern as reference files
   - Supabase: use supabase.from('table').select(), etc.
   - Mongoose: use Model.find(), etc.

9. **Error handling:** Match the error response format from reference files.

10. **No placeholder comments.** Write real, complete, working code.

## Output Format

Return ONLY a JSON array of files. No markdown, no explanation, no code blocks.

[
  {
    "path": "relative/path/from/project/root.${ext}",
    "content": "full file content as a string",
    "description": "what this file does"
  }
]

Each file content must be a complete, working file — not a snippet.`;
}

function buildUserPrompt(
  spec: FeatureSpec,
  config: ProjectConfig,
  referenceContents: { path: string; content: string }[]
): string {
  const ext = config.project.language === 'typescript' ? 'ts' : 'js';
  const extx = config.project.language === 'typescript' ? 'tsx' : 'jsx';

  let prompt = `## Feature Specification

Entity: ${spec.entityName} (plural: ${spec.entityNamePlural})
Route path: ${spec.routeName}
Description: ${spec.description}

Fields:
${spec.fields.map(f => `- ${f.name}: ${f.type}${f.required ? ' (required)' : ' (optional)'}${f.description ? ` — ${f.description}` : ''}`).join('\n')}

List columns: ${spec.listColumns.join(', ')}
Searchable: ${spec.searchFields.join(', ')}
Sortable: ${spec.sortableFields.join(', ')}
Filterable: ${spec.filterFields.join(', ')}
`;

  if (referenceContents.length > 0) {
    prompt += `\n## Reference Files (MATCH THESE PATTERNS)\n\n`;
    for (const ref of referenceContents) {
      prompt += `### ${ref.path}\n\`\`\`\n${ref.content}\n\`\`\`\n\n`;
    }
  } else {
    prompt += `\n## No Reference Files Found

Generate using Next.js App Router best practices:
- API routes: export async function GET/POST/PUT/DELETE in route.${ext}
- Pages: 'use client' React components in page.${extx}
- Use standard fetch() for API calls from client components
`;
  }

  const srcPrefix = config.project.srcDir ? 'src/' : '';
  const appDir = `${srcPrefix}app`;

  prompt += `\n## Files to Generate

Generate these files for the "${spec.routeName}" feature:

1. **API route (list + create):** \`${appDir}/api/${spec.routeName}/route.${ext}\`
   - GET: paginated list with search/filter/sort
   - POST: create new ${spec.variableName}

2. **API route (detail):** \`${appDir}/api/${spec.routeName}/[id]/route.${ext}\`
   - GET: single ${spec.variableName} by ID
   - PUT: update ${spec.variableName}
   - DELETE: delete ${spec.variableName}

3. **Dashboard page (list):** \`${appDir}/dashboard/${spec.routeName}/page.${extx}\`
   - Table/list view of all ${spec.variableNamePlural}
   - Search, filter, sort controls
   - Link to create new
   - Link to detail view

4. **Dashboard page (detail):** \`${appDir}/dashboard/${spec.routeName}/[id]/page.${extx}\`
   - Display ${spec.variableName} details
   - Edit mode toggle
   - Delete with confirmation

5. **Form component:** \`${appDir}/dashboard/${spec.routeName}/components/${spec.entityName}Form.${extx}\`
   - Reusable form for create and edit
   - Validation
   - Loading states

6. **List component:** \`${appDir}/dashboard/${spec.routeName}/components/${spec.entityName}List.${extx}\`
   - Table/card display
   - Action buttons (view, delete)

${config.project.language === 'typescript' ? `7. **Types:** \`${appDir}/dashboard/${spec.routeName}/types.${ext}\`
   - TypeScript interfaces for the entity
   - API response types
   - Form input types` : ''}

Return the JSON array of files now.`;

  return prompt;
}

export async function generateFeature(
  spec: FeatureSpec,
  config: ProjectConfig,
  apiKey: string
): Promise<GeneratedFile[]> {
  const client = new Anthropic({ apiKey });

  // Read reference files to show Claude existing patterns
  const referenceContents: { path: string; content: string }[] = [];
  for (const refPath of config.referenceFiles.slice(0, 6)) {
    const absPath = path.join(config.paths.root, refPath);
    const content = await readFileIfExists(absPath);
    if (content && content.length < 5000) {
      referenceContents.push({ path: refPath, content });
    }
  }

  const systemPrompt = buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(spec, config, referenceContents);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('AI did not return a valid file array. Response:\n' + text.slice(0, 500));
  }

  const files: GeneratedFile[] = JSON.parse(jsonMatch[0]);

  // Validate and sanitize paths
  return files
    .filter((f) => f.path && f.content)
    .map((f) => ({
      path: f.path.replace(/^\//, ''), // Remove leading slash
      content: f.content,
      description: f.description || f.path,
    }));
}
