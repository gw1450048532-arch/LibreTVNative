//! LibreTV Native — Tauri 壳核心
//!
//! 两条数据通道：
//! 1. `http_request` / `http_binary` 命令：前端所有 API 请求经 Rust 发出，
//!    彻底规避 WebView 的 CORS 限制（采集站 API 几乎都不带 CORS 头）。
//! 2. `stream://` 自定义协议（Windows/Android 上表现为 http://stream.localhost/）：
//!    媒体流代理，负责给 m3u8/分片/mp4 请求补 Referer 等防盗链头、
//!    透传 Range 支持拖动进度、并把 m3u8 内的分片地址重写为代理地址。
//!    播放源不在 Rust 硬编码，全部由前端在本地配置后按需注册「请求头档案」。

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const PROXY_HOST: &str = "stream.localhost";

// ---------------------------------------------------------------- 通用 HTTP

#[derive(Deserialize, Default)]
pub struct HttpOptions {
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct HttpTextResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

fn build_client(timeout_secs: Option<u64>) -> Result<reqwest::Client, String> {
    let secs = timeout_secs.unwrap_or(20).clamp(1, 120);
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(secs))
        .build()
        .map_err(|e| e.to_string())
}

fn header_map(headers: &Option<HashMap<String, String>>) -> reqwest::header::HeaderMap {
    let mut m = reqwest::header::HeaderMap::new();
    m.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static(UA),
    );
    if let Some(h) = headers {
        for (k, v) in h {
            if let (Ok(name), Ok(value)) = (
                reqwest::header::HeaderName::try_from(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(v),
            ) {
                m.insert(name, value);
            }
        }
    }
    m
}

/// 文本请求：采集站 API（苹果 CMS JSON）、HTML 详情页、订阅 JSON 等
#[tauri::command]
async fn http_request(options: HttpOptions) -> Result<HttpTextResponse, String> {
    let client = build_client(options.timeout_secs)?;
    let method = reqwest::Method::from_bytes(
        options.method.as_deref().unwrap_or("GET").as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    let mut req = client
        .request(method, &options.url)
        .headers(header_map(&options.headers));
    if let Some(body) = options.body {
        req = req.body(body);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in res.headers().iter() {
        if let Ok(s) = v.to_str() {
            headers.insert(k.as_str().to_string(), s.to_string());
        }
    }
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(HttpTextResponse {
        status,
        headers,
        body,
    })
}

/// 二进制请求：封面图等小文件（大文件走 stream:// 协议）
#[tauri::command]
async fn http_binary(options: HttpOptions) -> Result<Response, String> {
    let client = build_client(options.timeout_secs)?;
    let res = client
        .get(&options.url)
        .headers(header_map(&options.headers))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(Response::new(bytes.to_vec()))
}

// ---------------------------------------------------------------- 媒体代理

/// 请求头档案：源 → 该源需要的防盗链请求头（Referer / UA）
type Profiles = HashMap<String, HashMap<String, String>>;
static PROFILES: Lazy<Mutex<Profiles>> = Lazy::new(|| Mutex::new(HashMap::new()));
static PROFILE_SEQ: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));

/// 前端在开始播放/加载封面前调用，登记一组请求头，返回档案 id
#[tauri::command]
fn register_proxy_profile(headers: HashMap<String, String>) -> String {
    let mut seq = PROFILE_SEQ.lock().unwrap();
    *seq += 1;
    let id = format!("p{}", *seq);
    PROFILES.lock().unwrap().insert(id.clone(), headers);
    id
}

fn proxy_url(profile: &str, target: &str) -> String {
    format!(
        "http://{}/{}/{}",
        PROXY_HOST,
        profile,
        urlencoding::encode(target)
    )
}

/// 重写 m3u8 标签行里的 URI="..." 属性（KEY / MAP / MEDIA 等）
fn rewrite_uri_attr(line: &str, base: &url::Url, profile: &str) -> String {
    let mut out = String::with_capacity(line.len() + 128);
    let mut rest: &str = line;
    while let Some(idx) = rest.find("URI=\"") {
        out.push_str(&rest[..idx + 5]);
        let after = &rest[idx + 5..];
        match after.find('"') {
            Some(end) => {
                let uri = &after[..end];
                if uri.contains(PROXY_HOST) {
                    out.push_str(uri);
                } else {
                    let abs = base
                        .join(uri)
                        .map(|u| u.to_string())
                        .unwrap_or_else(|_| uri.to_string());
                    out.push_str(&proxy_url(profile, &abs));
                }
                rest = &after[end..];
            }
            None => break,
        }
    }
    out.push_str(rest);
    out
}

