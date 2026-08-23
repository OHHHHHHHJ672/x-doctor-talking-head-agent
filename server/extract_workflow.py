import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def run_cmd(cmd: list[str]) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, shell=False)
    if result.returncode != 0:
        log(f"[extract] command failed: {' '.join(cmd)}")
        if result.stderr:
            log(result.stderr.strip())
        if result.stdout:
            log(result.stdout.strip())
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "command failed")
    return result.stdout.strip()


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def pick_audio_file(output_dir: Path) -> Path | None:
    for name in ("source_audio.wav", "source_audio.m4a", "source_audio.mp3", "source_audio.webm"):
        candidate = output_dir / name
        if candidate.exists():
            return candidate
    return None


def detect_video_platform(url: str) -> str:
    try:
        parsed = urlsplit(str(url or "").strip())
        host = (parsed.netloc or "").lower()
    except Exception:
        return "unknown"

    if "douyin.com" in host or "iesdouyin.com" in host:
        return "douyin"
    if "bilibili.com" in host or host.endswith("b23.tv"):
        return "bilibili"
    return "unknown"


def is_local_media_file(raw: str) -> bool:
    p = Path(str(raw or "").strip())
    return p.exists() and p.is_file()


def normalize_input_url(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""

    matched = re.search(r"https?://\S+", text, re.IGNORECASE)
    if not matched:
        return ""

    url = matched.group(0).strip().rstrip("，。；！？）】》\"'\]\)")
    if not url:
        return ""

    parsed = urlsplit(url)
    if not parsed.scheme or not parsed.netloc:
        return ""

    platform = detect_video_platform(url)
    host = parsed.netloc.lower()
    path = (parsed.path or "").lower()

    if platform == "douyin":
        if "jingxuan" in path or path in {"", "/", "/user", "/discover"}:
            return ""
        return url

    if platform == "bilibili":
        keep_keys = {
            "p",
            "t",
            "spm_id_from",
            "buvid",
            "is_story_h5",
            "mid",
            "plat_id",
            "share_medium",
            "share_plat",
            "share_session_id",
            "share_source",
            "timestamp",
            "unique_k",
            "vd_source",
        }
        query_items = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k in keep_keys]
        cleaned_query = urlencode(query_items, doseq=True)
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, cleaned_query, parsed.fragment))

    return url


def has_usable_cookie_file(cookies_path: Path) -> bool:
    if not cookies_path.exists():
        return False
    raw = cookies_path.read_text(encoding="utf-8", errors="ignore")
    compact = "\n".join(line for line in raw.splitlines() if line.strip() and not line.strip().startswith("#"))
    return "# Netscape HTTP Cookie File" in raw or "\t" in compact


def classify_download_error(message: str, url: str, platform: str = "unknown", has_cookie_file: bool = False) -> str:
    lower = message.lower()
    if "ffmpeg" in lower and "not found" in lower:
        return "ffmpeg/ffprobe 未找到：请把 ffmpeg 加入系统 PATH，或确保项目 bin 目录下存在 ffmpeg.exe 与 ffprobe.exe"

    detected_platform = platform if platform in {"douyin", "bilibili"} else detect_video_platform(url)
    douyin_hint = detected_platform == "douyin"
    bilibili_hint = detected_platform == "bilibili"

    if "unsupported url" in lower and douyin_hint:
        return "抖音链接不支持：请使用单条视频分享链接（如包含 /video/ 或 v.douyin.com 短链），不要用主页/精选页链接"

    if douyin_hint and ("could not copy chrome cookie database" in lower or "failed to decrypt with dpapi" in lower):
        return "抖音下载失败：浏览器 Cookie 读取被系统拒绝。请关闭 Chrome/Edge 后重试，或改用插件导出 cookies.txt"

    if douyin_hint and (
        "fresh cookies" in lower
        or "login" in lower
        or "cookie" in lower
        or "private" in lower
        or "403" in lower
        or "unable to download" in lower
        or "unable to extract" in lower
        or "captcha" in lower
    ):
        if has_cookie_file:
            return "抖音下载失败：检测到 cookies.txt，但登录态已失效（Fresh cookies needed）。请重新导出抖音 cookies.txt 并覆盖后重试"
        return "抖音下载失败：请先在本机 Chrome 登录抖音，或用插件导出 cookies.txt 到项目根目录后重试"

    if bilibili_hint and ("412" in message or "precondition" in lower):
        return (
            "B站元数据下载失败(412)：请在项目根目录放置 cookies.txt（登录态导出），"
            "或确保本机已安装 Chrome 且已登录 B 站（将自动尝试读取浏览器 Cookie）"
        )

    return "下载失败，请检查链接、网络或 Cookie 后重试"


