'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AnimationEvent, MouseEvent } from 'react'

function QuestionIcon() {
    return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle
                cx="10"
                cy="10"
                r="7.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
            />
            <path
                d="M7.9 7.9a2.25 2.25 0 0 1 4.35.8c0 1.6-2.15 1.95-2.15 3.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
            <circle cx="10.1" cy="14.3" r="0.95" fill="currentColor" />
        </svg>
    )
}

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

// iOS-style sheet: the save section's guide lives behind a question mark, so
// the two save paths, privacy notes and limits stay out of the editor card.
export function SaveHelp() {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const titleId = useId()
    const subtitleId = useId()
    const [closing, setClosing] = useState(false)

    // The native animation-end event is the normal path; the timer only exists
    // so a missed event can never leave the dialog stuck on screen.
    useEffect(() => {
        if (!closing) return
        const timer = setTimeout(() => dialogRef.current?.close(), 500)
        return () => clearTimeout(timer)
    }, [closing])

    function openDialog() {
        const dialog = dialogRef.current
        if (!dialog || dialog.open) return
        setClosing(false)
        document.body.classList.add('has-dialog')
        dialog.showModal()
    }

    function requestClose() {
        const dialog = dialogRef.current
        if (!dialog?.open || closing) return
        setClosing(true)
    }

    function handleAnimationEnd(event: AnimationEvent<HTMLDialogElement>) {
        if (closing && event.target === dialogRef.current)
            dialogRef.current.close()
    }

    // The backdrop is painted by ::backdrop, not a DOM node, so dismiss when
    // the click lands outside the dialog's own box.
    function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
        const rect = event.currentTarget.getBoundingClientRect()
        if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        )
            requestClose()
    }

    return (
        <>
            <button
                ref={triggerRef}
                className="icon-button"
                type="button"
                aria-label="关于"
                title="关于"
                aria-haspopup="dialog"
                onClick={openDialog}
            >
                <QuestionIcon />
            </button>
            <dialog
                ref={dialogRef}
                className={closing ? 'help-dialog is-closing' : 'help-dialog'}
                aria-labelledby={titleId}
                aria-describedby={subtitleId}
                onCancel={(event) => {
                    event.preventDefault()
                    requestClose()
                }}
                onClick={handleDialogClick}
                onAnimationEnd={handleAnimationEnd}
                onClose={() => {
                    setClosing(false)
                    document.body.classList.remove('has-dialog')
                    triggerRef.current?.focus()
                }}
            >
                <header className="help-header">
                    <div>
                        <h2 id={titleId}>关于</h2>
                    </div>
                    <button
                        className="icon-button help-close"
                        type="button"
                        aria-label="关闭说明"
                        onClick={requestClose}
                    >
                        <CloseIcon />
                    </button>
                </header>
                <div className="help-body">
                    <section className="help-section">
                        <h3>数据与隐私</h3>
                        <ul className="help-facts">
                            <li>
                                默认情况下，你的所有数据都存储在你的浏览器本地, EncorePass 不会收集与上传任何信息
                            </li>
                            <li>
                                当你选择将票卡添加到 Apple 钱包，或者以任何形式通过本站生成 <code>.pkpass</code> 文件时，
                                你的票卡数据会被发送给<b><a href='https://walletmcppass.com/' target='_blank'>第三方</a></b>以及 Apple 用来生成可以加入设备的票卡
                            </li>
                            <li>
                                上传的数据仅用于生成票卡。票卡的下载有效期为生成后的一小时内，之后你上传的信息会被删除
                            </li>
                        </ul>
                    </section>
                    <section className="help-section">
                        <h3>使用限制</h3>
                        <ul className="help-facts">
                            <li>
                                自制票卡不能作为官方入场凭证，无法替代原票、动态二维码、身份证明等官方指定的入场凭证
                            </li>
                            <li>
                                条码仅供展示, EncorePass 不保证票卡中条码的实际可用性
                            </li>
                            <li>
                                票卡由第三方签发，不代表活动主办方或 Apple 的认证
                            </li>
                        </ul>
                    </section>
                </div>
                <footer className="help-footer">
                    <button
                        className="button button-gray"
                        type="button"
                        onClick={requestClose}
                    >
                        完成
                    </button>
                </footer>
            </dialog>
        </>
    )
}