/// m3u8 播放列表重写：分片 / 子播放列表 / KEY / MAP 全部改为走代理
fn rewrite_m3u8(content: &str, base: &url::Url, profile: &str) -> String {
    let mut out: Vec<String> = Vec::with_capacity(64);
    for line in content.lines() {
        let t = line.trim();
        if t.starts_with("#EXT-X-KEY")
            || t.starts_with("#EXT-X-MAP")
            || t.starts_with("#EXT-X-MEDIA")
            || t.starts_with("#EXT-X-SESSION-KEY")
            || t.starts_with("#EXT-X-I-FRAME-STREAM-INF")
        {
            out.push(rewrite_uri_attr(line, base, profile));
        } else if t.starts_with('#') || t.is_empty() {
            out.push(line.to_string());
        } else if t.contains(PROXY_HOST) {
            out.push(line.to_string());
        } else {
            match base.join(t) {
                Ok(u) => out.push(proxy_url(profile, u.as_str())),
                Err(_) => out.push(line.to_string()),
            }
        }
    }
    out.join("\n")
}

fn plain(status: u16, msg: &str) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

async fn handle_stream(
    req_headers: &http::HeaderMap,
    uri: &http::Uri,
) -> http::Response<Vec<u8>> {
    // 路径形如 /{profile}/{urlencode(target)}
    let rest = uri.path().trim_start_matches('/');
    let (profile, encoded) = match rest.split_once('/') {
        Some(v) => v,
        None => return plain(400, "bad proxy path"),
    };
    let target = match urlencoding::decode(encoded) {
        Ok(s) => s.into_owned(),
        Err(_) => return plain(400, "bad encoded target"),
    };
    let profile_headers = {
        let guard = PROFILES.lock().unwrap();
        guard.get(profile).cloned().unwrap_or_default()
    };

    let client = match build_client(Some(30)) {
        Ok(c) => c,
        Err(e) => return plain(500, &e),
    };
    let mut headers = header_map(&Some(profile_headers));
    if let Some(range) = req_headers.get(http::header::RANGE) {
        headers.insert(http::header::RANGE, range.clone());
    }

    let res = match client.get(&target).headers(headers).send().await {
        Ok(r) => r,
        Err(e) => return plain(502, &format!("upstream error: {e}")),
    };
    let status = res.status();
    // 以重定向后的最终 URL 为基准解析分片相对地址
    let final_url = res.url().clone();
    let upstream_headers = res.headers().clone();
    let bytes = match res.bytes().await {
        Ok(b) => b,
        Err(e) => return plain(502, &format!("upstream body error: {e}")),
    };

    let is_m3u8 = upstream_headers
        .get(http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("mpegurl"))
        .unwrap_or(false)
        || target.to_lowercase().contains(".m3u8");

    let mut builder = http::Response::builder()
        .status(status)
        .header("access-control-allow-origin", "*")
        .header("access-control-allow-methods", "GET, OPTIONS")
        .header("access-control-allow-headers", "*")
        .header("cache-control", "no-store")
        .header("accept-ranges", "bytes");

    if is_m3u8 {
        let text = String::from_utf8_lossy(&bytes).into_owned();
        let rewritten = rewrite_m3u8(&text, &final_url, profile);
        return builder
            .header("content-type", "application/vnd.apple.mpegurl")
            .body(rewritten.into_bytes())
            .unwrap();
    }

    // 分片 / mp4 / 图片：透传，保留长度与范围头以支持 seek
    for name in [
        "content-length",
        "content-range",
        "content-type",
        "etag",
        "last-modified",
    ] {
        if let Some(v) = upstream_headers.get(name) {
            builder = builder.header(name, v.clone());
        }
    }
    builder.body(bytes.to_vec()).unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("stream", |_ctx, request, responder| {
            let method = request.method().clone();
            let headers = request.headers().clone();
            let uri = request.uri().clone();
            tauri::async_runtime::spawn(async move {
                let resp = if method == http::Method::OPTIONS {
                    http::Response::builder()
                        .status(204)
                        .header("access-control-allow-origin", "*")
                        .header("access-control-allow-methods", "GET, OPTIONS")
                        .header("access-control-allow-headers", "*")
                        .body(Vec::new())
                        .unwrap()
                } else {
                    handle_stream(&headers, &uri).await
                };
                responder.respond(resp);
            });
        })
        .invoke_handler(tauri::generate_handler![
            http_request,
            http_binary,
            register_proxy_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
