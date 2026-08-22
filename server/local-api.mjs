/** 本机媒体处理与 RunningHub 代理服务。 */
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RunningHubClient, normalizeOutputs, taskStateFromPayload } from './runninghub-client.mjs'
import { createRunningHubConfigStore } from './runninghub-config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const bundledFfmpegPath = path.join(projectRoot, 'bin', 'ffmpeg.exe')
const ffmpegPath = fs.existsSync(bundledFfmpegPath) ? bundledFfmpegPath : 'ffmpeg'
const runningHubConfigStore = createRunningHubConfigStore({
  filePath: path.join(projectRoot, 'user-data', 'settings.json'),
})

const childEnv = {
  ...process.env,
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
}

const logError = (title, payload) => {
  console.error(`[local-api][ERROR] ${title}`, payload)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getRunningHubContext = async () => {
  const config = await runningHubConfigStore.load()
  return {
    config,
    client: new RunningHubClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }),
  }
}

const waitForRunningHubOutputs = async (client, taskId) => {
  const timeoutMs = Number(process.env.RUNNINGHUB_TASK_TIMEOUT_MS || 30 * 60 * 1000)
  const intervalMs = Number(process.env.RUNNINGHUB_POLL_INTERVAL_MS || 3000)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const payload = await client.getOutputs(taskId)
    const state = taskStateFromPayload(payload)
    if (state === 'failed') throw new Error(String(payload?.msg || payload?.message || 'RunningHub 任务失败'))
    if (state === 'done') return normalizeOutputs(payload)
    await sleep(intervalMs)
  }
  throw new Error('RunningHub 任务等待超时')
}

const readTextOutput = async (outputs) => {
  const direct = outputs.find((item) => item.text)?.text
  if (direct) return String(direct).trim()
  const textOutput = outputs.find((item) => item.url)
  if (!textOutput?.url) return ''
  const response = await fetch(textOutput.url)
  if (!response.ok) throw new Error(`读取 RunningHub 文本结果失败(${response.status})`)
  const raw = await response.text()
  try {
    const parsed = JSON.parse(raw)
    return String(parsed.text ?? parsed.content ?? parsed.result ?? raw).trim()
  } catch {
    return raw.trim()
  }
}

const runTextWorkflow = async ({ workflow, value, kind }) => {
  const { client } = await getRunningHubContext()
  const workflowId = String(workflow?.workflowId || '').trim()
  if (!workflowId) throw new Error(`请先在 RunningHub 设置中填写${kind}工作流 ID`)
  const nodeId = kind === '文案改写' ? workflow.textNodeId : workflow.audioNodeId
  const fieldName = kind === '文案改写' ? workflow.textField : workflow.audioField
  const taskId = await client.createTask({
    workflowId,
    nodeInfoList: [{ nodeId, fieldName, fieldValue: value }],
  })
  const outputs = await waitForRunningHubOutputs(client, taskId)
  return { taskId, outputs }
}

const prepareAudio = (input, platform) =>
  new Promise((resolve, reject) => {
    execFile(
      'python',
      [path.join(projectRoot, 'server', 'extract_workflow.py'), input, projectRoot, ffmpegPath, platform],
      {
        cwd: projectRoot,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...childEnv, RUNNINGHUB_PREPARE_ONLY: '1' },
      },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message))
        try {
          const data = JSON.parse(stdout || '{}')
          if (!data.ok || !data.audioPath) return reject(new Error(data.error || '音频预处理失败'))
          resolve(data)
        } catch {
          reject(new Error(stderr || '音频预处理结果解析失败'))
        }
      },
    )
  })

const transcribeWithRunningHub = async (input, platform) => {
  const prepared = await prepareAudio(input, platform)
  const { config, client } = await getRunningHubContext()
  const audio = await fs.promises.readFile(prepared.audioPath)
  const fileRef = await client.uploadBuffer(audio, path.basename(prepared.audioPath), 'audio/wav')
  const { outputs } = await runTextWorkflow({ workflow: config.workflows.asr, value: fileRef, kind: '语音转写' })
  const text = await readTextOutput(outputs)
  if (!text) throw new Error('RunningHub 转写工作流未返回文本')
  return { ok: true, text, platform: prepared.platform || platform }
}

