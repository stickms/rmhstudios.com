import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('http://site.test/admin/flags'),
}));

import { templateOfRouteFile } from '@/lib/api/route-template';
import { isInternalRequest, markInternalRequest } from '@/lib/api/internal-request.server';

describe('in-process API reads', () => {
  it('maps a route file to its contract path template', () => {
    expect(templateOfRouteFile('/app/routes/api/health.ts')).toBe('/api/health');
    expect(templateOfRouteFile('/app/routes/api/series/$id/index.ts')).toBe('/api/series/$id');
    expect(templateOfRouteFile('/app/routes/api/tf2-hud/$id.download.ts')).toBe(
      '/api/tf2-hud/$id/download',
    );
    expect(templateOfRouteFile('/app/routes/api/v1/openapi[.]json.ts')).toBe(
      '/api/v1/openapi.json',
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
