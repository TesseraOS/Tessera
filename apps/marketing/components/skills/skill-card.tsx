import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import { TextLink } from '@/components/ui/text-link';
import type { SkillDisplay } from '@/lib/skills';

interface SkillCardProps {
  skill: SkillDisplay;
}

/**
 * One skill in the catalog grid (MARKETING-DESIGN §3.15). The `data-skill-category`
 * attribute is what the `.skill-filter` device keys on — it is behaviour, not decoration,
 * so it lives on the list item rather than in a class.
 *
 * Every string here comes from the registry manifest; nothing is authored in the page.
 */
export function SkillCard({ skill }: SkillCardProps) {
  return (
    <Panel className="shadow-soft flex h-full flex-col p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-label text-foreground">{skill.name}</h3>
        <Badge>{skill.category}</Badge>
      </div>
      <p className="text-body text-foreground mt-4">{skill.headline}</p>
      <p className="text-body text-muted-foreground mt-3 flex-1">{skill.description}</p>
      <p className="text-small text-faint-foreground mt-5 border-t pt-4">{skill.why}</p>
      <div className="text-small mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <TextLink href={skill.href}>
          How it works<span className="sr-only"> — {skill.name}</span>
        </TextLink>
        <a
          href={skill.downloadHref}
          download
          className="text-muted-foreground hover:text-rose transition-colors duration-200"
        >
          Download SKILL.md<span className="sr-only"> for {skill.name}</span>
        </a>
      </div>
    </Panel>
  );
}
