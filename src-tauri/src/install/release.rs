// GitHub Release 预编译包安装
//
// 这是最干净的一条路：下载现成的二进制，校验 sha256，解包落位，全程不执行任何脚本。
// 只支持 GitHub（其他平台的 Release API 形状不同，暂不猜）。

use super::find_executables;
use crate::source::CodeRepoRef;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone)]
pub struct ReleaseAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
    /// GitHub 新版 API 在 assets[].digest 里给出 "sha256:<hex>"
    pub digest: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ReleaseInfo {
    pub tag: String,
    pub asset: ReleaseAsset,
}

fn api_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("mcpm-installer")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// 当前平台希望命中的标记，以及必须排除的标记（避免装上别的架构）
fn arch_tokens() -> (&'static [&'static str], &'static [&'static str]) {
    #[cfg(target_arch = "aarch64")]
    {
        (
            &["aarch64", "arm64", "universal"],
            &["x86_64", "x64", "amd64", "i686", "i386"],
        )
    }
    #[cfg(target_arch = "x86_64")]
    {
        (
            &["x86_64", "x64", "amd64", "universal"],
            &["aarch64", "arm64", "i686", "i386"],
        )
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        (&[], &[])
    }
}

fn os_tokens() -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        &["darwin", "macos", "osx", "apple", "mac-"]
    }
    #[cfg(target_os = "linux")]
    {
        &["linux", "unknown-linux"]
    }
    #[cfg(target_os = "windows")]
    {
        &["windows", "win64", "win32", "pc-windows"]
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        &[]
    }
}

fn other_os_tokens() -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        &["linux", "windows", "win64", "win32"]
    }
    #[cfg(target_os = "linux")]
    {
        &["darwin", "macos", "windows", "win64", "win32"]
    }
    #[cfg(target_os = "windows")]
    {
        &["darwin", "macos", "linux"]
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        &[]
    }
}

/// 给 asset 名称打分：越高越匹配当前平台，负数代表明确不适配
pub fn platform_score(name: &str) -> i32 {
    let lower = name.to_lowercase();

    // 校验文件、签名、文档不是可执行包
    if lower.ends_with(".sha256")
        || lower.ends_with(".sha512")
        || lower.ends_with(".sig")
        || lower.ends_with(".asc")
        || lower.ends_with(".json")
        || lower.ends_with(".md")
        || lower.ends_with(".txt")
    {
        return -100;
    }

    // 别的语言的发行包：装了也跑不起来，交给对应的安装器处理
    if lower.ends_with(".whl")
        || lower.ends_with(".pyz")
        || lower.ends_with(".jar")
        || lower.ends_with(".gem")
        || lower.ends_with(".nupkg")
        || lower.ends_with(".crate")
    {
        return -100;
    }

    let (want_arch, reject_arch) = arch_tokens();
    let os_want = os_tokens();
    let os_reject = other_os_tokens();

    // 明确是别的架构 / 别的系统：直接排除，别装错了跑不起来
    if reject_arch.iter().any(|token| lower.contains(token)) {
        return -100;
    }
    if os_reject.iter().any(|token| lower.contains(token)) {
        return -100;
    }

    let mut score = 0;

    let arch_hit = if want_arch.iter().any(|token| lower.contains(token)) {
        score += 10;
        true
    } else {
        false
    };

    // "universal" 同时属于架构标记，命中就当架构已覆盖
    if lower.contains("universal") {
        score += 2;
    }

    let os_hit = if os_want.iter().any(|token| lower.contains(token)) {
        score += 10;
        true
    } else {
        false
    };

    // 是压缩包更好处理
    if lower.ends_with(".tar.gz")
        || lower.ends_with(".tgz")
        || lower.ends_with(".tar.xz")
        || lower.ends_with(".zip")
        || lower.ends_with(".tar.bz2")
    {
        score += 3;
    }

    // 既没架构也没系统标记：给个负数哨兵值。它仍是候选（唯一候选时可用），
    // 但绝不能盖过任何带平台标记的包，也不能在有多候选时被选中。
    if !arch_hit && !os_hit && !lower.contains("universal") {
        return -1;
    }

    score
}

