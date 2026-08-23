import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { isIP } from 'node:net'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const invalidRemoteUrl = () => new Error('下载地址必须是安全的 HTTPS 公网地址')

const isPrivateIpv4 = (address) => {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

const isPrivateIp = (hostname) => {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const version = isIP(address)
  if (version === 4) return isPrivateIpv4(address)
  if (version !== 6) return false
  if (address.startsWith('::ffff:')) return isPrivateIpv4(address.slice('::ffff:'.length))
  return address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb')
}

export const assertSafeRemoteUrl = (value) => {
  let parsed
  try {
    parsed = new URL(String(value || ''))
  } catch {
    throw invalidRemoteUrl()
  }
  const hostname = parsed.hostname.toLowerCase()
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    isPrivateIp(hostname)
  ) {
    throw invalidRemoteUrl()
  }
  return parsed
}

const fetchChecked = async (url, { fetchImpl, maxBytes }) => {
  let currentUrl = assertSafeRemoteUrl(url)
  let response
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    response = await fetchImpl(currentUrl, { redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    if (redirectCount === 5) throw new Error('下载重定向次数过多')
    const location = response.headers.get('location')
    if (!location) throw new Error('下载重定向缺少目标地址')
    currentUrl = assertSafeRemoteUrl(new URL(location, currentUrl).href)
  }
  if (!response.ok) throw new Error(`下载失败(${response.status})`)
  if (response.url) assertSafeRemoteUrl(response.url)
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`下载内容超过 ${maxBytes} 字节限制`)
  }
  if (!response.body) throw new Error('下载响应没有内容')
  return response
}

export const downloadToFile = async (url, targetPath, {
  fetchImpl = globalThis.fetch,
  maxBytes,
} = {}) => {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('必须配置有效的下载大小限制')
  try {
    const response = await fetchChecked(url, { fetchImpl, maxBytes })
    let received = 0
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length
        if (received > maxBytes) {
          callback(new Error(`下载内容超过 ${maxBytes} 字节限制`))
          return
        }
        callback(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(targetPath))
    return { bytes: received, contentType: response.headers.get('content-type') || '' }
  } catch (error) {
    await rm(targetPath, { force: true }).catch(() => {})
    throw error
  }
}

export const fetchTextLimited = async (url, {
  fetchImpl = globalThis.fetch,
  maxBytes,
} = {}) => {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('必须配置有效的下载大小限制')
  const response = await fetchChecked(url, { fetchImpl, maxBytes })
  const chunks = []
  let received = 0
  for await (const chunk of Readable.fromWeb(response.body)) {
    received += chunk.length
    if (received > maxBytes) throw new Error(`下载内容超过 ${maxBytes} 字节限制`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
