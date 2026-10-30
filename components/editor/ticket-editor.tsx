'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Image from 'next/image'
import {
    newDraft,
    exportTicketSchema,
    editableDraftSchema,
    migrateDraft,
} from '@/lib/ticket/schema'
import type { TicketDraft } from '@/lib/ticket/schema'
import { loadDraft, saveDraft, deleteDraft } from '@/lib/ticket/storage'
import { barcodeProblem } from '@/lib/ticket/validation'
import { activeEventTicket } from '@/lib/ticket/event-fields'
import { migrateAppearance } from '@/lib/ticket/appearance'
import { TicketPreview } from '@/components/preview/ticket-preview'
import { ClearDraft } from './clear-draft'
import { ConfirmSheet } from './confirm-sheet'
import { EventSection } from './event-section'
import { SaveHelp } from './save-help'
import { StyleSection } from './style-section'
import { Section } from './section'

// Bring old drafts forward: the retired hero image becomes the thumbnail.
// Legacy style values and barcode switches are migrated before parsing.
function restoreDraft(draft: TicketDraft): TicketDraft {
    return migrateAppearance(draft)
}

function downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function ImportIcon() {
    return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M4 13v2.2a1.8 1.8 0 0 0 1.8 1.8h8.4a1.8 1.8 0 0 0 1.8-1.8V13M10 3.5v8M6.7 8.5l3.3 3.3 3.3-3.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

export function TicketEditor() {
    const [draft, setDraft] = useState<TicketDraft | null>(null)
    const [message, setMessage] = useState('')
    const [storageError, setStorageError] = useState('')
    const [clearing, setClearing] = useState(false)
    const [importing, setImporting] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)
    const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    )
    const clearedDraft = useRef<TicketDraft | null>(null)
    const [exporting, setExporting] = useState(false)
    const [remoteSign, setRemoteSign] = useState(false)
    const [consentOpen, setConsentOpen] = useState(false)
    const consentSwitch = useRef<HTMLInputElement>(null)
    const [walletUrl, setWalletUrl] = useState('')
    const [pendingImport, setPendingImport] = useState<TicketDraft | null>(null)
    const pendingSave = useRef<Promise<unknown>>(Promise.resolve())

    useEffect(() => {
        let active = true
        void loadDraft()
            .then((saved) => {
                if (active) {
                    const parsed = editableDraftSchema.safeParse(saved)
                    setDraft(
                        parsed.success ? restoreDraft(parsed.data) : newDraft(),
                    )
                }
            })
            .catch(() => {
                if (active) {
                    setDraft(newDraft())
                    setStorageError(
                        '浏览器存储不可用，请导出票卡数据以保留编辑内容',
                    )
                }
            })
        return () => {
            active = false
        }
    }, [])

    useEffect(() => {
        if (!draft || clearing || draft === clearedDraft.current) return
        saveTimer.current = setTimeout(() => {
            pendingSave.current = pendingSave.current
                .catch(() => {})
                .then(() => saveDraft(draft))
                .then(() => setStorageError(''))
                .catch(() =>
                    setStorageError(
                        '本地保存失败，请导出票卡数据以保留编辑内容',
                    ),
                )
        }, 400)
        return () => clearTimeout(saveTimer.current)
    }, [draft, clearing])

    if (!draft)
        return (
            <p role="status" className="loading">
                正在准备你的票卡工作台…
            </p>
        )

    const ua = navigator.userAgent
    const supportsWallet =
        /iPhone|iPad|iPod|Macintosh/.test(ua) &&
        /Safari/.test(ua) &&
        !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/.test(ua)

    function update<K extends keyof TicketDraft>(
        key: K,
        value: TicketDraft[K],
    ) {
        setDraft((current) =>
            current ? { ...current, [key]: value } : current,
        )
    }

    async function exportPass(event: FormEvent) {
        event.preventDefault()
        if (exporting || clearing || importing) return
        if (!remoteSign) {
            downloadFile(
                new Blob([JSON.stringify(draft, null, 4)], {
                    type: 'application/json',
                }),
                'ticket.encore.json',
            )
            setMessage('票卡数据已导出')
            return
        }
        const parsed = exportTicketSchema.safeParse(draft)
        if (!parsed.success) {
            setMessage(
                parsed.error.issues.map((issue) => issue.message).join('；'),
            )
            return
        }
        // Barcode content stays in the local draft while the switch is off and
        // never leaves the browser.
        const barcode = parsed.data.barcodeEnabled
            ? parsed.data.barcode
            : undefined
        if (barcode) {
            const problem = barcodeProblem(barcode)
            if (problem) {
                setMessage(problem)
                return
            }
        }
        setExporting(true)
        setWalletUrl('')
        setMessage('正在生成票卡…')
        try {
            // Crop sources stay in the local draft; the server only needs the
            // rendered slot images.
            const appearance = { ...parsed.data.appearance }
            delete appearance.imageCrops
            delete appearance.imageSources
            const response = await fetch('/api/passes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(remoteSign
                        ? { 'X-Encore-Remote-Sign': 'walletmcppass' }
                        : {}),
                },
                body: JSON.stringify({
                    ...activeEventTicket(parsed.data),
                    appearance,
                    barcode,
                }),
                signal: AbortSignal.timeout(30_000),
            })
            if (!response.ok) {
                const result = await response.json()
                throw new Error(result.error?.message || '导出失败')
            }
            const blob = await response.blob()
            if (
                !response.headers
                    .get('content-type')
                    ?.includes('application/vnd.apple.pkpass')
            ) {
                throw new Error('签发服务未返回有效的票卡文件')
            }
            const remoteUrl = response.headers.get('x-wallet-download-url')
            const trustedUrl =
                remoteUrl &&
                /^https:\/\/walletmcppass\.com\/download\/[A-Za-z0-9_-]+$/.test(
                    remoteUrl,
                )
                    ? remoteUrl
                    : ''
            setWalletUrl(trustedUrl)
            if (supportsWallet && trustedUrl) {
                window.location.assign(trustedUrl)
                setMessage('票卡已签发')
            } else {
                downloadFile(blob, 'ticket.pkpass')
                setMessage(
                    '票卡已下载，可在支持的设备上打开并添加到 Apple 钱包',
                )
            }
        } catch (error) {
            setMessage(
                error instanceof Error ? error.message : '导出失败，请重试',
            )
        } finally {
            setExporting(false)
        }
    }

    async function importData(file: File) {
        setImporting(true)
        try {
            // Cropped slots keep both the rendered image and its source.
            if (file.size > 32_000_000)
                throw new Error('票卡数据文件不能超过 32 MB')
            const parsed = editableDraftSchema.safeParse(
                migrateDraft(JSON.parse(await file.text())),
            )
            if (!parsed.success)
                throw new Error(
                    '票卡数据格式无效，请选择 EncorePass 导出的 JSON 文件',
                )
            setPendingImport(restoreDraft(parsed.data))
        } catch (error) {
            setMessage(
                error instanceof SyntaxError
                    ? '无法读取票卡数据，请选择有效的 JSON 文件'
                    : error instanceof Error
                      ? error.message
                      : '导入失败',
            )
        } finally {
            setImporting(false)
        }
    }

    function applyImport() {
        if (!pendingImport) return
        setDraft(pendingImport)
        setRemoteSign(false)
        setWalletUrl('')
        setMessage('票卡数据已导入')
        setPendingImport(null)
    }

    async function removeDraft() {
        setClearing(true)
        clearTimeout(saveTimer.current)
        try {
            await pendingSave.current.catch(() => {})
            await deleteDraft()
            const empty = newDraft()
            clearedDraft.current = empty
            setDraft(empty)
            setRemoteSign(false)
            setWalletUrl('')
            if (fileInput.current) fileInput.current.value = ''
            setStorageError('')
            setMessage('所有本地票卡数据已清除')
        } catch {
            setMessage('清除失败，请检查浏览器存储权限后重试')
        } finally {
            setClearing(false)
        }
    }

    return (
        <div className="workspace">
            <div className="hero">
                <div>
                    <h1>每一场，都值得珍藏</h1>
                    <p className="hero-lede">
                        创建属于你的活动票卡，随身带上每一次的期待与回忆
                    </p>
                </div>
            </div>
            <div className="editor-layout">
                <div className="editor-column">
                    <form onSubmit={exportPass} noValidate={!remoteSign}>
                        <EventSection
                            draft={draft}
                            update={update}
                            setDraft={setDraft}
                            onMessage={setMessage}
                            action={
                                <>
                                    <label
                                        className={
                                            exporting || clearing || importing
                                                ? 'icon-button file-button is-disabled'
                                                : 'icon-button file-button'
                                        }
                                        title="导入票卡数据"
                                    >
                                        <ImportIcon />
                                        <input
                                            ref={fileInput}
                                            type="file"
                                            accept=".json,application/json"
                                            aria-label="导入票卡数据"
                                            disabled={
                                                exporting ||
                                                clearing ||
                                                importing
                                            }
                                            onChange={(event) => {
                                                const file =
                                                    event.target.files?.[0]
                                                event.target.value = ''
                                                if (file) void importData(file)
                                            }}
                                        />
                                    </label>
                                    <ClearDraft
                                        disabled={
                                            exporting || clearing || importing
                                        }
                                        onConfirm={removeDraft}
                                    />
                                </>
                            }
                        />
                        <StyleSection
                            draft={draft}
                            update={update}
                            setDraft={setDraft}
                            onMessage={setMessage}
                        />
                        <Section
                            step={3}
                            title="保存你的票卡"
                            description="添加票卡到 Apple 钱包或者导出票卡数据到本地"
                            action={<SaveHelp />}
                        >
                            {draft.warnings.length > 0 && (
                                <div className="row">
                                    {draft.warnings.map((warning, i) => (
                                        <p className="notice" key={i}>
                                            {warning}
                                        </p>
                                    ))}
                                </div>
                            )}
                            <label className="row toggle-row">
                                <span>将数据提供给第三方以生成票卡</span>
                                <span className="switch">
                                    <input
                                        ref={consentSwitch}
                                        type="checkbox"
                                        role="switch"
                                        checked={remoteSign}
                                        disabled={
                                            exporting || clearing || importing
                                        }
                                        onChange={(event) => {
                                            if (event.target.checked) {
                                                setConsentOpen(true)
                                                return
                                            }
                                            setRemoteSign(false)
                                            setWalletUrl('')
                                            setMessage('')
                                        }}
                                    />
                                    <span />
                                </span>
                            </label>
                            {remoteSign &&
                                draft.barcodeEnabled &&
                                draft.barcode && (
                                    <label className="row toggle-row">
                                        <span>
                                            我了解并明白 EncorePass
                                            生成的票卡仅用于展示和收藏，不是也不能作为活动的入场凭证
                                        </span>
                                        <span className="switch">
                                            <input
                                                type="checkbox"
                                                role="switch"
                                                checked={
                                                    draft.barcode.userConfirmed
                                                }
                                                disabled={
                                                    exporting ||
                                                    clearing ||
                                                    importing
                                                }
                                                onChange={(event) =>
                                                    update('barcode', {
                                                        ...draft.barcode!,
                                                        userConfirmed:
                                                            event.target
                                                                .checked,
                                                    })
                                                }
                                            />
                                            <span />
                                        </span>
                                    </label>
                                )}
                            <div className="row export-card">
                                <div className="actions export-actions">
                                    <button
                                        className={
                                            remoteSign && supportsWallet
                                                ? 'button wallet-badge'
                                                : 'button button-gray'
                                        }
                                        disabled={
                                            exporting || clearing || importing
                                        }
                                        type="submit"
                                    >
                                        {exporting && (
                                            <span
                                                className="spinner"
                                                aria-hidden="true"
                                            />
                                        )}
                                        {remoteSign && supportsWallet ? (
                                            <Image
                                                src="/wallet/add-to-apple-wallet-cn.svg"
                                                alt="添加到 Apple 钱包"
                                                width={139}
                                                height={50}
                                                unoptimized
                                            />
                                        ) : exporting ? (
                                            '正在导出…'
                                        ) : remoteSign ? (
                                            '下载票卡'
                                        ) : (
                                            '导出票卡数据'
                                        )}
                                    </button>
                                </div>
                                {storageError && (
                                    <p role="alert" className="notice">
                                        {storageError}
                                    </p>
                                )}
                                {walletUrl && (
                                    <p className="notice">
                                        如果没有自动下载，请手动点击：
                                        <a
                                            href={walletUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {walletUrl}
                                        </a>
                                    </p>
                                )}
                                <p role="status" className="feedback">
                                    {message}
                                </p>
                            </div>
                        </Section>
                    </form>
                </div>
                <TicketPreview draft={draft} />
            </div>
            <ConfirmSheet
                open={pendingImport !== null}
                title="替换当前内容？"
                message="导入的文件会覆盖当前编辑器中的内容，此操作无法撤销。"
                confirmLabel="替换内容"
                closeLabel="取消导入"
                onCancel={() => setPendingImport(null)}
                onConfirm={applyImport}
            />
            <ConfirmSheet
                open={consentOpen}
                title="发送数据并签发票卡？"
                message="文字、条码和图片将发送到 walletmcppass.com，由对方证书签发。请勿填写敏感信息。"
                confirmLabel="同意"
                closeLabel="关闭"
                confirmTone="primary"
                returnFocus={consentSwitch}
                onCancel={() => setConsentOpen(false)}
                onConfirm={() => {
                    setConsentOpen(false)
                    setRemoteSign(true)
                    setWalletUrl('')
                    setMessage('')
                }}
            />
        </div>
    )
}
