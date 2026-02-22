import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { games } from '@/lib/games';

const PROTECTED_GAME_ROUTES = games
    .filter((g) => g.authGate)
    .map((g) => g.href);

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
    /*
     * The matcher broadly covers all page routes. The middleware function
     * dynamically filters to only auth-gate routes from games with authGate: true.
     * Static assets, API routes, and Next.js internals are excluded.
     */
    matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|images|fonts|sounds|songs).*)'],
};
