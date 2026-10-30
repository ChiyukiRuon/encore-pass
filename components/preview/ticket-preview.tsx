'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { TicketBarcode, TicketDraft } from '@/lib/ticket/schema'
import {
    activeBarcode,
    barcodeProblem,
    usesBackgroundMask,
    usesPosterLayout,
} from '@/lib/ticket/validation'
import { imageTone } from '@/lib/import/files'
import { genericPosterFields, passFields } from '@/lib/wallet/pass-fields'

function Field({ label, value }: { label?: string; value: string }) {
    return (
        <div>
            {label && <p className="pass-label">{label}</p>}
            <span className="pass-value">{value}</span>
        </div>
    )
}

const barcodeBcids: Record<TicketBarcode['format'], string> = {
    QR: 'qrcode',
    PDF417: 'pdf417',
    AZTEC: 'azteccode',
    CODE128: 'code128',
}

const wideBarcodes = new Set<TicketBarcode['format']>(['PDF417', 'CODE128'])

// Draws the same code the pass will carry. bwip-js is loaded only when the
// barcode style is visible; nothing is transmitted.
function BarcodePreview({ barcode }: { barcode: TicketBarcode }) {
    const canvas = useRef<HTMLCanvasElement>(null)
    const [failed, setFailed] = useState(false)
    const wide = wideBarcodes.has(barcode.format)
    const problem = barcodeProblem(barcode)
    useEffect(() => {
        if (problem) return
        let active = true
        const timer = window.setTimeout(() => {
            void import('bwip-js/browser')
                .then(({ toCanvas }) => {
                    if (!active || !canvas.current) return
                    toCanvas(canvas.current, {
                        bcid: barcodeBcids[barcode.format],
                        text: barcode.message,
                        scale: wide ? 4 : 6,
                        padding: 0,
                        backgroundcolor: 'FFFFFF',
                        ...(barcode.format === 'CODE128'
                            ? { height: 18, includetext: false }
                            : {}),
                    })
                    if (active) setFailed(false)
                })
                .catch(() => {
                    if (active) setFailed(true)
                })
        }, 200)
        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [barcode.format, barcode.message, wide, problem])

    return (
        <div className="pass-barcode-panel" data-kind={wide ? 'wide' : 'qr'}>
            <canvas
                ref={canvas}
                className={
                    problem || failed ? 'pass-barcode-canvas-hidden' : undefined
                }
                role="img"
                aria-label="条码预览"
            />
            {(problem || failed) && (
                <span className="pass-barcode-error">条码内容无效</span>
            )}
            <span className="pass-barcode-alt">仅供展示</span>
        </div>
    )
}

// Approximates the two signing layouts: the classic event ticket (Wallet blurs
// the background) and the poster layout (bare header and seat footer). The
// barcode card sits at the classic bottom or above the poster footer.
export function TicketPreview({ draft }: { draft: TicketDraft }) {
    const [collapsed, setCollapsed] = useState(false)
    const [posterTone, setPosterTone] = useState<{
        url: string
        color: string
    }>()
    const posterLayout = usesPosterLayout(draft)
    const genericPoster = posterLayout && draft.passStyle === 'posterGeneric'
    const genericFields = genericPosterFields(draft)
    const barcode = activeBarcode(draft)
    const usesPosterTone = posterLayout
    const fields = passFields(draft)
    const { appearance } = draft
    const thumbnail = appearance.thumbnailDataUrl || appearance.heroDataUrl
    const logoText = draft.performer
    const primary = fields.primaryFields[0]
    const maskOpacity = usesBackgroundMask(draft)
        ? appearance.backgroundMaskOpacity
        : 0
    // The header always keeps two lines. With a start time the value sits above
    // it and the 日期 label is dropped; without one the label stays.
    const headerTime =
        posterLayout && !genericPoster
            ? fields.secondaryFields.find((field) => field.key === 'starts')
                  ?.value
            : undefined
    const seats = [
        { label: '区', value: draft.section },
        { label: '排', value: draft.row },
        { label: '座位', value: draft.seat },
    ].filter((seat) => seat.value)

    useEffect(() => {
        const url = appearance.backgroundDataUrl
        if (!usesPosterTone || !url) return
        let active = true
        void imageTone(url)
            .then((color) => {
                if (active) setPosterTone({ url, color })
            })
            .catch(() => {})
        return () => {
            active = false
        }
    }, [usesPosterTone, appearance.backgroundDataUrl])

    const tone =
        usesPosterTone &&
        appearance.backgroundDataUrl &&
        posterTone?.url === appearance.backgroundDataUrl
            ? posterTone.color
            : undefined

    return (
        <aside className="preview-column" aria-labelledby="preview-title">
            <div className="preview-toolbar">
                <h2 id="preview-title">Wallet 预览</h2>
                <div className="segmented" role="group" aria-label="票卡状态">
                    <button
                        type="button"
                        aria-pressed={!collapsed}
                        onClick={() => setCollapsed(false)}
                    >
                        正常
                    </button>
                    <button
                        type="button"
                        aria-pressed={collapsed}
                        onClick={() => setCollapsed(true)}
                    >
                        折叠
                    </button>
                </div>
            </div>
            <div className="wallet-stage">
                <div className="pass-frame">
                    <article
                        className="pass"
                        data-style={draft.passStyle}
                        data-layout={posterLayout ? 'poster' : 'classic'}
                        data-collapsed={collapsed}
                        aria-label={
                            draft.passStyle === 'posterGeneric'
                                ? '通用凭证预览'
                                : '活动门票预览'
                        }
                        style={
                            {
                                backgroundColor: appearance.backgroundColor,
                                color: appearance.foregroundColor,
                                '--pass-bg': appearance.backgroundColor,
                                '--pass-label': appearance.labelColor,
                                '--poster-tone': tone,
                            } as CSSProperties
                        }
                    >
                        {appearance.backgroundDataUrl && (
                            <img
                                className={
                                    posterLayout
                                        ? 'pass-background pass-background-clear'
                                        : 'pass-background'
                                }
                                src={appearance.backgroundDataUrl}
                                alt="票卡背景"
                            />
                        )}
                        {appearance.backgroundDataUrl && maskOpacity > 0 && (
                            <div
                                className="pass-mask"
                                aria-hidden="true"
                                style={{ opacity: maskOpacity }}
                            />
                        )}
                        {posterLayout && appearance.backgroundDataUrl && (
                            <div className="pass-scrim" aria-hidden="true" />
                        )}
                        <div className="pass-header">
                            {(appearance.logoDataUrl || logoText) && (
                                <div className="pass-identity">
                                    {appearance.logoDataUrl && (
                                        <img
                                            src={appearance.logoDataUrl}
                                            alt="票卡 Logo"
                                        />
                                    )}
                                    {logoText && (
                                        <span className="pass-identity-text">
                                            {logoText}
                                        </span>
                                    )}
                                </div>
                            )}
                            {fields.headerFields.map((field) => (
                                <div
                                    className="pass-header-field"
                                    key={field.key}
                                >
                                    {!headerTime && (
                                        <p className="pass-label">
                                            {field.label}
                                        </p>
                                    )}
                                    <span className="pass-value">
                                        {field.value}
                                    </span>
                                    {headerTime && (
                                        <span className="pass-header-time">
                                            {headerTime}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="pass-content" inert={collapsed}>
                            {genericPoster ? (
                                <>
                                    {barcode?.message && (
                                        <BarcodePreview barcode={barcode} />
                                    )}
                                    <footer className="pass-generic-footer">
                                        <div className="pass-generic-fields">
                                            {genericFields.primaryFields.map(
                                                (field) => (
                                                    <Field
                                                        key={field.key}
                                                        label={field.label}
                                                        value={field.value}
                                                    />
                                                ),
                                            )}
                                        </div>
                                        <div className="pass-generic-bottom">
                                            {genericFields.footerFields.map(
                                                (field) => (
                                                    <span key={field.key}>
                                                        {field.value}
                                                    </span>
                                                ),
                                            )}
                                        </div>
                                    </footer>
                                </>
                            ) : posterLayout ? (
                                <>
                                    {barcode?.message && (
                                        <BarcodePreview barcode={barcode} />
                                    )}
                                    <footer className="pass-event-footer">
                                        <div className="pass-event-seats">
                                            {seats.length > 0
                                                ? seats.map((seat) => (
                                                      <div
                                                          className="pass-event-seat"
                                                          key={seat.label}
                                                      >
                                                          <p>{seat.label}</p>
                                                          <span>
                                                              {seat.value}
                                                          </span>
                                                      </div>
                                                  ))
                                                : draft.eventName && (
                                                      // Without seat fields the band
                                                      // keeps its main line: the
                                                      // event name fills the row.
                                                      <div className="pass-event-seat">
                                                          <p>活动</p>
                                                          <span>
                                                              {draft.eventName}
                                                          </span>
                                                      </div>
                                                  )}
                                        </div>
                                        <div className="pass-event-bottom">
                                            {draft.venueName && (
                                                <span className="pass-event-venue">
                                                    {draft.venueName}
                                                </span>
                                            )}
                                            {draft.passStyle ===
                                                'posterEventTicket' &&
                                                appearance.secondaryLogoDataUrl && (
                                                    <img
                                                        className="pass-secondary-logo"
                                                        src={
                                                            appearance.secondaryLogoDataUrl
                                                        }
                                                        alt="二级标志"
                                                    />
                                                )}
                                        </div>
                                    </footer>
                                </>
                            ) : (
                                <div className="pass-body">
                                    <div className="pass-top">
                                        <div className="pass-top-fields">
                                            <div className="pass-primary">
                                                <p className="pass-label">
                                                    {primary?.label || '活动'}
                                                </p>
                                                <h2>
                                                    {primary?.value ||
                                                        draft.eventName ||
                                                        '活动名称'}
                                                </h2>
                                            </div>
                                            {fields.secondaryFields.length >
                                                0 && (
                                                <div className="pass-secondary">
                                                    {fields.secondaryFields.map(
                                                        (field) => (
                                                            <Field
                                                                key={field.key}
                                                                label={
                                                                    field.label
                                                                }
                                                                value={
                                                                    field.value
                                                                }
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {thumbnail && (
                                            <img
                                                className="pass-thumbnail"
                                                src={thumbnail}
                                                alt="票卡角标"
                                            />
                                        )}
                                    </div>
                                    {fields.auxiliaryFields.length > 0 && (
                                        <div className="pass-auxiliary">
                                            {fields.auxiliaryFields.map(
                                                (field) => (
                                                    <Field
                                                        key={field.key}
                                                        label={field.label}
                                                        value={field.value}
                                                    />
                                                ),
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {!posterLayout && barcode?.message && (
                                <BarcodePreview barcode={barcode} />
                            )}
                        </div>
                    </article>
                </div>
            </div>
            <p className="preview-note">
                最终显示效果可能会根据设备与系统版本的不同而有所差异
            </p>
        </aside>
    )
}
