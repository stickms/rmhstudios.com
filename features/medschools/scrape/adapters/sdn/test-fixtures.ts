import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const readFixture = (name: string): string => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