/// 从 manifest 的 assets 里挑最匹配当前平台的那个
pub fn pick_asset(assets: &[ReleaseAsset]) -> Option<ReleaseAsset> {
    // 只要这个 Release 发了 wheel，它就是 Python 项目。哪怕旁边还躺着一个
    // `<name>-<ver>.tar.gz`（Python sdist），也不能当二进制包处理——
    // 装了也起不来，应该交给 Python 安装器。
    if assets
        .iter()
        .any(|asset| asset.name.to_lowercase().ends_with(".whl"))
    {
        return None;
    }

    let mut scored: Vec<(i32, &ReleaseAsset)> = assets
        .iter()
        .map(|asset| (platform_score(&asset.name), asset))
        .filter(|(score, _)| *score > -100)
        .collect();

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    let best = scored[0];

    // 最高分是 0 说明所有 asset 都没有平台标记（比如只有一个裸二进制）。
    // 只有在这种情况下唯一候选才可信，多候选说明确实分不清，宁可不装。
    if best.0 <= 0 && scored.len() > 1 {
        return None;
    }

    Some(best.1.clone())
}

/// 查询最新 Release；Ok(None) 表示仓库没有 Release
pub async fn probe(repo: &CodeRepoRef) -> Result<Option<ReleaseInfo>, String> {
    if repo.host != "github.com" {
        return Ok(None);
    }

    let client = api_client();
    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        repo.owner, repo.repo
    );

    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("查询 Release 失败: {e}"))?;

    let status = response.status();
    if status.as_u16() == 404 {
        return Ok(None);
    }
    if status.as_u16() == 403 || status.as_u16() == 429 {
        return Err("GitHub API 触发限流，请稍后再试".to_string());
    }
    if !status.is_success() {
        return Err(format!("查询 Release 失败: HTTP {status}"));
    }

    let doc: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 Release 失败: {e}"))?;

    let tag = doc
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    let assets: Vec<ReleaseAsset> = doc
        .get("assets")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(ReleaseAsset {
                        name: item.get("name")?.as_str()?.to_string(),
                        url: item.get("browser_download_url")?.as_str()?.to_string(),
                        size: item.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
                        digest: item
                            .get("digest")
                            .and_then(|v| v.as_str())
                            .map(|v| v.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let Some(asset) = pick_asset(&assets) else {
        return Ok(None);
    };

    Ok(Some(ReleaseInfo { tag, asset }))
}

/// 下载并校验。返回落盘路径。
pub async fn download(asset: &ReleaseAsset, dest: &Path) -> Result<(), String> {
    let client = api_client();
    let mut response = client
        .get(&asset.url)
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载失败: HTTP {}", response.status()));
    }

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("创建文件失败: {e}"))?;
    let mut hasher = Sha256::new();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("读取下载流失败: {e}"))?
    {
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败: {e}"))?;
    }

    file.flush().await.map_err(|e| format!("写入文件失败: {e}"))?;
    drop(file);

    if let Some(expected) = asset.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            // 校验不过就别留下可疑文件
            let _ = tokio::fs::remove_file(dest).await;
            return Err(format!(
                "sha256 校验失败（期望 {expected}，实际 {actual}），已删除下载的文件"
            ));
        }
    }

    Ok(())
}

/// 解包到 dest；裸二进制直接拷贝进去
pub async fn extract(archive: &Path, dest: &Path) -> Result<(), String> {
    tokio::fs::create_dir_all(dest)
        .await
        .map_err(|e| format!("创建解包目录失败: {e}"))?;

    let name = archive
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let lower = name.as_str();
    let is_tar = lower.ends_with(".tar.gz")
        || lower.ends_with(".tgz")
        || lower.ends_with(".tar.xz")
        || lower.ends_with(".tar.bz2")
        || lower.ends_with(".tar");

    let result = if is_tar {
        run_command("tar", &["-xf", &archive.to_string_lossy(), "-C", &dest.to_string_lossy()]).await
    } else if lower.ends_with(".zip") {
        run_command(
            "unzip",
            &["-o", "-q", &archive.to_string_lossy(), "-d", &dest.to_string_lossy()],
        )
        .await
    } else {
        // 不是压缩包：当成裸可执行文件
        let target = dest.join(archive.file_name().unwrap_or_default());
        tokio::fs::copy(archive, &target)
            .await
            .map_err(|e| format!("拷贝文件失败: {e}"))?;
        make_executable(&target);
        Ok(())
    };

    result.map_err(|e| format!("解包失败: {e}"))
}

async fn run_command(program: &str, args: &[&str]) -> Result<(), String> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args);
    crate::runtime::apply_runtime_path_to_command(&mut cmd);

    let output = cmd.output().await.map_err(|e| format!("执行 {program} 失败: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{program} 退出码 {:?}: {}", output.status.code(), stderr.trim()));
    }
    Ok(())
}

