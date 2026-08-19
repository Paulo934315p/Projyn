from __future__ import annotations
import re
import json
import html
import time
import urllib.parse
import urllib.request
import subprocess
from typing import Any

STREAM_REFRESH_SECONDS = 2 * 60 * 60
STREAM_EXPIRE_MARGIN_SECONDS = 10 * 60

# Flags essenciais para yt-dlp resolver desafios JS e extrair streams funcionais
YTDLP_CMD = [
  "yt-dlp",
  "--no-update",
  "--js-runtimes", "node",
  "--remote-components", "ejs:github",
  "--extractor-args", "youtube:player_client=android,web,tv_embedded,mweb"
]

def video_id_from_url(value: str) -> str | None:
  value = value.strip()
  if not value:
    return None

  direct = re.fullmatch(r"[A-Za-z0-9_-]{11}", value)
  if direct:
    return direct.group(0)

  parsed = urllib.parse.urlparse(value)
  host = parsed.netloc.lower()
  query = urllib.parse.parse_qs(parsed.query)

  if ("youtube.com" in host or "music.youtube.com" in host) and query.get("v"):
    candidate = query["v"][0]
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate):
      return candidate

  if "youtu.be" in host:
    candidate = parsed.path.strip("/").split("/")[0]
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate):
      return candidate

  if "youtube.com" in host and "/shorts/" in parsed.path:
    candidate = parsed.path.split("/shorts/", 1)[1].split("/", 1)[0]
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate):
      return candidate

  if "youtube.com" in host and "/embed/" in parsed.path:
    candidate = parsed.path.split("/embed/", 1)[1].split("/", 1)[0]
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate):
      return candidate

  if "youtube.com" in host and "/live/" in parsed.path:
    candidate = parsed.path.split("/live/", 1)[1].split("/", 1)[0]
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate):
      return candidate

  return None


def parse_duration(value: Any) -> str:
  if not value:
    return "0:00"
  if isinstance(value, str) and ":" in value:
    return value
  try:
    total = int(float(value))
  except (TypeError, ValueError):
    return str(value)
  minutes, seconds = divmod(total, 60)
  hours, minutes = divmod(minutes, 60)
  if hours:
    return f"{hours}:{minutes:02d}:{seconds:02d}"
  return f"{minutes}:{seconds:02d}"


def search_with_ytdlp(query: str) -> list[dict[str, Any]]:
  command = YTDLP_CMD + [
    "--dump-json",
    "--flat-playlist",
    "--playlist-end",
    "15",
    "--no-warnings",
    f"ytsearch15:{query}",
  ]
  completed = subprocess.run(
    command,
    capture_output=True,
    text=True,
    timeout=30,
    check=False,
  )
  if completed.returncode != 0:
    raise RuntimeError(completed.stderr.strip() or "yt-dlp falhou")

  results: list[dict[str, Any]] = []
  for line in completed.stdout.splitlines():
    if not line.strip():
      continue
    try:
      item = json.loads(line)
    except json.JSONDecodeError:
      continue
    video_id = item.get("id") or video_id_from_url(item.get("url") or "")
    if not video_id:
      continue
    results.append({
      "id": video_id,
      "title": item.get("title") or "Video do YouTube",
      "channel": item.get("uploader") or item.get("channel") or "",
      "duration": parse_duration(item.get("duration")),
      "thumbnail": item.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
      "url": f"https://www.youtube.com/watch?v={video_id}",
    })
  return results


def search_with_youtube_html(query: str) -> list[dict[str, Any]]:
  url = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": query})
  request = urllib.request.Request(
    url,
    headers={
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
    },
  )
  with urllib.request.urlopen(request, timeout=15) as response:
    body = response.read().decode("utf-8", errors="ignore")

  seen: set[str] = set()
  results: list[dict[str, Any]] = []
  for match in re.finditer(r'"videoId":"([A-Za-z0-9_-]{11})".{0,700}?"title":\{"runs":\[\{"text":"(.*?)"', body):
    video_id, title = match.groups()
    if video_id in seen:
      continue
    seen.add(video_id)
    results.append({
      "id": video_id,
      "title": html.unescape(title),
      "channel": "",
      "duration": "",
      "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
      "url": f"https://www.youtube.com/watch?v={video_id}",
    })
    if len(results) >= 15:
      break
  return results


