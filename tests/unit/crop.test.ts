import { describe, expect, it } from 'vitest'
import { imageCropFrame } from '@/lib/ticket/appearance'
import {
    defaultCrop,
    fitCropAspect,
    fullCrop,
    imageCropSchema,
    isFullCrop,
    moveCrop,
    resizeCrop,
} from '@/lib/ticket/crop'

describe('image crop frames', () => {
    it('locks the cover slots and leaves fitted marks free', () => {
        expect(imageCropFrame('thumbnail', false)).toEqual({
            aspect: 1,
            label: '1:1',
        })
        expect(imageCropFrame('background', false)).toEqual({
            aspect: 343 / 503,
            label: '343:503',
        })
        expect(imageCropFrame('background', true)).toEqual({
            aspect: 358 / 448,
            label: '358:448',
        })
        expect(imageCropFrame('logo', false)).toEqual({ label: '自由比例' })
        expect(imageCropFrame('secondaryLogo', true)).toEqual({
            label: '自由比例',
        })
    })
})

describe('image crop geometry', () => {
    it('starts from the largest centred region for a locked aspect', () => {
        expect(defaultCrop(1200, 900, 1)).toEqual({
            x: 0.125,
            y: 0,
            width: 0.75,
            height: 1,
        })
        expect(defaultCrop(500, 1000, 1)).toEqual({
            x: 0,
            y: 0.25,
            width: 1,
            height: 0.5,
        })
        expect(defaultCrop(1000, 1000, 1)).toEqual(fullCrop)
        expect(defaultCrop(1000, 1000)).toEqual(fullCrop)
    })

    it('moves without leaving the source', () => {
        expect(
            moveCrop({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, 0.4, -0.4),
        ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 })
        expect(
            moveCrop({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, -0.4, 0.4),
        ).toEqual({ x: 0, y: 0.5, width: 0.5, height: 0.5 })
    })

    it('resizes freely from edges and corners', () => {
        const start = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }
        expect(resizeCrop(start, 'se', 0.1, 0.1)).toEqual({
            x: 0.2,
            y: 0.2,
            width: 0.5,
            height: 0.5,
        })
        expect(resizeCrop(start, 'nw', 0.1, 0.1)).toEqual({
            x: 0.3,
            y: 0.3,
            width: 0.3,
            height: 0.3,
        })
        expect(resizeCrop(start, 'e', 0.9, 0)).toEqual({
            x: 0.2,
            y: 0.2,
            width: 0.8,
            height: 0.4,
        })
    })

    it('keeps the pixel aspect while resizing a locked corner', () => {
        const start = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }
        expect(resizeCrop(start, 'se', 0.1, 0.1, { ratio: 1 })).toEqual({
            x: 0.1,
            y: 0.1,
            width: 0.6,
            height: 0.6,
        })
        // Up-right growth follows the stronger axis and stops at the source.
        expect(resizeCrop(start, 'ne', 0.1, -0.2, { ratio: 1 })).toEqual({
            x: 0.1,
            y: 0,
            width: 0.6,
            height: 0.6,
        })
    })

    it('fits a stored selection to a new locked aspect', () => {
        const stored = { x: 0.2, y: 0, width: 0.6, height: 1 }
        // A 1200x900 source makes this selection 0.8:1; a square target trims
        // its height, and a wider target trims more of it.
        expect(fitCropAspect(stored, 1200, 900, 1)).toEqual({
            x: 0.2,
            y: 0.1,
            width: 0.6,
            height: 0.8,
        })
        expect(fitCropAspect(stored, 1200, 900, 2)).toEqual({
            x: 0.2,
            y: 0.3,
            width: 0.6,
            height: 0.4,
        })
        expect(fitCropAspect(stored, 1200, 900)).toEqual(stored)
    })

    it('recognizes only a complete source region as full', () => {
        expect(isFullCrop(fullCrop)).toBe(true)
        expect(isFullCrop({ x: 0, y: 0, width: 0.99, height: 1 })).toBe(false)
        expect(isFullCrop({ x: 0.01, y: 0, width: 0.99, height: 1 })).toBe(
            false,
        )
    })

    it('validates stored crop rectangles', () => {
        expect(
            imageCropSchema.safeParse({
                x: 0.1,
                y: 0.1,
                width: 0.5,
                height: 0.5,
            }).success,
        ).toBe(true)
        expect(
            imageCropSchema.safeParse({
                x: 0.6,
                y: 0.1,
                width: 0.5,
                height: 0.5,
            }).success,
        ).toBe(false)
        expect(
            imageCropSchema.safeParse({ x: 0, y: 0, width: 0, height: 1 })
                .success,
        ).toBe(false)
        expect(
            imageCropSchema.safeParse({
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                extra: true,
            }).success,
        ).toBe(false)
    })
})
