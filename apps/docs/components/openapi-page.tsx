'use client';

import { createOpenAPIPage } from 'fumadocs-openapi/ui';

/**
 * The client component that renders a REST-reference page (operation docs, schemas,
 * interactive playground). Stock configuration — the brand enters through the fd/token
 * CSS seam only (DOCS-DESIGN §1.2).
 */
export const OpenAPIPage = createOpenAPIPage();
