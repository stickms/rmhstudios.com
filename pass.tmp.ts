import { signWikiPass, wikiLoginKey } from '@/lib/wiki/sso.server';
process.stdout.write(encodeURIComponent(signWikiPass({ sub: process.env.SUB!, name: process.env.NAME!, admin: process.env.ADMIN === 'true', state: process.env.STATE! }, wikiLoginKey('test-better-auth-secret-0123456789'), Math.floor(Date.now() / 1000))));