/** 解码后帧尺寸（考虑 Display Matrix / tags.rotate 竖屏） */
const probeVideoDisplaySize = (filePath) => {
  const ffprobePath = path.join(projectRoot, 'bin', 'ffprobe.exe')
  const probeBin = fs.existsSync(ffprobePath) ? ffprobePath : 'ffprobe'
  try {
    const stdout = execFileSync(
      probeBin,
      ['-v', 'error', '-select_streams', 'v:0', '-print_format', 'json', '-show_streams', filePath],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    )
    const j = JSON.parse(stdout)
    const st = (j.streams || [])[0] || {}
    let w = Number(st.width) || 1080
    let h = Number(st.height) || 1920
    let rot = Number(st.tags?.rotate) || 0
    for (const sd of st.side_data_list || []) {
      if (typeof sd.rotation === 'number') rot = sd.rotation
      if (String(sd.side_data_type || '').includes('Display Matrix') && sd.rotation != null) {
        rot = Number(sd.rotation) || rot
      }
    }
    const r = ((rot % 360) + 360) % 360
    if (r === 90 || r === 270) [w, h] = [h, w]
    return { width: w, height: h }
  } catch {
    return { width: 1080, height: 1920 }
  }
}

const estimateMaxCharsPerLine = (videoWidth, marginLR, fontSize, strokeW) => {
  const inner = Math.max(80, videoWidth - marginLR * 2 - Number(strokeW || 0) * 4 - 12)
  const cell = Math.max(fontSize * 1.06, 14)
  return Math.max(8, Math.floor(inner / cell))
}

/** 标点优先 + 超长硬切，生成 drawtext 可用的 \n 多行 */
const wrapSubtitleForBurn = (raw, maxChars) => {
  const max = Math.max(6, maxChars)
  const s = String(raw || '').replace(/\r\n/g, '\n').trim()
  if (!s) return s
  const re = /[^。！？…．；;,.，、：:\s\n]+|[。！？…．；;,.，、：:\s\n]+/g
  const units = []
  let m
  while ((m = re.exec(s))) units.push(m[0])
  if (!units.length) return s
  const lines = []
  let cur = ''
  for (const u of units) {
    if (u.length > max) {
      if (cur) {
        lines.push(cur)
        cur = ''
      }
      for (let i = 0; i < u.length; i += max) lines.push(u.slice(i, i + max))
      continue
    }
    if ((cur + u).length <= max) cur += u
    else {
      if (cur) lines.push(cur)
      cur = u
    }
  }
  if (cur) lines.push(cur)
  return lines.join('\n')
}

