import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_GAME_ROUTES = [
    '/temple-of-joy',
    '/synapse-storm',
    '/house-always-wins',
    '/slice-it',
    '/signal-forge',
    '/neon-driftway',
    '/vega',
    '/laundry-sort',
    '/echoes',
    '/cursed-logic',
    '/rmh-code',
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isProtected = PROTECTED_GAME_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(route + '/')
    );

    if (!isProtected) return NextResponse.next();

    // Better Auth stores session in this cookie
    const sessionToken = request.cookies.get('better-auth.session_token');

    if (!sessionToken) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackURL', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/temple-of-joy/:path*',
        '/synapse-storm/:path*',
        '/house-always-wins/:path*',
        '/slice-it/:path*',
        '/signal-forge/:path*',
        '/neon-driftway/:path*',
        '/vega/:path*',
        '/laundry-sort/:path*',
        '/echoes/:path*',
        '/cursed-logic/:path*',
        '/rmh-code/:path*',
    ],
};
