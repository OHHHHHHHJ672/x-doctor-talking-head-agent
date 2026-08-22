/**
 * 仅保留本机能力：文案提取（Python）、user-data 静态文件。
 * 鉴权与 /api/v1 业务全部由云端处理，经 Vite 代理转发。
 */
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const ffmpegPath = path.join(projectRoot, 'bin', 'ffmpeg.exe')
const modelPath = path.join(projectRoot, 'faster_whisper_models')

const childEnv = {
  ...process.env,
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
}

const logError = (title, payload) => {
  console.error(`[local-api][ERROR] ${title}`, payload)
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

const handleExtractWorkflow = (req, res) => {
  const rawInput = String(req.body?.url || '').trim()
  const url = extractFirstUrlFromText(rawInput)
  if (!url) return res.status(400).json({ error: '未识别到有效视频链接，请粘贴包含 http(s) 的分享链接' })

  const platformFromClient = String(req.body?.platform || '').trim().toLowerCase()
  const detectedPlatform = detectVideoPlatform(url)
  const platform = ['bilibili', 'douyin'].includes(platformFromClient) ? platformFromClient : detectedPlatform
  if (!['bilibili', 'douyin'].includes(platform)) {
    return res.status(400).json({ ok: false, code: 'unsupported_platform', error: '当前仅支持 B站 / 抖音 链接', platform })
  }

  execFile(
    'python',
    [path.join(projectRoot, 'server', 'extract_workflow.py'), url, projectRoot, ffmpegPath, modelPath, platform],
    { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024, env: childEnv },
    (error, stdout, stderr) => {
      if (error) {
        logError('/api/workflow/extract execFile failed', {
          url,
          message: error.message,
          code: error.code,
          stderr,
          stdoutTail: stdout ? String(stdout).slice(-4000) : '',
        })
      } else if (stderr) {
        console.error('[local-api][WARN] /api/workflow/extract stderr', { url, stderr })
      }

      try {
        const data = JSON.parse(stdout || '{}')
        if (!data.ok) {
          logError('/api/workflow/extract script returned ok=false', { url, platform, data, stderr })
          return res.status(502).json({ ok: false, code: data.code, error: data.error, platform: data.platform || platform })
        }
        return res.json(data)
      } catch (parseError) {
        logError('/api/workflow/extract invalid JSON stdout', {
          url,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          stdoutTail: stdout ? String(stdout).slice(0, 4000) : '',
          stderr,
          execError: error?.message,
        })
        return res.status(500).json({
          ok: false,
          code: 'extractor_parse_failed',
          error: '提取脚本输出异常，请检查 Python 环境',
          details: stderr || stdout || error?.message,
        })
      }
    },
  )
}

const app = express()
const upload = multer({ dest: path.join(projectRoot, 'user-data', 'tmp') })
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json())
app.use('/user-data', express.static(path.join(projectRoot, 'user-data')))

app.post('/api/workflow/extract', handleExtractWorkflow)
app.post('/workflow/extract', handleExtractWorkflow)
app.post('/api/workflow/extract-file', upload.single('file'), (req, res) => {
  if (!req.file?.path) return res.status(400).json({ ok: false, code: 'file_required', error: '请先选择视频文件' })
  const localFile = req.file.path
  execFile(
    'python',
    [path.join(projectRoot, 'server', 'extract_workflow.py'), localFile, projectRoot, ffmpegPath, modelPath, 'local'],
    { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024, env: childEnv },
    (error, stdout, stderr) => {
      try {
        fs.unlinkSync(localFile)
      } catch {
        // ignore temp file cleanup errors
      }
      if (error) {
        logError('/api/workflow/extract-file execFile failed', {
          message: error.message,
          code: error.code,
          stderr,
          stdoutTail: stdout ? String(stdout).slice(-4000) : '',
        })
      } else if (stderr) {
        console.error('[local-api][WARN] /api/workflow/extract-file stderr', { stderr })
      }
      try {
        const data = JSON.parse(stdout || '{}')
        if (!data.ok) {
          logError('/api/workflow/extract-file script returned ok=false', { data, stderr })
          return res.status(502).json({ ok: false, code: data.code, error: data.error, platform: data.platform || 'local' })
        }
        return res.json(data)
      } catch (parseError) {
        logError('/api/workflow/extract-file invalid JSON stdout', {
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          stdoutTail: stdout ? String(stdout).slice(0, 4000) : '',
          stderr,
          execError: error?.message,
        })
        return res.status(500).json({
          ok: false,
          code: 'extractor_parse_failed',
          error: '提取脚本输出异常，请检查 Python 环境',
          details: stderr || stdout || error?.message,
        })
      }
    },
  )
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
    execFile(
      'python',
      [path.join(projectRoot, 'server', 'extract_workflow.py'), tmpPath, projectRoot, ffmpegPath, modelPath, 'local'],
      { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024, env: childEnv },
      (error, stdout, stderr) => {
        try {
          if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {
          // ignore
        }
        if (error) {
          logError('/api/workflow/transcribe-video-url execFile failed', {
            message: error.message,
            code: error.code,
            stderr,
            stdoutTail: stdout ? String(stdout).slice(-4000) : '',
          })
        }
        try {
          const data = JSON.parse(stdout || '{}')
          if (!data.ok) {
            return res.status(502).json({ ok: false, code: data.code, error: data.error, platform: data.platform || 'local' })
          }
          return res.json(data)
        } catch {
          return res.status(500).json({ ok: false, code: 'extractor_parse_failed', error: '字幕提取结果解析失败' })
        }
      },
    )
  } catch (error) {
    try {
      if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch {
      // ignore
    }
    return res.status(500).json({ ok: false, code: 'video_download_failed', error: error instanceof Error ? error.message : '视频下载失败' })
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

app.listen(PORT, () => {
  console.log(`[local-api] workflow + user-data only → http://localhost:${PORT}`)
})