const extractFirstUrlFromText = (input = '') => {
  const matched = String(input || '').match(/https?:\/\/\S+/i)
  if (!matched?.[0]) return ''
  return matched[0].replace(/[，。；！？）】】"'\]\)]+$/g, '')
}

const detectVideoPlatform = (url = '') => {
  try {
    const parsed = new URL(String(url || '').trim())
    const host = parsed.hostname.toLowerCase()
    if (host.includes('douyin.com') || host.includes('iesdouyin.com')) return 'douyin'
    if (host.includes('bilibili.com') || host.endsWith('b23.tv')) return 'bilibili'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

const handleExtractWorkflow = async (req, res) => {
  const rawInput = String(req.body?.url || '').trim()
  const url = extractFirstUrlFromText(rawInput)
  if (!url) return res.status(400).json({ error: '未识别到有效视频链接，请粘贴包含 http(s) 的分享链接' })

  const platformFromClient = String(req.body?.platform || '').trim().toLowerCase()
  const detectedPlatform = detectVideoPlatform(url)
  const platform = ['bilibili', 'douyin'].includes(platformFromClient) ? platformFromClient : detectedPlatform
  if (!['bilibili', 'douyin'].includes(platform)) {
    return res.status(400).json({ ok: false, code: 'unsupported_platform', error: '当前仅支持 B站 / 抖音 链接', platform })
  }

  try {
    return res.json(await transcribeWithRunningHub(url, platform))
  } catch (error) {
    logError('/api/workflow/extract failed', { message: error instanceof Error ? error.message : String(error) })
    return res.status(502).json({ ok: false, code: 'runninghub_asr_failed', error: error instanceof Error ? error.message : '转写失败' })
  }
}

const app = express()
const upload = multer({ dest: path.join(projectRoot, 'user-data', 'tmp') })

const isTrustedOrigin = (origin) => {
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

app.use((req, res, next) => {
  if (isTrustedOrigin(req.get('Origin'))) return next()
  return res.status(403).json({ ok: false, error: '仅允许本机页面访问此服务' })
})
app.use(
  cors({
    origin(origin, callback) {
      callback(isTrustedOrigin(origin) ? null : new Error('Origin not allowed'), Boolean(origin))
    },
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
  }),
)
app.use(express.json())
app.use('/user-data/settings.json', (_req, res) => res.sendStatus(404))
app.use('/user-data', express.static(path.join(projectRoot, 'user-data')))

app.get('/api/runninghub/config', async (_req, res) => {
  try {
    const config = await runningHubConfigStore.load()
    return res.json({ ok: true, data: runningHubConfigStore.toPublic(config) })
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : '读取设置失败' })
  }
})

app.post('/api/runninghub/config', async (req, res) => {
  try {
    const config = await runningHubConfigStore.save(req.body || {})
    return res.json({ ok: true, data: runningHubConfigStore.toPublic(config) })
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : '保存设置失败' })
  }
})

app.post('/api/runninghub/test', async (_req, res) => {
  try {
    const { config, client } = await getRunningHubContext()
    const workflowId = [config.workflows.digitalHuman.workflowId, config.workflows.asr.workflowId, config.workflows.rewrite.workflowId].find(Boolean)
    if (!workflowId) throw new Error('请至少填写一个 Workflow ID 后再测试连接')
    await client.inspectWorkflow(workflowId)
    return res.json({ ok: true, message: 'RunningHub 连接正常' })
  } catch (error) {
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message : '连接测试失败' })
  }
})

app.post('/api/v1/RH/upload', upload.single('file'), async (req, res) => {
  if (!req.file?.path) return res.status(400).json({ code: 400, msg: '请选择文件' })
  try {
    const { client } = await getRunningHubContext()
    const buffer = await fs.promises.readFile(req.file.path)
    const fileRef = await client.uploadBuffer(buffer, req.file.originalname || path.basename(req.file.path), req.file.mimetype)
    return res.json({ code: 0, file_ref: fileRef, fileName: fileRef, name: req.file.originalname })
  } catch (error) {
    return res.status(502).json({ code: 502, msg: error instanceof Error ? error.message : '上传失败' })
  } finally {
    try { await fs.promises.unlink(req.file.path) } catch { /* ignore cleanup errors */ }
  }
})

app.post('/api/v1/RH/sync', async (req, res) => {
  try {
    const { client } = await getRunningHubContext()
    const payload = await client.getOutputs(req.body?.task_id ?? req.body?.taskId)
    const status = taskStateFromPayload(payload)
    const outputs = normalizeOutputs(payload)
    return res.json({ code: 0, result: { status, progress: status === 'done' ? 100 : 0, results: outputs } })
  } catch (error) {
    return res.status(502).json({ code: 502, msg: error instanceof Error ? error.message : '任务查询失败' })
  }
})