def build_ytdlp_cmd(
    url: str,
    platform: str,
    template: str,
    cookies_file: Path | None,
    browser_cookie_source: str | None,
    ffmpeg_bin_dir: Path,
) -> list[str]:
    cmd: list[str] = [
        sys.executable,
        "-m",
        "yt_dlp",
        "-x",
        "--audio-format",
        "wav",
        "-o",
        template,
        "--add-header",
        "Accept-Language:zh-CN,zh;q=0.9,en;q=0.8",
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--ffmpeg-location",
        str(ffmpeg_bin_dir),
    ]

    if platform == "bilibili":
        cmd += [
            "--add-header",
            "Referer:https://www.bilibili.com/",
            "--add-header",
            "Origin:https://www.bilibili.com",
        ]
    elif platform == "douyin":
        cmd += [
            "--add-header",
            "Referer:https://www.douyin.com/",
            "--add-header",
            "Origin:https://www.douyin.com",
        ]
    if cookies_file:
        cmd += ["--cookies", str(cookies_file)]
    if browser_cookie_source:
        cmd += ["--cookies-from-browser", browser_cookie_source]
    cmd.append(url)
    return cmd


def download_with_ytdlp(url: str, platform: str, template: str, cookies_path: Path, ffmpeg_bin_dir: Path) -> tuple[bool, str]:
    has_cookie_file = False
    if cookies_path.exists():
        raw = cookies_path.read_text(encoding="utf-8", errors="ignore")
        compact = "\n".join(line for line in raw.splitlines() if line.strip() and not line.strip().startswith("#"))
        has_cookie_file = "# Netscape HTTP Cookie File" in raw or "\t" in compact

    attempts: list[tuple[str, list[str]]] = []
    cookie_file = cookies_path if has_cookie_file else None

    resolved_platform = platform if platform in {"bilibili", "douyin"} else detect_video_platform(url)
    bilibili_hint = resolved_platform == "bilibili"
    douyin_hint = resolved_platform == "douyin"

    if douyin_hint:
        attempts.append(("headers+browser_chrome", build_ytdlp_cmd(url, resolved_platform, template, None, "chrome", ffmpeg_bin_dir)))
        attempts.append(("headers+browser_edge", build_ytdlp_cmd(url, resolved_platform, template, None, "edge", ffmpeg_bin_dir)))
        if cookie_file:
            attempts.append(
                (
                    "headers+cookies_file+browser_chrome",
                    build_ytdlp_cmd(url, resolved_platform, template, cookie_file, "chrome", ffmpeg_bin_dir),
                ),
            )
            attempts.append(
                (
                    "headers+cookies_file+browser_edge",
                    build_ytdlp_cmd(url, resolved_platform, template, cookie_file, "edge", ffmpeg_bin_dir),
                ),
            )
            attempts.append(("headers+cookies_file", build_ytdlp_cmd(url, resolved_platform, template, cookie_file, None, ffmpeg_bin_dir)))
        attempts.append(("headers_only", build_ytdlp_cmd(url, resolved_platform, template, None, None, ffmpeg_bin_dir)))
    else:
        attempts.append(("headers_only", build_ytdlp_cmd(url, resolved_platform, template, None, None, ffmpeg_bin_dir)))
        if cookie_file:
            attempts.append(("headers+cookies_file", build_ytdlp_cmd(url, resolved_platform, template, cookie_file, None, ffmpeg_bin_dir)))
        if bilibili_hint:
            attempts.append(("headers+browser_chrome", build_ytdlp_cmd(url, resolved_platform, template, None, "chrome", ffmpeg_bin_dir)))
            if cookie_file:
                attempts.append(
                    (
                        "headers+cookies_file+browser_chrome",
                        build_ytdlp_cmd(url, resolved_platform, template, cookie_file, "chrome", ffmpeg_bin_dir),
                    ),
                )

    last_error = ""
    seen: set[str] = set()
    for name, cmd in attempts:
        key = " ".join(cmd)
        if key in seen:
            continue
        seen.add(key)
        try:
            run_cmd(cmd)
            return has_cookie_file, last_error
        except Exception as exc:
            last_error = f"{name}: {exc}"

    raise RuntimeError(last_error or "yt-dlp failed")


