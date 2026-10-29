'use client'

import { useRef, useState } from 'react'
import { ConfirmSheet } from './confirm-sheet'

function TrashIcon() {
    return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M4 5.5h12M7.8 5.5V4.3c0-.7.6-1.3 1.3-1.3h1.8c.7 0 1.3.6 1.3 1.3v1.2M5.6 5.5l.6 10.1c.1.8.7 1.4 1.5 1.4h4.6c.8 0 1.4-.6 1.5-1.4l.6-10.1M8.6 8.6v5.2M11.4 8.6v5.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

// Clearing and JSON import share one confirmation sheet; only the copy and
// callbacks differ.
export function ClearDraft({
    disabled,
    onConfirm,
}: {
    disabled: boolean
    onConfirm: () => void
}) {
    const triggerRef = useRef<HTMLButtonElement>(null)
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                ref={triggerRef}
                className="icon-button icon-button-destructive"
                type="button"
                aria-label="清除所有数据"
                title="清除所有数据"
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
                disabled={disabled}
            >
                <TrashIcon />
            </button>
            <ConfirmSheet
                open={open}
                title="清除所有数据？"
                message="当前浏览器中的所有的票卡信息都会被删除，此操作无法撤销。"
                confirmLabel="清除所有数据"
                closeLabel="取消清除"
                returnFocus={triggerRef}
                onCancel={() => setOpen(false)}
                onConfirm={() => {
                    setOpen(false)
                    onConfirm()
                }}
            />
        </>
    )
}