app.post('/api/runninghub/rewrite', async (req, res) => {
  try {
    const source = String(req.body?.text || '').trim()
    if (!source) return res.status(400).json({ ok: false, error: '文案不能为空' })
    const { config } = await getRunningHubContext()
    const { outputs } = await runTextWorkflow({ workflow: config.workflows.rewrite, value: source, kind: '文案改写' })
    const text = await readTextOutput(outputs)
    if (!text) throw new Error('RunningHub 改写工作流未返回文本')
    return res.json({ ok: true, data: { text } })
  } catch (error) {
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message : '文案改写失败' })
  }
})

app.post('/api/runninghub/digital-human', async (req, res) => {
  try {
    const { config, client } = await getRunningHubContext()
    const workflow = config.workflows.digitalHuman
    if (!workflow.workflowId) throw new Error('请先在 RunningHub 设置中填写数字人工作流 ID')
    const taskId = await client.createTask({
      workflowId: workflow.workflowId,
      instanceType: req.body?.instanceType || undefined,
      nodeInfoList: [
        { nodeId: workflow.videoNodeId, fieldName: workflow.videoField, fieldValue: req.body?.videoRef },
        { nodeId: workflow.audioNodeId, fieldName: workflow.audioField, fieldValue: req.body?.audioRef },
        { nodeId: workflow.textNodeId, fieldName: workflow.textField, fieldValue: req.body?.text || '' },
      ],
    })
    return res.json({ ok: true, data: { taskId } })
  } catch (error) {
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message : '数字人任务提交失败' })
  }
})

app.post('/api/workflow/extract', handleExtractWorkflow)
app.post('/workflow/extract', handleExtractWorkflow)
app.post('/api/workflow/extract-file', upload.single('file'), async (req, res) => {
  if (!req.file?.path) return res.status(400).json({ ok: false, code: 'file_required', error: '请先选择视频文件' })
  const localFile = req.file.path
  try {
    return res.json(await transcribeWithRunningHub(localFile, 'local'))
  } catch (error) {
    return res.status(502).json({ ok: false, code: 'runninghub_asr_failed', error: error instanceof Error ? error.message : '转写失败' })
  } finally {
    try { await fs.promises.unlink(localFile) } catch { /* ignore cleanup errors */ }
  }
})

app.post('/api/workflow/convert-audio', upload.single('file'), (req, res) => {
  if (!req.file?.path) return res.status(400).json({ ok: false, code: 'file_required', error: '请先选择音频文件' })
  const localFile = req.file.path
  const tmpDir = path.join(projectRoot, 'user-data', 'tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  const outputPath = path.join(tmpDir, `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`)

  execFile(
    ffmpegPath,
    ['-y', '-i', localFile, '-vn', '-ac', '2', '-ar', '44100', '-b:a', '192k', outputPath],
    { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024, env: childEnv },
    (error, stdout, stderr) => {
      try {
        if (fs.existsSync(localFile)) fs.unlinkSync(localFile)
      } catch {
        // ignore temp input cleanup errors
      }
      if (error) {
        logError('/api/workflow/convert-audio ffmpeg failed', {
          message: error.message,
          code: error.code,
          stderr,
          stdoutTail: stdout ? String(stdout).slice(-4000) : '',
        })
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        } catch {
          // ignore
        }
        return res.status(500).json({
          ok: false,
          code: 'audio_convert_failed',
          error: '本地音频转 mp3 失败，请检查 bin/ffmpeg.exe 是否可用',
        })
      }

      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Content-Disposition', 'attachment; filename="converted.mp3"')
      const stream = fs.createReadStream(outputPath)
      stream.on('error', () => {
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        } catch {
          // ignore
        }
        if (!res.headersSent) {
          res.status(500).json({ ok: false, code: 'audio_read_failed', error: '读取转换文件失败' })
        }
      })
      stream.on('close', () => {
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        } catch {
          // ignore
        }
      })
      stream.pipe(res)
    },
  )
})

