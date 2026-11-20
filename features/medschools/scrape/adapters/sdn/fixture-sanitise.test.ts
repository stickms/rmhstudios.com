import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  Aliases,
  assertClean,
  newCollected,
  questionIsFixtureSafe,
  redactForFixture,
  sanitiseRss,
  sanitiseThreadPage,
} from './fixture-sanitise';

const THREAD = `<html><head><title>2026-2027 X</title><link rel="canonical" href="https://forums.studentdoctor.net/threads/x.1/" /></head><body>
<h1 class="p-title-value">2026-2027 X</h1>
<article class="message message--post js-post" data-author="RealPerson" data-content="post-25000001" id="js-post-25000001">
<section class="message-user"><a href="/members/realperson.4242/" class="username" data-user-id="4242"><span>RealPerson</span></a>
<img src="/data/avatars/s/4/4242.jpg" class="avatar-u4242-s" alt="RealPerson" /></section>
<ul class="message-attribution-opposite"><li><a href="/posts/25000001/share">share</a></li></ul>
<div class="message-userContent" data-lb-caption-desc="RealPerson &middot; Nov 5, 2026 at 10:31 PM">
<div class="bbWrapper"><blockquote data-quote="OtherGuy" data-source="post: 24999999" data-attributes="member: 777" class="bbCodeBlock--quote"><div class="bbCodeBlock-title"><a class="bbCodeBlock-sourceJump" href="/goto/post?id=24999999">OtherGuy said:</a></div>quoted</blockquote>Mail me at a.b@c.org, see https://x.example/y, thanks @Somebody and RealPerson.</div></div>
<time class="u-dt" datetime="2026-11-05T22:31:44-0500">x</time>
</article></body></html>`;

describe('SDN fixture sanitiser', () => {
  it('replaces authors, members, avatars and post ids, and passes the re-scan', () => {
    const c =
      newCollected();
    const out =
      sanitiseThreadPage(
        THREAD,
        c,
        {
          maxPosts: 12,
          pick: 'first',
        },
      );
    expect(
      out,
    ).toMatch(
      /data-author="author-001"/,
    );
    expect(
      out,
    ).toMatch(
      /data-content="post-9000001"/,
    );
    expect(
      out,
    ).toMatch(
      /\/members\/user-001\.1\//,
    );
    expect(
      out,
    ).toContain(
      'post: 9500001',
    );
    expect(
      out,
    ).not.toMatch(
      /RealPerson|OtherGuy|Somebody|4242|25000001|a\.b@c\.org|x\.example/i,
    );
    expect(
      out,
    ).toContain(
      'datetime="2026-11-05T22:31:44-0500"',
    );
    expect(
      () =>
        assertClean(
          't',
          out,
          c,
        ),
    ).not.toThrow();
  });

  it('assertClean throws without naming the value when a collected handle survives', () => {
    const c =
      newCollected();
    c.handles.add(
      'secretname',
    );
    expect(
      () =>
        assertClean(
          't.html',
          '<p>hi SecretName</p>',
          c,
        ),
    ).toThrowError(
      /t\.html still contains a collected handle/,
    );
    try {
      assertClean(
        't.html',
        '<p>hi SecretName</p>',
        c,
      );
    } catch (e) {
      expect(
        String(
          e,
        ),
      ).not.toMatch(
        /secretname/i,
      );
    }
  });

  it('redactForFixture handles emails, urls, mentions and collected handles', () => {
    const c =
      newCollected();
    c.handles.add(
      'quietuser',
    );
    const out =
      redactForFixture(
        'a@b.co https://z.example @bob QuietUser 555-123-4567',
        c,
        new Aliases(),
      );
    expect(
      out,
    ).not.toMatch(
      /a@b\.co|z\.example|bob|quietuser|555-123/i,
    );
  });

  it('the RSS sanitiser drops creators and opening-post bodies', () => {
    const xml = `<rss><channel><item><title>t</title><author>invalid@example.com (RealPerson)</author><dc:creator>RealPerson</dc:creator><content:encoded><![CDATA[<p>RealPerson wrote</p>]]></content:encoded><slash:comments>3</slash:comments></item></channel></rss>`;
    const c =
      newCollected();
    const out =
      sanitiseRss(
        xml,
        c,
        5,
      );
    expect(
      out,
    ).not.toMatch(
      /RealPerson/,
    );
    expect(
      out,
    ).toContain(
      '<slash:comments>3</slash:comments>',
    );
  });

  it('questionIsFixtureSafe rejects person-shaped questions', () => {
    expect(
      questionIsFixtureSafe(
        'Why medicine?\n\nWhy us?',
      ),
    ).toBe(
      true,
    );
    expect(
      questionIsFixtureSafe(
        'Dr. Smith asked about me',
      ),
    ).toBe(
      false,
    );
    expect(
      questionIsFixtureSafe(
        'mail me a@b.co',
      ),
    ).toBe(
      false,
    );
  });
});
