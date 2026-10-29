'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AnimationEvent, MouseEvent, RefObject } from 'react'

function CloseIcon() {
    return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M5.6 5.6l8.8 8.8M14.4 5.6l-8.8 8.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
            />
        </svg>
    )
}

// Shared confirmation sheet for clearing data, replacing the editor with an
// imported draft, and consenting to third-party signing: title, one plain
// paragraph and the footer actions, with no eyebrow or warning box. The parent
// owns `open` and closes it from a callback.
export function ConfirmSheet({
    open,
    title,
    message,
    confirmLabel,
    closeLabel = '关闭',
    confirmTone = 'destructive',
    returnFocus,
    onCancel,
    onConfirm,
}: {
    open: boolean
    title: string
    message: string
    confirmLabel: string
    closeLabel?: string
    confirmTone?: 'destructive' | 'primary'
    returnFocus?: RefObject<HTMLElement | null>
    onCancel: () => void
    onConfirm: () => void
}) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const pendingAction = useRef<(() => void) | null>(null)
    const titleId = useId()
    const messageId = useId()
    const [closing, setClosing] = useState(false)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        if (open && !dialog.open && !closing) {
            pendingAction.current = null
            document.body.classList.add('has-dialog')
            dialog.showModal()
        } else if (!open && dialog.open && !closing) {
            // The parent closed the sheet without a button, e.g. after the
            // pending action became meaningless.
            pendingAction.current = null
            setClosing(true)
        }
    }, [open, closing])

    useEffect(() => {
        if (!closing) return
        const timer = setTimeout(() => dialogRef.current?.close(), 500)
        return () => clearTimeout(timer)
    }, [closing])

    useEffect(() => () => document.body.classList.remove('has-dialog'), [])

    function requestClose(action: () => void) {
        const dialog = dialogRef.current
        if (!dialog?.open || closing) return
        pendingAction.current = action
        setClosing(true)
    }

    function handleAnimationEnd(event: AnimationEvent<HTMLDialogElement>) {
        if (closing && event.target === dialogRef.current)
            dialogRef.current.close()
    }

    function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
        const rect = event.currentTarget.getBoundingClientRect()
        if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        )
            requestClose(onCancel)
    }

    return (
        <dialog
            ref={dialogRef}
            className={
                closing
                    ? 'help-dialog confirm-dialog is-closing'
                    : 'help-dialog confirm-dialog'
            }
            aria-labelledby={titleId}
            aria-describedby={messageId}
            onCancel={(event) => {
                event.preventDefault()
                requestClose(onCancel)
            }}
            onClick={handleDialogClick}
            onAnimationEnd={handleAnimationEnd}
            onClose={() => {
                setClosing(false)
                document.body.classList.remove('has-dialog')
                returnFocus?.current?.focus()
                const action = pendingAction.current
                pendingAction.current = null
                action?.()
            }}
        >
            <header className="help-header">
                <div>
                    <h2 id={titleId}>{title}</h2>
                </div>
                <button
                    className="icon-button help-close"
                    type="button"
                    aria-label={closeLabel}
                    onClick={() => requestClose(onCancel)}
                >
                    <CloseIcon />
                </button>
            </header>
            <div className="help-body">
                <p id={messageId}>{message}</p>
            </div>
            <footer className="help-footer">
                <button
                    className="button button-gray"
                    type="button"
                    onClick={() => requestClose(onCancel)}
                >
                    取消
                </button>
                <button
                    className={
                        confirmTone === 'primary'
                            ? 'button button-primary'
                            : 'button button-destructive'
                    }
                    type="button"
                    onClick={() => requestClose(onConfirm)}
                >
                    {confirmLabel}
                </button>
            </footer>
        </dialog>
    )
}
