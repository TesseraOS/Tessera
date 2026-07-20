import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

/**
 * Stock Fumadocs MDX components (DOCS-DESIGN §1.2: no forks — upgrades stay cheap).
 * Callout/Cards/CodeBlock ship in the defaults; Steps and Tabs are registered here so
 * content uses them without per-page imports.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Steps,
    Step,
    Tabs,
    Tab,
    ...components,
  };
}
