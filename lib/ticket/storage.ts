import { openDB } from 'idb'
import { migrateDraft } from './schema'
import type { TicketDraft } from './schema'

let connection: ReturnType<typeof openDB> | undefined

function database() {
    connection ??= openDB('encore-pass', 1, {
        upgrade(db) {
            db.createObjectStore('drafts')
        },
    })
    return connection
}
export async function loadDraft(): Promise<unknown> {
    return migrateDraft(await (await database()).get('drafts', 'current'))
}
export async function saveDraft(draft: TicketDraft) {
    return (await database()).put('drafts', draft, 'current')
}
export async function deleteDraft() {
    return (await database()).clear('drafts')
}