def get_video_metadata_oembed(video_id: str) -> dict[str, str]:
  """Busca metadados oficiais (título, autor, thumbnail) via endpoint oEmbed do YouTube."""
  try:
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    req = urllib.request.Request(
      url,
      headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    with urllib.request.urlopen(req, timeout=8) as response:
      data = json.loads(response.read().decode("utf-8"))
      return {
        "title": html.unescape(data.get("title", "")).strip(),
        "channel": html.unescape(data.get("author_name", "")).strip(),
        "thumbnail": data.get("thumbnail_url", f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
      }
  except Exception:
    return {}

def search_youtube(query: str) -> tuple[list[dict[str, Any]], str]:
  try:
    return search_with_ytdlp(query), "yt-dlp"
  except Exception:
    return search_with_youtube_html(query), "youtube-html"


def is_hls_format(fmt: dict[str, Any]) -> bool:
  protocol = str(fmt.get("protocol") or "").lower()
  url = str(fmt.get("url") or "").lower()
  format_id = str(fmt.get("format_id") or "").lower()
  return (
    "m3u8" in protocol or
    "hls" in protocol or
    ".m3u8" in url or
    "/hls_" in url or
    "manifest/hls" in url or
    "hls" in format_id
  )


def stream_quality_key(fmt: dict[str, Any]) -> tuple[int, int, int, int, int]:
  height = int(fmt.get("height") or 0)
  ext = str(fmt.get("ext") or "").lower()
  is_hls = 1 if is_hls_format(fmt) else 0

  # HLS com resolução ótima (1080p > 720p > 480p > 360p)
  if height == 1080:
    target_rank = 5
  elif height == 720:
    target_rank = 4
  elif 720 < height < 1080:
    target_rank = 3
  elif height >= 480:
    target_rank = 2
  elif height > 0:
    target_rank = 1
  else:
    target_rank = 0

  return (
    is_hls,  # HLS prioritário por não sofrer bloqueio 403
    target_rank,
    1 if ext == "mp4" else 0,
    height,
    int(fmt.get("tbr") or 0),
  )


def direct_stream_for(video_id: str, allow_hls: bool = True) -> dict[str, Any]:
  if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
    raise ValueError("ID de vídeo inválido")

  command = YTDLP_CMD + [
    "--dump-single-json",
    "--no-warnings",
    "--no-playlist",
    f"https://www.youtube.com/watch?v={video_id}",
  ]
  completed = subprocess.run(
    command,
    capture_output=True,
    text=True,
    timeout=40,
    check=False,
  )
  if completed.returncode != 0:
    err_text = completed.stderr.strip()
    if "This video is not available" in err_text or "Private video" in err_text:
      raise RuntimeError(f"Este vídeo não está mais disponível no YouTube ({video_id}).")
    raise RuntimeError(err_text or "Não foi possível preparar o vídeo.")

  item = json.loads(completed.stdout)
  formats = item.get("formats") or []

  # Formatos utilizáveis com áudio e vídeo
  usable = [
    fmt for fmt in formats
    if fmt.get("url")
    and (
      (fmt.get("vcodec") != "none" and fmt.get("acodec") != "none")
      or is_hls_format(fmt)
    )
  ]

  # Se permitimos HLS e encontramos HLS, seleciona HLS prioritariamente
  if allow_hls:
    hls_usable = [fmt for fmt in usable if is_hls_format(fmt)]
    if hls_usable:
      usable = hls_usable

  if not usable:
    # Fallback para qualquer formato utilizável
    usable = [fmt for fmt in formats if fmt.get("url") and fmt.get("vcodec") != "none"]

  if not usable and item.get("url"):
    usable = [item]

  if usable:
    usable.sort(key=stream_quality_key, reverse=True)

  stream = usable[0] if usable else {}
  stream_url = stream.get("url")

  if not stream_url:
    raise RuntimeError("O YouTube não liberou um stream compatível para este vídeo.")

  stream_height = int(stream.get("height") or 0)
  if stream_height >= 1080:
    stream_quality = "fullhd" if stream_height == 1080 else "fallback"
  elif stream_height >= 720:
    stream_quality = "hd" if stream_height == 720 else "near-hd"
  else:
    stream_quality = "fallback"

  title = (item.get("title") or "").strip()
  channel = (item.get("uploader") or item.get("channel") or "").strip()
  thumbnail = item.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

  # Se o título estiver vazio ou for genérico, busca via oEmbed oficial
  if not title or title.lower() in ("video do youtube", "vídeo do youtube", "sem título", f"vídeo {video_id}".lower()):
    oembed_meta = get_video_metadata_oembed(video_id)
    if oembed_meta.get("title"):
      title = oembed_meta["title"]
    if not channel and oembed_meta.get("channel"):
      channel = oembed_meta["channel"]
    if oembed_meta.get("thumbnail"):
      thumbnail = oembed_meta["thumbnail"]

  if not title:
    title = f"Vídeo {video_id}"

  return {
    "id": video_id,
    "title": title,
    "channel": channel,
    "duration": parse_duration(item.get("duration")),
    "thumbnail": thumbnail,
    "streamUrl": stream_url,
    "streamExt": stream.get("ext") or ("mp4" if is_hls_format(stream) else ""),
    "streamProtocol": stream.get("protocol") or ("m3u8" if is_hls_format(stream) else ""),
    "streamHeight": stream_height,
    "streamFormatId": stream.get("format_id") or "",
    "streamQuality": stream_quality,
    "webpageUrl": item.get("webpage_url") or f"https://www.youtube.com/watch?v={video_id}",
  }

def saved_stream_is_fresh(video_prepared_at: float, video_stream_url: str, video_stream_height: int = 0, video_stream_quality: str = "") -> bool:
  if not video_stream_url:
    return False

  # Se for URL de proxy local, está sempre fresca
  if video_stream_url.startswith("/api/"):
    return True

  # Verifica o parâmetro expire da URL do Google/YouTube (seja no query string ou no path)
  parsed = urllib.parse.urlparse(video_stream_url)
  expire_value = (urllib.parse.parse_qs(parsed.query).get("expire") or [""])[0]
  if not expire_value and "/expire/" in parsed.path:
    try:
      expire_value = parsed.path.split("/expire/")[1].split("/")[0]
    except Exception:
      expire_value = ""

  try:
    expires_at = float(expire_value)
  except (TypeError, ValueError):
    expires_at = 0
  if expires_at:
    return time.time() < (expires_at - STREAM_EXPIRE_MARGIN_SECONDS)

  try:
    prepared_at = float(video_prepared_at or 0)
  except (TypeError, ValueError):
    return False
  return (time.time() - prepared_at) < STREAM_REFRESH_SECONDS
