export class AppError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
    ) {
        super(message)
    }
}

export function errorResponse(
    status: number,
    code: string,
    message: string,
    details: unknown[] = [],
) {
    return Response.json(
        { error: { code, message, details } },
        { status, headers: { 'Cache-Control': 'no-store' } },
    )
}