def main() -> None:
    if len(sys.argv) < 4:
        emit({"ok": False, "code": "bad_args", "error": "missing args"})
        return

    raw_input = sys.argv[1]
    local_media = Path(raw_input).expanduser() if is_local_media_file(raw_input) else None
    url = "" if local_media else normalize_input_url(raw_input)
    project_root = Path(sys.argv[2])
    ffmpeg_path = Path(sys.argv[3])
    platform_hint = str(sys.argv[4]).strip().lower() if len(sys.argv) > 4 else ""
    platform = "local" if local_media else (platform_hint if platform_hint in {"bilibili", "douyin"} else detect_video_platform(url))
    ffmpeg_bin_dir = ffmpeg_path.parent

    if not local_media and not url:
        emit({"ok": False, "code": "invalid_url", "error": "未识别到有效视频链接，请粘贴单条视频分享链接（不要用抖音主页/精选页）"})
        return

    ffmpeg_command = str(ffmpeg_path) if ffmpeg_path.exists() else shutil.which(str(ffmpeg_path))
    if not ffmpeg_command:
        emit({"ok": False, "code": "ffmpeg_missing", "error": "请先安装 ffmpeg 并添加到系统 PATH"})
        return

    try:
        run_cmd([ffmpeg_command, "-version"])
    except Exception:
        emit({"ok": False, "code": "ffmpeg_missing", "error": "请先安装 ffmpeg 并添加到系统 PATH"})
        return

    configured_data_root = os.environ.get("X_DOCTOR_DATA_DIR", "").strip()
    data_root = Path(configured_data_root) if configured_data_root else project_root / "user-data"
    output_dir = data_root / "extracted"
    output_dir.mkdir(parents=True, exist_ok=True)
    template = str(output_dir / "source_audio.%(ext)s")

    if local_media:
        audio_path = local_media
    else:
        if not module_available("yt_dlp"):
            emit({"ok": False, "code": "ytdlp_missing", "error": "请先运行 pip install yt-dlp"})
            return

        cookies_path = project_root / "cookies.txt"
        has_cookie_file = has_usable_cookie_file(cookies_path)
        try:
            download_with_ytdlp(url, platform, template, cookies_path, ffmpeg_bin_dir)
        except Exception as exc:
            message = str(exc)
            if "No module named 'yt_dlp'" in message or "No module named yt_dlp" in message:
                emit({"ok": False, "code": "ytdlp_missing", "error": "请先运行 pip install yt-dlp", "platform": platform})
                return
            emit({"ok": False, "code": "download_failed", "error": classify_download_error(message, url, platform, has_cookie_file), "platform": platform})
            return

        audio_path = pick_audio_file(output_dir)
        if not audio_path:
            emit({"ok": False, "code": "download_failed", "error": classify_download_error("", url, platform), "platform": platform})
            return

    wav_path = output_dir / "source_audio.wav"
    if audio_path.suffix.lower() != ".wav":
        try:
            run_cmd([ffmpeg_command, "-y", "-i", str(audio_path), str(wav_path)])
        except Exception:
            emit({"ok": False, "code": "ffmpeg_missing", "error": "请先安装 ffmpeg 并添加到系统 PATH"})
            return
    else:
        wav_path = audio_path

    asr_wav = output_dir / "asr_input.wav"
    try:
        run_cmd(
            [
                ffmpeg_command,
                "-y",
                "-i",
                str(wav_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-sample_fmt",
                "s16",
                str(asr_wav),
            ]
        )
    except Exception:
        emit({"ok": False, "code": "ffmpeg_missing", "error": "请先安装 ffmpeg 并添加到系统 PATH"})
        return

    emit({"ok": True, "audioPath": str(asr_wav), "platform": platform})


if __name__ == "__main__":
    main()
