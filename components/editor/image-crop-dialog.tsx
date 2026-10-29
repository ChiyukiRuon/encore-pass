'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type {
    AnimationEvent,
    KeyboardEvent,
    MouseEvent,
    PointerEvent,
} from 'react'
import {
    cropHandles,
    defaultCrop,
    fitCropAspect,
    moveCrop,
    resizeCrop,
} from '@/lib/ticket/crop'
import type { CropHandle, ImageCrop } from '@/lib/ticket/crop'

const minimumSize = 48
const stageInset = 18
const maximumScale = 8

type Drag = {
    pointerId: number
    mode: 'move' | CropHandle
    startX: number
    startY: number
    start: ImageCrop
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

// A mounted sheet: the parent renders it only while a selection is being
// edited and unmounts it after the closing animation. The downscaled source
// stays in the draft, so reopening restores the same selection.
export function ImageCropDialog({
    title,
    source,
    initialCrop,
    aspect,
    lockLabel,
    onCancel,
    onConfirm,
}: {
    title: string
    source: string
    initialCrop?: ImageCrop
    aspect?: number
    lockLabel: string
    onCancel: () => void
    onConfirm: (crop: ImageCrop) => void
}) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const frameRef = useRef<HTMLDivElement>(null)
    const pending = useRef<(() => void) | null>(null)
    const restoreFocus = useRef<HTMLElement | null>(null)
    const drag = useRef<Drag | null>(null)
    const titleId = useId()
    const hintId = useId()
    const [closing, setClosing] = useState(false)
    const [natural, setNatural] = useState<{ width: number; height: number }>()
    const [failed, setFailed] = useState(false)
    const [box, setBox] = useState({ width: 0, height: 0 })
    const [crop, setCrop] = useState<ImageCrop>(
        initialCrop ?? { x: 0, y: 0, width: 1, height: 1 },
    )

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        restoreFocus.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null
        document.body.classList.add('has-dialog')
        dialog.showModal()
        return () => document.body.classList.remove('has-dialog')
    }, [])

    useEffect(() => {
        let active = true
        const image = new Image()
        image.onload = () => {
            if (!active) return
            const width = image.naturalWidth
            const height = image.naturalHeight
            setNatural({ width, height })
            setCrop(
                fitCropAspect(
                    initialCrop ?? defaultCrop(width, height, aspect),
                    width,
                    height,
                    aspect,
                ),
            )
        }
        image.onerror = () => {
            if (active) setFailed(true)
        }
        image.src = source
        return () => {
            active = false
            image.onload = null
            image.onerror = null
        }
    }, [source, initialCrop, aspect])

    useEffect(() => {
        const stage = stageRef.current
        if (!stage) return
        const measure = () =>
            setBox({ width: stage.clientWidth, height: stage.clientHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(stage)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (natural) frameRef.current?.focus({ preventScroll: true })
    }, [natural])

    useEffect(() => {
        if (!closing) return
        const timer = setTimeout(() => dialogRef.current?.close(), 500)
        return () => clearTimeout(timer)
    }, [closing])

    function requestClose(action: () => void) {
        const dialog = dialogRef.current
        if (!dialog?.open || closing) return
        pending.current = action
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

    const availableWidth = Math.max(0, box.width - stageInset * 2)
    const availableHeight = Math.max(0, box.height - stageInset * 2)
    const scale =
        natural && availableWidth > 0 && availableHeight > 0
            ? Math.min(
                  availableWidth / natural.width,
                  availableHeight / natural.height,
                  maximumScale,
              )
            : 0
    const imageWidth = natural ? natural.width * scale : 0
    const imageHeight = natural ? natural.height * scale : 0
    const imageLeft = (box.width - imageWidth) / 2
    const imageTop = (box.height - imageHeight) / 2
    const ratio =
        aspect && imageHeight > 0
            ? imageWidth / (aspect * imageHeight)
            : undefined
    const minimumWidth =
        imageWidth > 0 ? Math.min(1, minimumSize / imageWidth) : 1
    const minimumHeight =
        imageHeight > 0 ? Math.min(1, minimumSize / imageHeight) : 1
    const lockedMinimumWidth =
        ratio && imageHeight > 0
            ? Math.max(
                  minimumWidth,
                  Math.min(1, minimumSize / imageHeight / ratio),
              )
            : minimumWidth

    const frameLeft = imageLeft + crop.x * imageWidth
    const frameTop = imageTop + crop.y * imageHeight
    const frameWidth = crop.width * imageWidth
    const frameHeight = crop.height * imageHeight
    const shades = [
        {
            left: imageLeft,
            top: imageTop,
            width: imageWidth,
            height: Math.max(0, frameTop - imageTop),
        },
        {
            left: imageLeft,
            top: frameTop + frameHeight,
            width: imageWidth,
            height: Math.max(
                0,
                imageTop + imageHeight - frameTop - frameHeight,
            ),
        },
        {
            left: imageLeft,
            top: frameTop,
            width: Math.max(0, frameLeft - imageLeft),
            height: frameHeight,
        },
        {
            left: frameLeft + frameWidth,
            top: frameTop,
            width: Math.max(0, imageLeft + imageWidth - frameLeft - frameWidth),
            height: frameHeight,
        },
    ]
    const shownHandles = aspect
        ? cropHandles.filter((handle) => handle.length === 2)
        : cropHandles

    function startDrag(event: PointerEvent<HTMLDivElement>) {
        if (!natural || closing) return
        const target = (event.target as HTMLElement).closest<HTMLElement>(
            '[data-handle]',
        )
        const mode = target?.dataset.handle
        if (!mode) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
            pointerId: event.pointerId,
            mode: mode as 'move' | CropHandle,
            startX: event.clientX,
            startY: event.clientY,
            start: crop,
        }
    }

    function moveDrag(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current
        if (
            !current ||
            current.pointerId !== event.pointerId ||
            imageWidth <= 0 ||
            imageHeight <= 0
        )
            return
        const dx = (event.clientX - current.startX) / imageWidth
        const dy = (event.clientY - current.startY) / imageHeight
        setCrop(
            current.mode === 'move'
                ? moveCrop(current.start, dx, dy)
                : resizeCrop(current.start, current.mode, dx, dy, {
                      ratio,
                      minWidth: lockedMinimumWidth,
                      minHeight: minimumHeight,
                  }),
        )
    }

    function endDrag(event: PointerEvent<HTMLDivElement>) {
        if (drag.current?.pointerId === event.pointerId) drag.current = null
    }

    function handleKey(event: KeyboardEvent<HTMLDivElement>) {
        const step = event.shiftKey ? 0.02 : 0.005
        const movement: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        }
        const delta = movement[event.key]
        if (!delta) return
        event.preventDefault()
        setCrop(
            event.shiftKey
                ? resizeCrop(crop, 'se', delta[0], delta[1], {
                      ratio,
                      minWidth: lockedMinimumWidth,
                      minHeight: minimumHeight,
                  })
                : moveCrop(crop, delta[0], delta[1]),
        )
    }

    function resetCrop() {
        if (!natural) return
        setCrop(defaultCrop(natural.width, natural.height, aspect))
    }

    return (
        <dialog
            ref={dialogRef}
            className={
                closing
                    ? 'help-dialog crop-dialog is-closing'
                    : 'help-dialog crop-dialog'
            }
            aria-labelledby={titleId}
            aria-describedby={hintId}
            onCancel={(event) => {
                event.preventDefault()
                requestClose(onCancel)
            }}
            onClick={handleDialogClick}
            onAnimationEnd={handleAnimationEnd}
            onClose={() => {
                setClosing(false)
                document.body.classList.remove('has-dialog')
                restoreFocus.current?.focus()
                const action = pending.current
                pending.current = null
                action?.()
            }}
        >
            <header className="help-header">
                <div>
                    <p className="help-eyebrow">图片区域</p>
                    <h2 id={titleId}>选择{title}区域</h2>
                    <p className="help-subtitle" id={hintId}>
                        拖动选框选择要显示的部分，框外内容会被裁掉。
                    </p>
                </div>
                <button
                    className="icon-button help-close"
                    type="button"
                    aria-label="取消选择"
                    onClick={() => requestClose(onCancel)}
                >
                    <CloseIcon />
                </button>
            </header>
            <div className="help-body crop-body">
                <div className="crop-stage" ref={stageRef}>
                    {natural && !failed && (
                        <>
                            <img
                                className="crop-image"
                                src={source}
                                alt="待裁切的图片"
                                draggable={false}
                                style={{
                                    left: imageLeft,
                                    top: imageTop,
                                    width: imageWidth,
                                    height: imageHeight,
                                }}
                            />
                            {shades.map((shade, index) => (
                                <div
                                    className="crop-shade"
                                    key={index}
                                    style={shade}
                                />
                            ))}
                            <div
                                ref={frameRef}
                                className="crop-frame"
                                data-handle="move"
                                role="group"
                                tabIndex={0}
                                aria-label="裁切选框，方向键移动，按住 Shift 缩放"
                                style={{
                                    left: frameLeft,
                                    top: frameTop,
                                    width: frameWidth,
                                    height: frameHeight,
                                }}
                                onPointerDown={startDrag}
                                onPointerMove={moveDrag}
                                onPointerUp={endDrag}
                                onPointerCancel={endDrag}
                                onKeyDown={handleKey}
                            >
                                <span
                                    className="crop-grid-line crop-grid-line-v"
                                    style={{ left: '33.333%' }}
                                />
                                <span
                                    className="crop-grid-line crop-grid-line-v"
                                    style={{ left: '66.666%' }}
                                />
                                <span
                                    className="crop-grid-line crop-grid-line-h"
                                    style={{ top: '33.333%' }}
                                />
                                <span
                                    className="crop-grid-line crop-grid-line-h"
                                    style={{ top: '66.666%' }}
                                />
                                {shownHandles.map((handle) => (
                                    <span
                                        className={`crop-handle crop-handle-${handle}`}
                                        data-handle={handle}
                                        key={handle}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                    {!natural && !failed && (
                        <span className="crop-loading">正在读取图片…</span>
                    )}
                    {failed && (
                        <span className="crop-loading">
                            无法读取这张图片，请换一张。
                        </span>
                    )}
                </div>
                <div className="crop-meta">
                    <span className="crop-lock">{lockLabel}</span>
                    <span className="crop-hint">
                        拖动选框移动，拖动四角缩放；方向键微调，Shift+方向键缩放
                    </span>
                </div>
            </div>
            <footer className="help-footer crop-footer">
                <button
                    className="button button-plain button-small"
                    type="button"
                    disabled={!natural || failed}
                    onClick={resetCrop}
                >
                    重置
                </button>
                <div className="crop-footer-actions">
                    <button
                        className="button button-gray"
                        type="button"
                        onClick={() => requestClose(onCancel)}
                    >
                        取消
                    </button>
                    <button
                        className="button button-primary"
                        type="button"
                        disabled={!natural || failed}
                        onClick={() => requestClose(() => onConfirm(crop))}
                    >
                        使用此区域
                    </button>
                </div>
            </footer>
        </dialog>
    )
}