app.post('/api/workflow/prepare-video', upload.single('file'), (req, res) => {
  if (!req.file?.path) return res.status(400).json({ ok: false, code: 'file_required', error: '请先选择视频文件' })
  const localFile = req.file.path
  const tmpDir = path.join(projectRoot, 'user-data', 'tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  const outputPath = path.join(tmpDir, `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`)

  execFile(
    ffmpegPath,
    ['-y', '-i', localFile, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', outputPath],
    { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024, env: childEnv },
    (error, stdout, stderr) => {
      try {
        if (fs.existsSync(localFile)) fs.unlinkSync(localFile)
      } catch {
        // ignore temp input cleanup errors
      }
      if (error) {
        logError('/api/workflow/prepare-video ffmpeg failed', {
          message: error.message,
          code: error.code,
          stderr,
          stdoutTail: stdout ? String(stdout).slice(-4000) : '',
        })
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        } catch {
          // ignore
        }
        return res.status(500).json({
          ok: false,
          code: 'video_prepare_failed',
          error: '本地视频处理失败，请检查处理组件是否可用',
        })
      }

      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Disposition', 'attachment; filename="prepared.mp4"')
      const stream = fs.createReadStream(outputPath)
      stream.on('error', () => {
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        } catch {
          // ignore
        }
        if (!res.headersSent) {
          res.status(500).json({ ok: false, code: 'video_read_failed', error: '读取处理后视频失败' })
        }
      })
      stream.on('close', () => {
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        } catch {
          // ignore
        }
      })
      stream.pipe(res)
    },
  )
})

