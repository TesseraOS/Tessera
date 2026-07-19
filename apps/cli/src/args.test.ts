import { describe, expect, it } from 'vitest';
import { flagBool, flagList, flagStr, parseArgs } from './args.js';

describe('parseArgs', () => {
  it('does not let a declared boolean consume the following token', () => {
    const parsed = parseArgs(['--json', './repo'], { booleans: ['json'] });
    expect(parsed.positionals).toEqual(['./repo']);
    expect(parsed.flags.get('json')).toBe(true);
  });

  it('consumes the next token for a non-boolean valued flag', () => {
    const parsed = parseArgs(['--port', '3000', '--host', '0.0.0.0']);
    expect(parsed.flags.get('port')).toBe('3000');
    expect(parsed.flags.get('host')).toBe('0.0.0.0');
    expect(parsed.positionals).toEqual([]);
  });

  it('supports --key=value', () => {
    const parsed = parseArgs(['--config=/etc/tessera.json']);
    expect(parsed.flags.get('config')).toBe('/etc/tessera.json');
  });

  it('treats a flag before another flag as boolean true', () => {
    const parsed = parseArgs(['--force', '--json'], { booleans: ['json'] });
    expect(parsed.flags.get('force')).toBe(true);
    expect(parsed.flags.get('json')).toBe(true);
  });

  it('captures single-dash short flags as booleans', () => {
    const parsed = parseArgs(['-h']);
    expect(parsed.flags.get('h')).toBe(true);
  });

  it('treats everything after -- as positionals', () => {
    const parsed = parseArgs(['add', '--', '--not-a-flag', './p']);
    expect(parsed.positionals).toEqual(['add', '--not-a-flag', './p']);
  });

  it('collects leading positionals', () => {
    const parsed = parseArgs(['issue', 'extra', '--name', 'ci'], { booleans: [] });
    expect(parsed.positionals).toEqual(['issue', 'extra']);
    expect(parsed.flags.get('name')).toBe('ci');
  });
});

describe('flag accessors', () => {
  it('flagStr returns the first present string value, aliases supported', () => {
    const parsed = parseArgs(['--out', 'x']);
    expect(flagStr(parsed, 'output', 'out')).toBe('x');
    expect(flagStr(parsed, 'missing')).toBeUndefined();
  });

  it('flagBool is true when present in any form', () => {
    const parsed = parseArgs(['--json'], { booleans: ['json'] });
    expect(flagBool(parsed, 'json')).toBe(true);
    expect(flagBool(parsed, 'nope')).toBe(false);
  });

  it('flagList splits, trims, and drops empties', () => {
    const parsed = parseArgs(['--roles', 'owner, member ,']);
    expect(flagList(parsed, 'roles')).toEqual(['owner', 'member']);
    expect(flagList(parsed, 'absent')).toBeUndefined();
  });
});
