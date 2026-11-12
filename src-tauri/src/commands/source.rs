// 服务源检查 Commands
//
// 用户经常把代码仓库地址（GitHub/GitLab/Gitee）当成 MCP 端点粘贴进来。
// 这类地址写进配置只会得到一条永远连不上的条目，所以先探测：
//   1. 是否是代码仓库地址（而非 MCP 端点）
//   2. 该仓库是否已发布到 npm（已发布就能安全地转成 npx 安装）
// 只做只读探测，不下载、不执行任何代码。

use crate::source::{parse_code_repo_url, CodeRepoRef};
use serde::Serialize;

const NPM_REGISTRY: &str = "https://registry.npmjs.org";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoProbe {
    /// 是否是代码仓库地址
    pub is_code_repo: bool,
    /// owner/repo
    pub repo: Option<String>,
    /// 命中的 npm 包名
    pub npm_package: Option<String>,
    /// npm 包最新版本
    pub npm_version: Option<String>,
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("mcpm-source-probe")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// 仓库里某个文件的原始地址（各平台 raw 路径不一样）
pub fn raw_file_url(repo: &CodeRepoRef, file: &str) -> Option<String> {
    Some(match repo.host.as_str() {
        "github.com" => format!(
            "https://raw.githubusercontent.com/{}/{}/HEAD/{}",
            repo.owner, repo.repo, file
        ),
        "gitlab.com" => format!(
            "https://gitlab.com/{}/{}/-/raw/HEAD/{}",
            repo.owner, repo.repo, file
        ),
        "gitee.com" => format!("https://gitee.com/{}/{}/raw/HEAD/{}", repo.owner, repo.repo, file),
        "bitbucket.org" => format!(
            "https://bitbucket.org/{}/{}/raw/HEAD/{}",
            repo.owner, repo.repo, file
        ),
        _ => return None,
    })
}

/// 拉取仓库根目录的 package.json；不存在返回 None
pub async fn fetch_manifest(
    client: &reqwest::Client,
    repo: &CodeRepoRef,
) -> Option<serde_json::Value> {
    let text = fetch_text_file(client, repo, "package.json").await?;
    serde_json::from_str(&text).ok()
}

/// 按纯文本取一个 URL；失败返回 None
async fn get_text(client: &reqwest::Client, url: &str, accept: Option<&str>) -> Option<String> {
    let mut request = client.get(url);
    if let Some(accept) = accept {
        request = request.header("Accept", accept);
    }
    let response = request.send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.text().await.ok()?;
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

/// 拉取仓库根目录的文本文件（package.json / pyproject.toml 这类），不存在返回 None
///
/// raw 域名（raw.githubusercontent.com）在部分网络下会被拦，GitHub 的 contents API
/// 却通常通得过。所以两条路并发跑、谁先拿到用谁：正常情况下 raw 更快（不占 API
/// 限速），raw 被墙时也不会把探测拖成十几秒。
pub async fn fetch_text_file(
    client: &reqwest::Client,
    repo: &CodeRepoRef,
    file: &str,
) -> Option<String> {
    let raw = async {
        match raw_file_url(repo, file) {
            Some(url) => get_text(client, &url, None).await,
            None => None,
        }
    };

    let api = async {
        if repo.host != "github.com" {
            return None;
        }
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            repo.owner, repo.repo, file
        );
        get_text(client, &url, Some("application/vnd.github.raw")).await
    };

    tokio::select! {
        Some(text) = raw => Some(text),
        Some(text) = api => Some(text),
        else => None,
    }
}

/// 读取仓库根目录的 package.json，取出其中的 name / version。
/// 包名来自仓库自己，但仍要和 npm 上的同名包核对，避免撞名。
async fn manifest_package(
    client: &reqwest::Client,
    repo: &CodeRepoRef,
) -> Option<(String, Option<String>)> {
    let value = fetch_manifest(client, repo).await?;
    let name = value.get("name")?.as_str()?.trim();

    if name.is_empty() {
        return None;
    }

    let version = value
        .get("version")
        .and_then(|version| version.as_str())
        .map(|version| version.to_string());

    Some((name.to_string(), version))
}

/// 拉取 npm 包元数据；不存在返回 None
async fn npm_package_doc(client: &reqwest::Client, package: &str) -> Option<serde_json::Value> {
    // scoped 包名需要把 / 编码成 %2F
    let encoded = package.replace('/', "%2F");
    let url = format!("{}/{}", NPM_REGISTRY, encoded);

    let response = client.get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json::<serde_json::Value>().await.ok()
}

fn latest_version(doc: &serde_json::Value) -> Option<String> {
    doc.get("dist-tags")?
        .get("latest")?
        .as_str()
        .map(|version| version.to_string())
}

/// 校验 npm 包声明的仓库地址是否就是当前仓库，避免命中同名但无关的包。
fn package_points_to_repo(doc: &serde_json::Value, repo: &CodeRepoRef) -> bool {
    // repository 可能是字符串，也可能是 { url }
    let raw = match doc.get("repository") {
        Some(serde_json::Value::String(text)) => Some(text.clone()),
        Some(serde_json::Value::Object(map)) => map
            .get("url")
            .and_then(|url| url.as_str())
            .map(|url| url.to_string()),
        _ => None,
    };

    let Some(url) = raw else {
        // 没有声明仓库的包不敢认，宁可不给建议
        return false;
    };

    let normalized = url
        .to_lowercase()
        .replace("git+", "")
        .replace("ssh://git@", "")
        .replace(".git", "");

    normalized.contains(&repo.slug().to_lowercase())
}

/// 判断 npm 上的包是否确实是这个仓库的包。
/// 仓库地址对得上最可靠；有些仓库没写 repository 字段，
/// 此时退一步用版本号核对（同名同版本基本可以确认是同一个项目）。
fn package_belongs_to_repo(
    doc: &serde_json::Value,
    repo: &CodeRepoRef,
    manifest_version: Option<&str>,
) -> bool {
    if package_points_to_repo(doc, repo) {
        return true;
    }

    match (manifest_version, latest_version(doc)) {
        (Some(manifest), Some(published)) => manifest == published,
        _ => false,
    }
}

/// 猜测候选包名。命中与否都要再校验仓库归属，所以多猜几个是安全的。
fn candidate_packages(repo: &CodeRepoRef) -> Vec<String> {
    let slug = repo.slug();
    vec![
        repo.repo.clone(),
        format!("@{}", slug),
        format!("{}-mcp", repo.repo),
        format!("@{}-mcp", slug),
        format!("mcp-server-{}", repo.repo),
        format!("{}-mcp-server", repo.repo),
    ]
}

/// 探测服务源是否是代码仓库地址、以及有没有可用的 npm 包
#[tauri::command]
pub async fn inspect_source(url: String) -> Result<RepoProbe, String> {
    let Some(repo) = parse_code_repo_url(&url) else {
        return Ok(RepoProbe {
            is_code_repo: false,
            repo: None,
            npm_package: None,
            npm_version: None,
        });
    };

    let client = http_client();
    let mut npm_package = None;
    let mut npm_version = None;

    // 第一优先：仓库 package.json 里的 name。
    // 同名不等于同包（例如 hallmark 仓库和 npm 上的 hallmark 完全无关），
    // 所以还要校验仓库归属或版本号，确认后才敢建议 npx 安装。
    if let Some((name, manifest_version)) = manifest_package(&client, &repo).await {
        if let Some(doc) = npm_package_doc(&client, &name).await {
            if let Some(version) = latest_version(&doc) {
                if package_belongs_to_repo(&doc, &repo, manifest_version.as_deref()) {
                    npm_package = Some(name);
                    npm_version = Some(version);
                }
            }
        }
    }

    // 兜底：猜命名，必须校验 repository 指向同一个仓库
    if npm_package.is_none() {
        for candidate in candidate_packages(&repo) {
            let Some(doc) = npm_package_doc(&client, &candidate).await else {
                continue;
            };
            let Some(version) = latest_version(&doc) else {
                continue;
            };
            if package_points_to_repo(&doc, &repo) {
                npm_package = Some(candidate);
                npm_version = Some(version);
                break;
            }
        }
    }

    Ok(RepoProbe {
        is_code_repo: true,
        repo: Some(repo.slug()),
        npm_package,
        npm_version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn repo() -> CodeRepoRef {
        CodeRepoRef {
            host: "github.com".to_string(),
            owner: "upstash".to_string(),
            repo: "context7".to_string(),
        }
    }

    #[test]
    fn accepts_matching_repository_url_forms() {
        for url in [
            "git+https://github.com/upstash/context7.git",
            "https://github.com/Upstash/Context7",
            "ssh://git@github.com/upstash/context7.git",
        ] {
            let doc = json!({ "repository": { "url": url } });
            assert!(package_points_to_repo(&doc, &repo()), "应命中: {url}");
        }
    }

    #[test]
    fn rejects_unrelated_or_undeclared_packages() {
        // 无 repository 字段：不敢认
        let doc = json!({ "dist-tags": { "latest": "1.0.3" } });
        assert!(!package_points_to_repo(&doc, &repo()));

        // 同名但另一个仓库
        let other = json!({ "repository": { "url": "git+https://github.com/someone/context7.git" } });
        assert!(!package_points_to_repo(&other, &repo()));
    }

    #[test]
    fn rejects_same_name_package_from_another_project() {
        // 仓库没写 repository 字段、版本号也对不上（类似 Nutlope/hallmark 撞 npm 上的 hallmark）
        let doc = json!({
            "repository": { "url": "git+https://github.com/vweevers/hallmark.git" },
            "dist-tags": { "latest": "5.0.2" }
        });
        assert!(!package_belongs_to_repo(&doc, &repo(), Some("2.0.0")));

        // 无 repository 但版本号一致：认为是同一个项目
        let no_repo_field = json!({ "dist-tags": { "latest": "2.0.0" } });
        assert!(package_belongs_to_repo(
            &no_repo_field,
            &repo(),
            Some("2.0.0")
        ));

        // 版本无法确认时不敢认
        assert!(!package_belongs_to_repo(&no_repo_field, &repo(), None));
    }

    #[test]
    fn reads_latest_version_from_dist_tags() {
        let doc = json!({ "dist-tags": { "latest": "4.6.0" } });
        assert_eq!(latest_version(&doc), Some("4.6.0".to_string()));
        assert_eq!(latest_version(&json!({})), None);
    }

    #[test]
    fn candidate_list_covers_common_mcp_naming() {
        let candidates = candidate_packages(&repo());
        assert!(candidates.contains(&"context7".to_string()));
        assert!(candidates.contains(&"@upstash/context7-mcp".to_string()));
        assert!(candidates.contains(&"mcp-server-context7".to_string()));
    }

    /// 真实网络验证，默认不跑：cargo test -- --ignored
    #[tokio::test]
    #[ignore = "需要网络，手动执行 cargo test -- --ignored"]
    async fn probes_live_repositories() {
        // 仓库已发布 npm：应该命中，且包名通过仓库归属校验
        let published = inspect_source("https://github.com/upstash/context7".to_string())
            .await
            .unwrap();
        assert!(published.is_code_repo);
        assert_eq!(
            published.npm_package.as_deref(),
            Some("@upstash/context7-mcp")
        );

        // 仓库未发布 npm：是仓库，但没有可用的包
        let unpublished = inspect_source("https://github.com/Cc-Zzh1/moonvy-ui-mcp".to_string())
            .await
            .unwrap();
        assert!(unpublished.is_code_repo);
        assert!(unpublished.npm_package.is_none());

        // 真正的 MCP 端点：不是仓库，不能被拦
        let endpoint = inspect_source("https://mcp.linear.app/sse".to_string())
            .await
            .unwrap();
        assert!(!endpoint.is_code_repo);
    }
}