app.post('/api/workflow/transcribe-video-url', async (req, res) => {
  const videoUrl = String(req.body?.url || '').trim()
  if (!videoUrl) return res.status(400).json({ ok: false, code: 'url_required', error: '缺少视频地址' })
  let tmpPath = ''
  try {
    const parsed = new URL(videoUrl)
    if (parsed.protocol !== 'https:') {
      return res.status(400).json({ ok: false, code: 'invalid_url', error: '视频地址必须使用 HTTPS' })
    }
    const ext = path.extname(parsed.pathname || '').toLowerCase() || '.mp4'
    const safeExt = ['.mp4', '.mov', '.mkv', '.avi', '.webm'].includes(ext) ? ext : '.mp4'
    const tmpDir = path.join(projectRoot, 'user-data', 'tmp')
    fs.mkdirSync(tmpDir, { recursive: true })
    tmpPath = path.join(tmpDir, `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`)
    const response = await fetch(videoUrl)
    if (!response.ok) {
      return res.status(502).json({ ok: false, code: 'video_download_failed', error: `下载视频失败(${response.status})` })
    }
    const buf = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(tmpPath, buf)
    return res.json(await transcribeWithRunningHub(tmpPath, 'local'))
  } catch (error) {
    return res.status(502).json({ ok: false, code: 'video_transcribe_failed', error: error instanceof Error ? error.message : '视频转写失败' })
  } finally {
    try { if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch { /* ignore cleanup errors */ }
  }
})

app.post('/api/workflow/burn-preview', async (req, res) => {
  const videoUrl = String(req.body?.videoUrl || '').trim()
  const titleText = String(req.body?.titleText || '').trim()
  const subtitleText = String(req.body?.subtitleText || '').trim()
  const titleStyle = req.body?.titleStyle || {}
  const subtitleStyle = req.body?.subtitleStyle || {}
  const subtitleSegments = Array.isArray(req.body?.subtitleSegments) ? req.body.subtitleSegments : []
  if (!videoUrl) return res.status(400).json({ ok: false, code: 'url_required', error: '缺少视频地址' })

  const tmpDir = path.join(projectRoot, 'user-data', 'tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const inputPath = path.join(tmpDir, `in_${uid}.mp4`)
  const titlePath = path.join(tmpDir, `title_${uid}.txt`)
  const subtitlePath = path.join(tmpDir, `subtitle_${uid}.txt`)
  const outputPath = path.join(tmpDir, `preview_${uid}.mp4`)
  const titleRelPath = `user-data/tmp/${path.basename(titlePath)}`
  const subtitleRelPath = `user-data/tmp/${path.basename(subtitlePath)}`

  const toFfmpegColor = (value, fallback) => {
    const raw = String(value || fallback || '').trim()
    const hex = raw.match(/^#([0-9a-fA-F]{6})$/)
    if (hex) return `0x${hex[1].toUpperCase()}`
    if (!raw) return fallback
    return raw
  }
  const toFontFile = (family) => {
    const normalized = String(family || '').toLowerCase()
    const winFonts = {
      heiti: 'simhei.ttf',
      yahei: 'msyh.ttc',
      songti: 'simsun.ttc',
      default: '',
    }
    const filename = winFonts[normalized] || ''
    if (!filename) return ''
    const full = path.join('C:\\Windows\\Fonts', filename)
    return fs.existsSync(full) ? full : ''
  }

  const titleFontSize = Math.max(16, Math.min(Number(titleStyle.fontSize || 48), 80))
  const titleFontColor = toFfmpegColor(titleStyle.fontColor, 'white')
  const titleStrokeColor = toFfmpegColor(titleStyle.strokeColor, 'black')
  const titleStrokeWidth = Math.max(0, Math.min(Number(titleStyle.strokeWidth || 2), 8))
  const subtitleFontSize = Math.max(12, Math.min(Number(subtitleStyle.fontSize || 32), 60))
  const subtitleFontColor = toFfmpegColor(subtitleStyle.fontColor, 'white')
  const subtitleStrokeColor = toFfmpegColor(subtitleStyle.strokeColor, 'black')
  const subtitleStrokeWidth = Math.max(0, Math.min(Number(subtitleStyle.strokeWidth || 2), 8))
  const titleFontFile = toFontFile(titleStyle.fontFamily)
  const subtitleFontFile = toFontFile(subtitleStyle.fontFamily)
  const toBoxColor = (mode, opacity, fallback = 'black') => {
    const alpha = Math.max(0, Math.min(Number(opacity || 0), 0.95))
    const base = mode === 'white' ? 'white' : mode === 'black' ? 'black' : fallback
    if (mode === 'none') return ''
    return `${base}@${alpha}`
  }
  const titleBgColor = toBoxColor(titleStyle.bgColor, titleStyle.bgOpacity, 'black')
  const subtitleBgColor = toBoxColor(subtitleStyle.bgColor, subtitleStyle.bgOpacity, 'black')
  let segmentLinePaths = []

  try {
    const response = await fetch(videoUrl)
    if (!response.ok) {
      return res.status(502).json({ ok: false, code: 'video_download_failed', error: `下载视频失败(${response.status})` })
    }
    const buf = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(inputPath, buf)
    fs.writeFileSync(titlePath, titleText || ' ', 'utf8')

    const { width: videoW } = probeVideoDisplaySize(inputPath)
    const subtitleMaxChars = estimateMaxCharsPerLine(videoW, 96, subtitleFontSize, subtitleStrokeWidth)
    const wrappedFallback = wrapSubtitleForBurn(subtitleText, subtitleMaxChars)
    fs.writeFileSync(subtitlePath, wrappedFallback || ' ', 'utf8')

    const subtitleBottomGap = 52
    const subtitleLineSpacing = 12
    const subtitleBoxPad = 28
    const subtitleFontOpt = subtitleFontFile ? `:fontfile='${subtitleFontFile.replace(/\\/g, '/')}'` : ''

    const tmpToRel = (absPath) => `user-data/tmp/${path.basename(absPath)}`.replace(/\\/g, '/')

    const buildSubtitleDrawPair = (textRelPath, wrapped, start, end) => {
      const body = String(wrapped || '').trim()
      if (!body) return ''
      const lineCount = Math.max(1, body.split('\n').length)
      const innerH = lineCount * subtitleFontSize + Math.max(0, lineCount - 1) * subtitleLineSpacing + subtitleBoxPad * 2
      const boxHeight = Math.min(520, Math.max(112, innerH))
      const boxTopY = `h-${boxHeight + subtitleBottomGap}`
      const timed = start !== undefined && end !== undefined
      const enable = timed ? `:enable='between(t,${Number(start).toFixed(3)},${Number(end).toFixed(3)})'` : ''
      const subtitleBox = subtitleBgColor
        ? `drawbox=x=40:y=${boxTopY}:w=w-80:h=${boxHeight}:color=${subtitleBgColor}:t=fill${enable}`
        : ''
      const subtitleTextFilter = `drawtext=textfile='${textRelPath}':x=(w-text_w)/2:y=h-text_h-${subtitleBottomGap}:fontcolor=${subtitleFontColor}:fontsize=${subtitleFontSize}:line_spacing=${subtitleLineSpacing}:borderw=${subtitleStrokeWidth}:bordercolor=${subtitleStrokeColor}${subtitleFontOpt}${enable}`
      return [subtitleBox, subtitleTextFilter].filter(Boolean).join(',')
    }

    segmentLinePaths = []
    const dynamicSubtitleFilters = subtitleSegments
      .map((seg, idx) => {
        const start = Math.max(0, Number(seg?.start || 0))
        const end = Math.max(start + 0.1, Number(seg?.end || start + 1))
        const wrapped = wrapSubtitleForBurn(String(seg?.text || ''), subtitleMaxChars).trim()
        if (!wrapped) return ''
        const segFile = path.join(tmpDir, `sublines_${uid}_${idx}.txt`)
        fs.writeFileSync(segFile, wrapped, 'utf8')
        segmentLinePaths.push(segFile)
        return buildSubtitleDrawPair(tmpToRel(segFile), wrapped, start, end)
      })
      .filter(Boolean)
    const fallbackSubtitle = buildSubtitleDrawPair(subtitleRelPath, wrappedFallback)
    const drawFilters = [
      titleBgColor ? `drawbox=x=40:y=24:w=w-80:h=140:color=${titleBgColor}:t=fill` : '',
      `drawtext=textfile='${titleRelPath}':x=80:y=40:fontcolor=${titleFontColor}:fontsize=${titleFontSize}:borderw=${titleStrokeWidth}:bordercolor=${titleStrokeColor}${titleFontFile ? `:fontfile='${titleFontFile.replace(/\\/g, '/')}'` : ''}`,
      dynamicSubtitleFilters.length ? dynamicSubtitleFilters.join(',') : fallbackSubtitle,
    ]
      .filter(Boolean)
      .join(',')

    execFile(
      ffmpegPath,
      ['-y', '-i', inputPath, '-vf', drawFilters, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'copy', outputPath],
      { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024, env: childEnv },
      (error, stdout, stderr) => {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
          if (fs.existsSync(titlePath)) fs.unlinkSync(titlePath)
          if (fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath)
          for (const p of segmentLinePaths) {
            try {
              if (fs.existsSync(p)) fs.unlinkSync(p)
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore cleanup errors
        }
        if (error) {
          logError('/api/workflow/burn-preview ffmpeg failed', {
            message: error.message,
            code: error.code,
            stderr,
            stdoutTail: stdout ? String(stdout).slice(-4000) : '',
          })
          try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
          } catch {
            // ignore
          }
          return res.status(500).json({ ok: false, code: 'burn_failed', error: '字幕与标题植入失败' })
        }
        const rel = `/user-data/tmp/${path.basename(outputPath)}`
        return res.json({ ok: true, videoPath: rel })
      },
    )
  } catch (error) {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
      if (fs.existsSync(titlePath)) fs.unlinkSync(titlePath)
      if (fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath)
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      for (const p of segmentLinePaths) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p)
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    return res.status(500).json({ ok: false, code: 'burn_failed', error: error instanceof Error ? error.message : '预览处理失败' })
  }
})

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'

app.listen(PORT, HOST, () => {
  console.log(`[local-api] listening on http://${HOST}:${PORT}`)
})
