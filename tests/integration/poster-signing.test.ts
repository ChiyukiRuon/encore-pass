import { afterEach, expect, it, vi } from 'vitest'
import forge from 'node-forge'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import sharp from 'sharp'
import { buildPass } from '@/lib/wallet/pass-builder'
import { ticket } from '../fixtures/ticket'

afterEach(() => vi.unstubAllEnvs())

it('signs 通用凭证 with the shared poster layout and no barcode', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'encore-poster-'))
    try {
        const caKeys = forge.pki.rsa.generateKeyPair(2048)
        const ca = forge.pki.createCertificate()
        ca.publicKey = caKeys.publicKey
        ca.serialNumber = '01'
        ca.validity.notBefore = new Date(Date.now() - 60000)
        ca.validity.notAfter = new Date(Date.now() + 86400000)
        ca.setSubject([
            { name: 'commonName', value: 'Synthetic intermediate - not Apple' },
        ])
        ca.setIssuer(ca.subject.attributes)
        ca.setExtensions([{ name: 'basicConstraints', cA: true }])
        ca.sign(caKeys.privateKey, forge.md.sha256.create())
        const keys = forge.pki.rsa.generateKeyPair(2048)
        const cert = forge.pki.createCertificate()
        cert.publicKey = keys.publicKey
        cert.serialNumber = '02'
        cert.validity.notBefore = ca.validity.notBefore
        cert.validity.notAfter = ca.validity.notAfter
        cert.setSubject([
            { name: 'commonName', value: 'Test pass' },
            { name: 'organizationalUnitName', value: 'TESTTEAM01' },
            { type: '0.9.2342.19200300.100.1.1', value: 'pass.test.encore' },
        ])
        cert.setIssuer(ca.subject.attributes)
        cert.sign(caKeys.privateKey, forge.md.sha256.create())
        for (const [name, value] of Object.entries({
            'cert.pem': forge.pki.certificateToPem(cert),
            'key.pem': forge.pki.privateKeyToPem(keys.privateKey),
            'wwdr.pem': forge.pki.certificateToPem(ca),
        }))
            await writeFile(join(folder, name), value)
        vi.stubEnv('EncorePass_SIGNING_MODE', 'local')
        vi.stubEnv('PASS_TYPE_IDENTIFIER', 'pass.test.encore')
        vi.stubEnv('APPLE_TEAM_ID', 'TESTTEAM01')
        vi.stubEnv('PASS_CERT_PATH', join(folder, 'cert.pem'))
        vi.stubEnv('PASS_KEY_PATH', join(folder, 'key.pem'))
        vi.stubEnv('APPLE_WWDR_CERT_PATH', join(folder, 'wwdr.pem'))

        const logo = await sharp({
            create: {
                width: 40,
                height: 20,
                channels: 4,
                background: '#654321',
            },
        })
            .png()
            .toBuffer()
        const background = await sharp({
            create: {
                width: 80,
                height: 120,
                channels: 3,
                background: '#123456',
            },
        })
            .png()
            .toBuffer()
        const files = unzipSync(
            new Uint8Array(
                await buildPass({
                    ...ticket,
                    passStyle: 'posterGeneric',
                    barcode: undefined,
                    appearance: {
                        ...ticket.appearance,
                        logoDataUrl: `data:image/png;base64,${logo.toString('base64')}`,
                        backgroundDataUrl: `data:image/png;base64,${background.toString('base64')}`,
                    },
                }),
            ),
        )
        const pass = JSON.parse(Buffer.from(files['pass.json']).toString())
        expect(pass.preferredStyleSchemes).toBeUndefined()
        expect(pass.posterGeneric.primaryFields[0].value).toBe(ticket.eventName)
        expect(pass.posterGeneric.footerFields).toHaveLength(1)
        expect(pass.generic).toBeDefined()
        expect(pass.eventTicket).toBeUndefined()
        expect(pass.barcodes).toBeUndefined()
        expect(files['artwork@2x.png']).toBeDefined()
        expect(files['artwork@3x.png']).toBeDefined()
        expect(files['primaryLogo@2x.png']).toBeDefined()
        expect(files['primaryLogo@3x.png']).toBeDefined()
        expect(files['background@2x.png']).toBeDefined()
        expect(files['logo@2x.png']).toBeDefined()
        expect(files.signature).toBeDefined()
    } finally {
        await rm(folder, { recursive: true, force: true })
    }
})
