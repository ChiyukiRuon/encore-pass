import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import bwip from 'bwip-js/node'

await mkdir('tests/fixtures/generated', { recursive: true })
const barcode = await bwip.toBuffer({
    bcid: 'qrcode',
    text: 'ENCORE-SYNTHETIC-NOT-VALID-2026',
    scale: 4,
    padding: 16,
    backgroundcolor: 'FFFFFF',
})
const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="white"/><g fill="black" font-family="Arial" font-size="42"><text x="60" y="100">Event: Encore Test Concert</text><text x="60" y="180">Venue: Example Music Hall</text><text x="60" y="260">Seat: 12</text><text x="60" y="340">Starts: 2026-12-12T19:30</text></g></svg>`,
)
await sharp(svg)
    .composite([{ input: barcode, left: 60, top: 430 }])
    .png()
    .toFile('tests/fixtures/generated/ticket.png')
