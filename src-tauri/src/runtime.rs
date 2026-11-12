use tokio::process::Command;

/// 从 GUI 启动的 .app 只能拿到 `/usr/bin:/bin:/usr/sbin:/sbin`，
/// nvm / fnm / volta / asdf 装的 node 全都不在 PATH 里。
/// 这里把这些目录补上，否则「检测运行时」和「安装依赖」都会失败。
#[cfg(target_os = "macos")]
fn toolchain_dirs(home: &str) -> Vec<String> {
    let mut dirs: Vec<String> = Vec::new();

    // nvm：~/.nvm/versions/node/v22.12.0/bin —— 按版本号倒序，最新的排前面
    let nvm_root = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_root) {
        let mut versions: Vec<String> = entries
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        versions.sort_by(|a, b| version_key(b).cmp(&version_key(a)));
        for version in versions {
            dirs.push(format!("{}/{}/bin", nvm_root, version));
        }
    }

    // fnm
    let fnm_root = format!("{}/.fnm/node-versions", home);
    if let Ok(entries) = std::fs::read_dir(&fnm_root) {
        for entry in entries.flatten() {
            dirs.push(format!("{}/installation/bin", entry.path().to_string_lossy()));
        }
    }

    // asdf / volta / 常见用户级 bin
    dirs.push(format!("{}/.asdf/shims", home));
    dirs.push(format!("{}/.volta/bin", home));
    dirs.push(format!("{}/.local/bin", home));

    dirs
}

/// 把 "v22.12.0" / "v20.9.0" 这类目录名转成可比较的数字序列
#[cfg(target_os = "macos")]
fn version_key(input: &str) -> Vec<u32> {
    input
        .trim_start_matches('v')
        .split(['.', '-'])
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect()
}

pub fn augmented_path() -> String {
    let current_path = std::env::var("PATH").unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_default();

        let mut extra_paths = vec![
            "/opt/homebrew/bin".to_string(),
            "/opt/homebrew/opt/node/bin".to_string(),
            "/usr/local/bin".to_string(),
            "/opt/homebrew/opt/bun/bin".to_string(),
        ];
        extra_paths.extend(toolchain_dirs(&home));
        extra_paths.push(format!("{}/.cargo/bin", home));
        extra_paths.push(format!("{}/.bun/bin", home));

        return format!("{}:{}", extra_paths.join(":"), current_path);
    }

    #[cfg(not(target_os = "macos"))]
    {
        current_path
    }
}

pub fn ensure_runtime_path_env() {
    std::env::set_var("PATH", augmented_path());
}

pub fn apply_runtime_path_to_command(cmd: &mut Command) {
    cmd.env("PATH", augmented_path());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn augmented_path_keeps_existing_entries() {
        std::env::set_var("PATH", "/usr/bin:/bin");
        let path = augmented_path();
        assert!(path.contains("/usr/bin"));
        assert!(path.contains("/bin"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn compares_node_version_dirs_numerically() {
        // 字符串比较会把 v9 排在 v22 后面，数字比较不会
        assert!(version_key("v22.12.0") > version_key("v9.11.2"));
        assert!(version_key("v20.10.0") > version_key("v20.9.0"));
    }
}
