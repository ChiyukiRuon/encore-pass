import { afterEach, expect, it, vi } from 'vitest'
import forge from 'node-forge'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import sharp from 'sharp'
import { buildPass } from '@/lib/wallet/pass-builder'
import { ticket } from '../fixtures/ticket'

afterEach(() => vi.unstubAllEnvs())

it('signs a complete ZIP with a verifiable detached PKCS7 signature using synthetic certificates', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'encore-test-'))
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
        const secondaryLogo = await sharp({
            create: { width: 4, height: 2, channels: 3, background: '#654321' },
        })
            .png()
            .toBuffer()
        const files = unzipSync(
            new Uint8Array(
                await buildPass({
                    ...ticket,
                    barcodeEnabled: true,
                    appearance: {
                        ...ticket.appearance,
                        secondaryLogoDataUrl: `data:image/png;base64,${secondaryLogo.toString('base64')}`,
                    },
                }),
            ),
        )
        expect(files.signature).toBeDefined()
        expect(files['secondaryLogo@2x.png']).toBeDefined()
        const pass = JSON.parse(Buffer.from(files['pass.json']).toString())
        expect(pass.barcodes).toEqual([
            {
                format: 'PKBarcodeFormatQR',
                message: ticket.barcode!.message,
                messageEncoding: 'utf-8',
                altText: '仅供展示',
            },
        ])
        const manifest = JSON.parse(
            Buffer.from(files['manifest.json']).toString(),
        )
        for (const [name, hash] of Object.entries(manifest))
            expect(createHash('sha1').update(files[name]).digest('hex')).toBe(
                hash,
            )
        const asn1 = forge.asn1.fromDer(
            forge.util.createBuffer(
                Buffer.from(files.signature).toString('binary'),
            ),
        )
        const signed = forge.pkcs7.messageFromAsn1(asn1)
        const raw = (
            signed as unknown as {
                rawCapture: {
                    authenticatedAttributes: forge.asn1.Asn1[]
                    signature: string
                }
            }
        ).rawCapture
        const attributes = forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.SET,
            true,
            raw.authenticatedAttributes,
        )
        const digest = forge.md.sha1
            .create()
            .update(forge.asn1.toDer(attributes).getBytes())
        expect(
            keys.publicKey.verify(digest.digest().getBytes(), raw.signature),
        ).toBe(true)
        const manifestDigest = forge.md.sha1
            .create()
            .update(Buffer.from(files['manifest.json']).toString('binary'))
            .digest()
            .getBytes()
        const messageDigest = raw.authenticatedAttributes.find(
            (attribute) =>
                forge.asn1.derToOid(
                    (attribute.value as forge.asn1.Asn1[])[0].value as string,
                ) === forge.pki.oids.messageDigest,
        )
        expect(
            (
                (messageDigest!.value as forge.asn1.Asn1[])[1]
                    .value as forge.asn1.Asn1[]
            )[0].value,
        ).toBe(manifestDigest)
        vi.stubEnv('APPLE_TEAM_ID', 'WRONG')
        await expect(buildPass(ticket)).rejects.toThrow('不匹配')
    } finally {
        await rm(folder, { recursive: true, force: true })
    }
})
