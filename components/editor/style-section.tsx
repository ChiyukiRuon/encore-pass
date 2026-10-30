'use client'

import { useId, useState } from 'react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { TicketBarcode, TicketDraft } from '@/lib/ticket/schema'
import { imageCropFrame, passImages } from '@/lib/ticket/appearance'
import type { ImageSlot } from '@/lib/ticket/appearance'
import { appearanceImage, cropImage } from '@/lib/import/files'
import { isFullCrop } from '@/lib/ticket/crop'
import type { ImageCrop } from '@/lib/ticket/crop'
import {
    activeBarcode,
    barcodeProblem,
    usesBackgroundMask,
    usesPosterLayout,
} from '@/lib/ticket/validation'
import type { DraftUpdate } from './event-section'
import { ImageCropDialog } from './image-crop-dialog'
import { Section } from './section'

const colors = [
    ['backgroundColor', '背景颜色'],
    ['foregroundColor', '文字颜色'],
    ['labelColor', '标签颜色'],
] as const

const slots: [ImageSlot, string, string][] = [
    ['logo', 'Logo', '左上角 · 最大 160×50'],
    ['thumbnail', '缩略图', '右上部分 · 90×90'],
    ['background', '背景图片', '整张票卡'],
    ['secondaryLogo', '二级标志', '右下角 · 最大 135×12'],
]

const barcodeOptions: [TicketBarcode['format'], string][] = [
    ['QR', 'QR 二维码'],
    ['PDF417', 'PDF417 条码'],
    ['AZTEC', 'AZTEC 二维码'],
    ['CODE128', 'CODE128 一维码'],
]

// The highlighted image region is primary; the complete ticket and field lines
// provide context. Reuse surface, tertiary and tint tokens without new actions.
function SlotDiagram({
    slot,
    data,
    label,
}: {
    slot: ImageSlot
    data?: string
    label: string
}) {
    const clipId = useId()
    const ticketClipId = useId()
    // Use the supplied event-ticket reference's proportions and field layout.
    // One contour keeps the shallow top notch open, including on backgrounds.
    const ticketShape =
        'M28 16H152.5C170 35 205 35 222.5 16H347Q359 16 359 28V507Q359 519 347 519H28Q16 519 16 507V28Q16 16 28 16Z'
    const region = {
        logo: { x: 32, y: 32, width: 125, height: 30, rx: 4 },
        thumbnail: { x: 264, y: 84, width: 80, height: 80, rx: 16 },
        background: { x: 16, y: 16, width: 343, height: 503, rx: 12 },
        secondaryLogo: { x: 208, y: 499, width: 135, height: 12, rx: 2 },
    }[slot]
    const highlight =
        slot === 'background' ? <path d={ticketShape} /> : <rect {...region} />
    return (
        <svg
            viewBox="0 0 375 535"
            fill="none"
            role="img"
            aria-label={`${label}位置示意图`}
        >
            <defs>
                <clipPath id={clipId}>{highlight}</clipPath>
                <clipPath id={ticketClipId}>
                    <path d={ticketShape} />
                </clipPath>
            </defs>
            <path className="slot-ticket" d={ticketShape} />
            <g clipPath={`url(#${ticketClipId})`}>
                {slot !== 'thumbnail' && (
                    <rect
                        className="slot-placeholder"
                        x="264"
                        y="84"
                        width="80"
                        height="80"
                        rx="16"
                    />
                )}
                <g className="slot-highlight">{highlight}</g>
                {data && (
                    <image
                        href={data}
                        x={region.x}
                        y={region.y}
                        width={region.width}
                        height={region.height}
                        preserveAspectRatio={
                            slot === 'background'
                                ? 'xMidYMid slice'
                                : slot === 'logo'
                                  ? 'xMinYMid meet'
                                  : slot === 'secondaryLogo'
                                    ? 'xMaxYMid meet'
                                    : 'xMidYMid meet'
                        }
                        clipPath={`url(#${clipId})`}
                        opacity={slot === 'background' ? 0.45 : 1}
                    />
                )}
                <path
                    className="slot-labels"
                    d="M310 32h32 M32 90h24 M32 142h24 M32 196h24 M208 196h20 M270 196h12 M316 196h20"
                />
                <path
                    className="slot-fields"
                    d="M314 49h28 M32 110h112 M32 164h56 M32 218h104 M210 218h16 M268 218h16 M320 218h12"
                />
                {slot !== 'logo' && (
                    <g>
                        <circle
                            className="slot-logo-mark"
                            cx="46"
                            cy="45"
                            r="10"
                        />
                        <path className="slot-fields" d="M74 45h68" />
                    </g>
                )}
                {/* Decorative bars only: no encoded ticket data. */}
                <rect
                    className="slot-barcode-panel"
                    x="59"
                    y="411"
                    width="257"
                    height="76"
                    rx="4"
                />
                <path
                    className="slot-barcode"
                    d="M85 429v40 M95 429v40 M113 429v40 M123 429v40 M141 429v40 M159 429v40 M169 429v40 M187 429v40 M205 429v40 M215 429v40 M233 429v40 M243 429v40 M261 429v40 M279 429v40 M289 429v40"
                />
                <path
                    className="slot-barcode-wide"
                    d="M104 429v40 M132 429v40 M150 429v40 M178 429v40 M196 429v40 M224 429v40 M252 429v40 M270 429v40"
                />
            </g>
            <g className="slot-outline">{highlight}</g>
        </svg>
    )
}

