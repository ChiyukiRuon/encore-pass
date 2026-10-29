import { readFile } from 'node:fs/promises'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import { PKPass } from 'passkit-generator'
import { AppError } from '@/lib/server/errors'
import type { Issuer } from '../pass-mapper'

export async function localSign(
    files: Record<string, Buffer>,
    issuer: Issuer,
): Promise<Buffer> {
    const paths = [
        process.env.PASS_CERT_PATH,
        process.env.PASS_KEY_PATH,
        process.env.APPLE_WWDR_CERT_PATH,
    ]
    if (paths.some((path) => !path))
        throw new AppError(503, 'SIGNING_UNAVAILABLE', '未配置完整签名证书')
    let signerCert: Buffer, signerKey: Buffer, wwdr: Buffer
    try {
        ;[signerCert, signerKey, wwdr] = await Promise.all(
            paths.map((path) => readFile(path!)),
        )
        const cert = new X509Certificate(signerCert)
        const intermediate = new X509Certificate(wwdr)
        const subject = cert.subject.split('\n')
        const now = Date.now()
        if (
            !subject.includes(`UID=${issuer.passTypeIdentifier}`) ||
            !subject.includes(`OU=${issuer.teamIdentifier}`)
        )
            throw new Error('identity')
        for (const item of [cert, intermediate]) {
            if (
                now < Date.parse(item.validFrom) ||
                now > Date.parse(item.validTo)
            )
                throw new Error('validity')
        }
        if (
            !cert.verify(intermediate.publicKey) ||
            !cert.checkPrivateKey(
                createPrivateKey({
                    key: signerKey,
                    passphrase: process.env.PASS_KEY_PASSWORD,
                }),
            )
        )
            throw new Error('chain')
    } catch {
        throw new AppError(
            503,
            'SIGNING_UNAVAILABLE',
            '证书无法读取，或有效期、团队标识、Pass Type ID、私钥及 WWDR 不匹配',
        )
    }
    const pass = new PKPass(files, {
        signerCert,
        signerKey,
        wwdr,
        signerKeyPassphrase: process.env.PASS_KEY_PASSWORD,
    })
    return pass.getAsBuffer()
}
