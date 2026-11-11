import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('http://site.test/admin/flags'),
}));

import { templateOfRouteFile } from '@/lib/api/internal-dispatch.server';
import { isInternalRequest, markInternalRequest } from '@/lib/api/internal-request.server';

describe('in-process API reads', () => {
  it('maps a route file to its contract path template', () => {
    expect(templateOfRouteFile('/app/routes/api/admin/flags.ts')).toBe('/api/admin/flags');
    expect(templateOfRouteFile('/app/routes/api/series/$id/index.ts')).toBe('/api/series/$id');
    expect(templateOfRouteFile('/app/routes/api/tf2-hud/$id.download.ts')).toBe(
      '/api/tf2-hud/$id/download',
    );
    expect(templateOfRouteFile('/app/routes/api/elections/races[.]csv.ts')).toBe(
      '/api/elections/races.csv',
    );
  });

  it('only a request object that was marked is internal; a header cannot claim it', () => {
    const marked = markInternalRequest(new Request('http://site.test/api/x'));
    const forged = new Request('http://site.test/api/x', {
      headers: { 'x-internal': '1', 'x-rmh-internal': '1' },
    });
    expect(isInternalRequest(marked)).toBe(true);
    expect(isInternalRequest(forged)).toBe(false);
    expect(isInternalRequest(marked.clone())).toBe(false);
  });
});