export function StyleSection({
    draft,
    update,
    setDraft,
    onMessage,
}: {
    draft: TicketDraft
    update: DraftUpdate
    setDraft: Dispatch<SetStateAction<TicketDraft | null>>
    onMessage: (message: string) => void
}) {
    const { appearance } = draft
    const barcode = activeBarcode(draft)
    const posterLayout = usesPosterLayout(draft)
    const [barcodeFormat, setBarcodeFormat] =
        useState<TicketBarcode['format']>()
    const [cropRequest, setCropRequest] = useState<{
        slot: ImageSlot
        title: string
        source: string
        crop?: ImageCrop
    } | null>(null)
    const selectedFormat = barcodeFormat ?? draft.barcode?.format ?? 'QR'
    const barcodeError = barcode ? barcodeProblem(barcode) : undefined
    const visibleSlots = slots.filter(
        ([slot]) =>
            slot !== 'secondaryLogo' ||
            (draft.passStyle === 'posterEventTicket' && posterLayout),
    )
    // The background frame follows the layout this style will use, not the
    // current one: uploading artwork switches poster styles to the poster view.
    const framePoster =
        draft.passStyle === 'posterGeneric' ||
        (draft.passStyle === 'posterEventTicket' && !!barcode)
    const cropFrame = cropRequest
        ? imageCropFrame(
              cropRequest.slot,
              framePoster,
              draft.passStyle === 'posterGeneric',
          )
        : undefined

    function slotTitle(slot: ImageSlot) {
        return slots.find(([key]) => key === slot)?.[1] ?? slot
    }

    async function chooseImage(slot: ImageSlot, file: File) {
        try {
            const source = await appearanceImage(file)
            setCropRequest({ slot, title: slotTitle(slot), source })
        } catch (error) {
            onMessage(error instanceof Error ? error.message : '图片处理失败')
        }
    }

    function editImage(slot: ImageSlot) {
        const data = appearance[passImages[slot].key]
        if (!data) return
        // Old drafts already store the final slot image; use it as the source
        // when no separate original was kept.
        const source = appearance.imageSources?.[slot]
        setCropRequest({
            slot,
            title: slotTitle(slot),
            source: source ?? data,
            crop: source ? appearance.imageCrops?.[slot] : undefined,
        })
    }

    async function applyCrop(crop: ImageCrop) {
        const request = cropRequest
        if (!request) return
        setCropRequest(null)
        try {
            const output = await cropImage(request.source, request.slot, crop)
            setDraft((current) => {
                if (!current) return current
                const imageCrops = { ...current.appearance.imageCrops }
                const imageSources = { ...current.appearance.imageSources }
                if (isFullCrop(crop)) {
                    delete imageCrops[request.slot]
                    delete imageSources[request.slot]
                } else {
                    imageCrops[request.slot] = crop
                    imageSources[request.slot] = request.source
                }
                const next = {
                    ...current.appearance,
                    [passImages[request.slot].key]: output,
                }
                if (Object.keys(imageCrops).length) next.imageCrops = imageCrops
                else delete next.imageCrops
                if (Object.keys(imageSources).length)
                    next.imageSources = imageSources
                else delete next.imageSources
                return { ...current, appearance: next }
            })
        } catch (error) {
            onMessage(error instanceof Error ? error.message : '图片处理失败')
        }
    }

    function removeImage(slot: ImageSlot) {
        setDraft((current) => {
            if (!current) return current
            const next = { ...current.appearance }
            delete next[passImages[slot].key]
            const imageCrops = { ...next.imageCrops }
            const imageSources = { ...next.imageSources }
            delete imageCrops[slot]
            delete imageSources[slot]
            if (Object.keys(imageCrops).length) next.imageCrops = imageCrops
            else delete next.imageCrops
            if (Object.keys(imageSources).length)
                next.imageSources = imageSources
            else delete next.imageSources
            return { ...current, appearance: next }
        })
    }

    function changeBarcodeFormat(format: TicketBarcode['format']) {
        setBarcodeFormat(format)
        if (barcode)
            update('barcode', { ...barcode, format, userConfirmed: false })
    }

    function changeBarcodeMessage(message: string) {
        if (!message) {
            update('barcode', undefined)
            return
        }
        update('barcode', {
            format: selectedFormat,
            message,
            encoding: 'utf-8',
            userConfirmed: false,
        })
    }

    const usesImage = !!appearance.backgroundDataUrl

    return (
        <>
            <Section
                step={2}
                title="自定义你的票卡"
                description="设置文本颜色，添加 Logo 与背景图像"
            >
                <div className="row style-row">
                    <div className="style-copy">
                        <span className="style-label">票卡样式</span>
                    </div>
                    <div
                        className="segmented"
                        role="group"
                        aria-label="票卡样式"
                    >
                        <button
                            type="button"
                            aria-pressed={draft.passStyle === 'eventTicket'}
                            onClick={() => update('passStyle', 'eventTicket')}
                        >
                            活动门票
                        </button>
                        <button
                            type="button"
                            aria-pressed={
                                draft.passStyle === 'posterEventTicket'
                            }
                            onClick={() =>
                                update('passStyle', 'posterEventTicket')
                            }
                        >
                            活动门票(海报)
                        </button>
                        <button
                            type="button"
                            aria-pressed={draft.passStyle === 'posterGeneric'}
                            onClick={() => update('passStyle', 'posterGeneric')}
                        >
                            通用凭证
                        </button>
                    </div>
                </div>
                <label className="row toggle-row">
                    <span>
                        显示条码
                        <small className="row-hint">填写内容后显示条码</small>
                    </span>
                    <span className="switch">
                        <input
                            type="checkbox"
                            role="switch"
                            aria-label="显示条码"
                            checked={draft.barcodeEnabled}
                            onChange={(event) =>
                                update('barcodeEnabled', event.target.checked)
                            }
                        />
                        <span />
                    </span>
                </label>
                {draft.barcodeEnabled && (
                    <>
                        <label className="row field field-select">
                            <span className="field-label">条码格式</span>
                            <select
                                aria-label="条码格式"
                                value={selectedFormat}
                                onChange={(event) =>
                                    changeBarcodeFormat(
                                        event.target
                                            .value as TicketBarcode['format'],
                                    )
                                }
                            >
                                {barcodeOptions.map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="row field">
                            <span className="field-label">条码内容</span>
                            <textarea
                                aria-label="条码内容"
                                className="barcode-message"
                                maxLength={2048}
                                value={draft.barcode?.message ?? ''}
                                placeholder="留空则不显示条码"
                                onChange={(event) =>
                                    changeBarcodeMessage(event.target.value)
                                }
                            />
                            {barcodeError ? (
                                <small className="barcode-error" role="alert">
                                    {barcodeError}
                                </small>
                            ) : (
                                <small>
                                    EncorePass 不保证票卡中条码的实际可用性
                                </small>
                            )}
                        </label>
                    </>
                )}
                {colors.map(([key, label]) => (
                    <label className="row color-row" key={key}>
                        <span className="color-name">{label}</span>
                        <span className="color-hex">{appearance[key]}</span>
                        <input
                            type="color"
                            value={appearance[key]}
                            onChange={(event) =>
                                update('appearance', {
                                    ...appearance,
                                    [key]: event.target.value,
                                })
                            }
                        />
                    </label>
                ))}
                <div
                    className="row image-slots"
                    style={
                        {
                            '--slot-count': visibleSlots.length,
                        } as CSSProperties
                    }
                >
                    {visibleSlots.map(([slot, title, spec]) => {
                        const data = appearance[passImages[slot].key]
                        return (
                            <div className="image-slot" key={slot}>
                                <div
                                    className="image-slot-preview"
                                    data-slot={slot}
                                >
                                    <SlotDiagram
                                        slot={slot}
                                        data={data}
                                        label={title}
                                    />
                                </div>
                                <div className="image-slot-text">
                                    <strong>{title}</strong>
                                    <small>{spec}</small>
                                </div>
                                <div className="image-slot-actions">
                                    {data && (
                                        <button
                                            type="button"
                                            className="button button-plain button-small"
                                            aria-label={`调整${title}区域`}
                                            onClick={() => editImage(slot)}
                                        >
                                            调整
                                        </button>
                                    )}
                                    <label className="button button-gray button-small file-button">
                                        {data ? '更换' : '选择'}
                                        <input
                                            type="file"
                                            aria-label={title}
                                            accept="image/png,image/jpeg,image/webp"
                                            onChange={(event) => {
                                                const file =
                                                    event.target.files?.[0]
                                                event.target.value = ''
                                                if (file)
                                                    void chooseImage(slot, file)
                                            }}
                                        />
                                    </label>
                                    {data && (
                                        <button
                                            type="button"
                                            className="button button-plain button-destructive button-small"
                                            aria-label={`移除${title}`}
                                            onClick={() => removeImage(slot)}
                                        >
                                            移除
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
                {usesImage && usesBackgroundMask(draft) && (
                    <label className="row mask-row">
                        <span className="mask-name">背景遮罩</span>
                        <input
                            type="range"
                            aria-label="背景遮罩"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(
                                appearance.backgroundMaskOpacity * 100,
                            )}
                            onChange={(event) =>
                                update('appearance', {
                                    ...appearance,
                                    backgroundMaskOpacity:
                                        Number(event.target.value) / 100,
                                })
                            }
                        />
                        <span className="mask-value">
                            {Math.round(appearance.backgroundMaskOpacity * 100)}
                            %
                        </span>
                    </label>
                )}
            </Section>
            {cropRequest && cropFrame && (
                <ImageCropDialog
                    title={cropRequest.title}
                    source={cropRequest.source}
                    initialCrop={cropRequest.crop}
                    aspect={cropFrame.aspect}
                    lockLabel={cropFrame.label}
                    onCancel={() => setCropRequest(null)}
                    onConfirm={(crop) => void applyCrop(crop)}
                />
            )}
        </>
    )
}