pub fn make_executable(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o755);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

/// 从解包结果里定位真正要执行的二进制
pub fn locate_binary(root: &Path, repo_name: &str) -> Option<PathBuf> {
    let candidates = find_executables(root, 4);
    if candidates.is_empty() {
        return None;
    }
    if candidates.len() == 1 {
        return candidates.into_iter().next();
    }

    // 优先名字里带仓库名的那个
    let needle = repo_name.to_lowercase().replace('_', "-");
    let mut best: Option<(usize, PathBuf)> = None;
    for path in candidates {
        let stem = path
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase().replace('_', "-"))
            .unwrap_or_default();
        let score = if stem == needle {
            100
        } else if stem.contains(&needle) || needle.contains(&stem) {
            50
        } else {
            0
        };
        if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
            best = Some((score, path));
        }
    }

    best.map(|(_, path)| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> ReleaseAsset {
        ReleaseAsset {
            name: name.to_string(),
            url: format!("https://example.com/{name}"),
            size: 1,
            digest: None,
        }
    }

    /// 当前编译目标的平台标记，与 platform_score 使用的词表一致
    fn host_tag() -> &'static str {
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => "darwin-arm64",
            ("macos", "x86_64") => "darwin-x64",
            ("linux", "aarch64") => "linux-arm64",
            ("linux", "x86_64") => "linux-x64",
            ("windows", "aarch64") => "windows-arm64",
            ("windows", "x86_64") => "windows-x64",
            _ => "unknown",
        }
    }

    #[test]
    fn picks_current_platform_asset() {
        // 只应命中当前平台的包，其它平台的包不能盖过它
        let host = format!("tool-{}.tar.gz", host_tag());
        let assets = vec![
            asset("tool-linux-x64.tar.gz"),
            asset("tool-darwin-arm64.tar.gz"),
            asset("tool-windows-x64.zip"),
            asset(&host),
            asset(&format!("{host}.sha256")),
        ];
        let picked = pick_asset(&assets).unwrap();
        assert_eq!(picked.name, host);
    }

    #[test]
    fn rejects_checksum_and_signature_files() {
        assert_eq!(platform_score("x-darwin-aarch64.tar.gz.sha256"), -100);
        assert_eq!(platform_score("x-darwin-aarch64.sig"), -100);
        assert_eq!(platform_score("RELEASE.md"), -100);
    }

    #[test]
    fn rejects_other_language_packages() {
        // Python wheel / sdist 不是本机可执行文件，别当成 Release 装
        assert_eq!(platform_score("lanhu_mcp_server-1.8.7-py3-none-any.whl"), -100);
        assert_eq!(platform_score("tool.jar"), -100);
    }

    #[test]
    fn ignores_python_only_release() {
        // lanhu-mcp 的 Release 只有 wheel 和 sdist，必须判定为「没有可用资产」
        let assets = vec![
            asset("lanhu_mcp_server-1.8.7-py3-none-any.whl"),
            asset("lanhu_mcp_server-1.8.7.tar.gz"),
        ];
        assert!(pick_asset(&assets).is_none());
    }

    #[test]
    fn rejects_other_architectures() {
        // 其它架构 / 其它平台的包，分数必须低于当前平台的同款
        let host = format!("tool-{}.tar.gz", host_tag());
        let host_score = platform_score(&host);
        assert!(host_score > 0, "{host} 应当被当前平台命中");
        for other in [
            "tool-linux-x64.tar.gz",
            "tool-linux-arm64.tar.gz",
            "tool-darwin-x64.tar.gz",
            "tool-darwin-arm64.tar.gz",
            "tool-windows-x64.zip",
            "tool-windows-arm64.zip",
        ] {
            if other == host {
                continue;
            }
            assert!(
                platform_score(other) < host_score,
                "{other} 不应高于当前平台包 {host}"
            );
        }
    }

    #[test]
    fn refuses_to_guess_when_several_untagged_assets() {
        // 多个 asset 都没有平台标记 = 分不清，宁可不装
        let assets = vec![asset("a.zip"), asset("b.zip")];
        assert!(pick_asset(&assets).is_none());
    }

    #[test]
    fn accepts_single_untagged_asset() {
        let assets = vec![asset("tool.tar.gz")];
        assert_eq!(pick_asset(&assets).unwrap().name, "tool.tar.gz");
    }
}
